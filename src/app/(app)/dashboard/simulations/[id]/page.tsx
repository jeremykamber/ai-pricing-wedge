'use client'

import { use, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import { useRouter } from 'next/navigation'
import { getSimulationResultAction } from '@/actions/getSimulationResult'
import { getProgressAction } from '@/actions/getProgress'
import { StepIndicator } from '@/components/custom/StepIndicator'
import { ArrowLeftIcon, ClockIcon, CheckCircleIcon, XCircleIcon, ThumbsUpIcon, ThumbsDownIcon, AlertTriangleIcon } from 'lucide-react'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { MajorFinding } from '@/domain/entities/MajorFinding'

const ANALYSIS_STEPS = [
  { title: 'Starting', description: 'Initializing analysis' },
  { title: 'Capturing', description: 'Loading the artifact' },
  { title: 'Analyzing', description: 'Simulating persona responses' },
]

function getCurrentStep(step?: string): number {
  if (!step || step === 'STARTING') return 0
  if (step === 'INTAKE') return 1
  if (step === 'ANALYZING') return 2
  return 0
}

export default function SimulationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const simulation = useSimulationStore((s) => s.getSimulation(id))
  const updateSimulation = useSimulationStore((s) => s.updateSimulation)
  const removeSimulation = useSimulationStore((s) => s.removeSimulation)
  const [isHydrated, setIsHydrated] = useState(false)

  // Zustand persist hydrates from localStorage on the client after mount.
  // During SSR there's no localStorage → store is always empty → getSimulation
  // returns undefined. Without hydration tracking, the server renders the
  // "not found" fallback while the client (after rehydration) renders the
  // full content, causing Next.js hydration mismatch.
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Reconnection: when the page loads and the simulation is IN_PROGRESS,
  // the server-side IIFE is still running (from the original server action).
  // Poll the server-side result store to catch results that were computed
  // after the client disconnected (reload/navigate away).
  useEffect(() => {
    if (!isHydrated || !simulation || simulation.status !== 'IN_PROGRESS') return
    console.log(`[DETAIL_POLL] Starting result poll for ${simulation.id}`)

    let active = true
    let attempts = 0
    const MAX_ATTEMPTS = 300 // 5 minutes at 1s intervals

    const poll = async () => {
      while (active && attempts < MAX_ATTEMPTS) {
        attempts++
        try {
          const result = await getSimulationResultAction(simulation.id)
          if (!active) return

          if (result.found) {
            console.log(`[DETAIL_POLL] ${simulation.id}: RESULT FOUND on attempt ${attempts}`)
            if (result.error) {
              useSimulationStore.getState().markError(simulation.id, result.error)
            } else if (result.analyses && result.analyses.length > 0) {
              useSimulationStore.getState().markComplete(simulation.id, result.analyses)
            }
            return
          }
        } catch {
          // Poller error — retry on next interval
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      console.log(`[DETAIL_POLL] ${simulation.id}: Exhausted ${MAX_ATTEMPTS} attempts without finding result`)
    }

    poll()
    return () => { active = false }
  }, [isHydrated, simulation?.id, simulation?.status])

  // Progress polling: when the simulation is IN_PROGRESS and the RSC stream
  // may have disconnected (navigation), poll the server-side progress store
  // for intermediate updates (currentStep, completedAnalyses) and detection
  // of completion. This complements the result polling above.
  useEffect(() => {
    if (!isHydrated || !simulation || simulation.status !== 'IN_PROGRESS') return
    console.log(`[DETAIL_POLL] Starting progress poll for ${simulation.id}`)

    const interval = setInterval(async () => {
      try {
        const result = await getProgressAction(simulation.id);
        if (!result.found || !result.progress) return;

        const p = result.progress;
        const updates: Partial<import('@/domain/entities/Simulation').Simulation> = {};

        if (p.step) updates.currentStep = p.step as any;
        if (p.completedAnalyses !== undefined) updates.completedAnalyses = p.completedAnalyses;
        if (p.totalAnalyses !== undefined) updates.totalAnalyses = p.totalAnalyses;

        if (Object.keys(updates).length > 0) {
          useSimulationStore.getState().updateSimulation(simulation.id, updates);
        }

        if (p.hasCompleted) {
          clearInterval(interval);
          const result2 = await getSimulationResultAction(simulation.id);
          if (result2.found && result2.analyses && result2.analyses.length > 0) {
            useSimulationStore.getState().markComplete(simulation.id, result2.analyses);
          }
        }

        if (p.error) {
          clearInterval(interval);
          useSimulationStore.getState().markError(simulation.id, p.error);
        }
      } catch {
        // Poller error — retry on next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isHydrated, simulation?.id, simulation?.status])

  if (!isHydrated) {
    return (
      <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">← Simulations</span>
        </div>
        <div className="flex items-center justify-center py-32">
          <p className="text-muted-foreground text-sm">Loading simulation...</p>
        </div>
      </div>
    )
  }

  if (!simulation) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <XCircleIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Simulation not found</h2>
        <p className="text-muted-foreground text-sm mb-6">This simulation may have been removed or never existed.</p>
        <button
          onClick={() => router.push('/dashboard/simulations')}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Back to Simulations
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/simulations')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Simulations
        </button>
      </div>

      {/* Title area */}
      <div className="flex flex-col gap-2 border-b border-border/40 pb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{simulation.name}</h1>
          <StatusBadge status={simulation.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {simulation.url} · {simulation.personaCount} personas
          {simulation.batchName && ` · Batch: ${simulation.batchName}`}
          {simulation.createdAt && ` · Started ${new Date(simulation.createdAt).toLocaleString()}`}
        </p>
        {simulation.error && (
          <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md mt-2">{simulation.error}</p>
        )}
      </div>

      {/* Content */}
      {simulation.status === 'IN_PROGRESS' ? (
        <InProgressView
          simulation={simulation}
          onUpdate={(updates) => updateSimulation(id, updates)}
        />
      ) : simulation.status === 'COMPLETED' ? (
        <CompletedView simulation={simulation} onRemove={() => removeSimulation(id)} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Simulation was {simulation.status.toLowerCase()}.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Run New Simulation
          </button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string; icon: typeof ClockIcon }> = {
    IN_PROGRESS: { label: 'In Progress', class: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: ClockIcon },
    COMPLETED: { label: 'Completed', class: 'text-green-500 bg-green-500/10 border-green-500/20', icon: CheckCircleIcon },
    ERROR: { label: 'Error', class: 'text-destructive bg-destructive/10 border-destructive/20', icon: XCircleIcon },
    CANCELLED: { label: 'Cancelled', class: 'text-muted-foreground bg-muted/30 border-muted/40', icon: XCircleIcon },
  }
  const c = config[status] || config.CANCELLED
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${c.class}`}>
      <Icon className="h-3.5 w-3.5" />
      {c.label}
      {status === 'IN_PROGRESS' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
    </span>
  )
}

function InProgressView({
  simulation,
  onUpdate,
}: {
  simulation: import('@/domain/entities/Simulation').Simulation
  onUpdate: (updates: Partial<import('@/domain/entities/Simulation').Simulation>) => void
}) {
  const currentStep = getCurrentStep(simulation.currentStep)

  return (
    <div className="flex flex-col md:flex-row gap-12 py-4">
      <div className="flex-shrink-0 w-full md:w-56 border-r-0 md:border-r border-border/40 pr-0 md:pr-8">
        <StepIndicator steps={ANALYSIS_STEPS} currentStep={currentStep} />
      </div>

      <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center space-y-4 w-full max-w-lg">
          <p className="text-sm font-medium text-muted-foreground animate-pulse">
            {simulation.currentStep === 'INTAKE' && 'Loading artifact...'}
            {simulation.currentStep === 'ANALYZING' &&
              `Gathering responses (${simulation.completedAnalyses ?? 0}/${simulation.totalAnalyses ?? simulation.personaCount})`}
            {(!simulation.currentStep || simulation.currentStep === 'STARTING') && 'Initializing...'}
          </p>

          {simulation.screenshot && (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${simulation.screenshot}`}
                alt="AI Agent View"
                className="w-full h-full object-cover object-top opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent flex items-end justify-center pb-2 pointer-events-none">
                <span className="text-[10px] font-mono text-muted-foreground px-2 py-1 rounded-md bg-muted/80 border border-border">
                  LIVE AGENT VISION
                </span>
              </div>
            </div>
          )}

          {!simulation.screenshot && (
            <div className="w-full max-w-sm">
              <div className="w-full h-1 bg-muted rounded-sm overflow-hidden">
                <div className="h-full bg-primary rounded-sm w-1/3 animate-[loading-bar_2s_ease-in-out_infinite]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PersonaIdentityCard({
  profile,
}: {
  profile: import('@/domain/entities/PersonaProfile').PersonaProfile
}) {
  const sections = [
    {
      label: 'Values',
      content: (
        <div className="flex flex-wrap gap-1.5">
          {profile.values.map((v, i) => (
            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">{v}</span>
          ))}
        </div>
      ),
    },
    {
      label: 'Fears',
      content: (
        <div className="flex flex-wrap gap-1.5">
          {profile.fears.map((f, i) => (
            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-destructive/10 text-destructive border border-destructive/20">{f}</span>
          ))}
        </div>
      ),
    },
    {
      label: 'Communication',
      content: <span className="text-xs text-foreground/80 uppercase">{profile.communicationStyle}</span>,
    },
    {
      label: 'Decision Style',
      content: <span className="text-xs text-foreground/80 uppercase">{profile.decisionStyle}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-3 border-t border-border/40 pt-4">
      {sections.map((s, i) => (
        <div key={s.label}>
          {i > 0 && <hr className="border-border/20 mb-3" />}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/80">{s.label}</span>
            {s.content}
          </div>
        </div>
      ))}
    </div>
  )
}

function parseStructuredThoughts(thoughts: string): {
  good: string | null;
  bad: string | null;
  dealbreaker: string | null;
  remaining: string;
} {
  const parts = {
    good: null as string | null,
    bad: null as string | null,
    dealbreaker: null as string | null,
    remaining: thoughts,
  };

  const goodMatch = thoughts.match(/\[The Good\]([\s\S]*?)(?=\[The Bad\]|\[The Dealbreaker\]|$)/);
  const badMatch = thoughts.match(/\[The Bad\]([\s\S]*?)(?=\[The Good\]|\[The Dealbreaker\]|$)/);
  const dealbreakerMatch = thoughts.match(/\[The Dealbreaker\]([\s\S]*?)(?=\[The Good\]|\[The Bad\]|$)/);

  if (goodMatch) {
    parts.good = goodMatch[1].trim();
    parts.remaining = parts.remaining.replace(goodMatch[0], '').trim();
  }
  if (badMatch) {
    parts.bad = badMatch[1].trim();
    parts.remaining = parts.remaining.replace(badMatch[0], '').trim();
  }
  if (dealbreakerMatch) {
    parts.dealbreaker = dealbreakerMatch[1].trim();
    parts.remaining = parts.remaining.replace(dealbreakerMatch[0], '').trim();
  }

  parts.remaining = parts.remaining.replace(/\[The Good\]|\[The Bad\]|\[The Dealbreaker\]/g, '').trim();

  return parts;
}

function CompletedView({
  simulation,
  onRemove,
}: {
  simulation: import('@/domain/entities/Simulation').Simulation
  onRemove: () => void
}) {
  const analyses = simulation.analyses as PersonaResponse[] | undefined

  if (!analyses || analyses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">No analysis data available for this simulation.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6">
        {analyses.map((analysis, index) => {
          const personaName = analysis.personaProfile?.name ?? `Persona ${index + 1}`

          return (
          <div
            key={analysis.id}
            className="rounded-lg border border-border bg-card p-6 flex flex-col gap-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{personaName}</h3>
                {analysis.personaProfile && (
                  <p className="text-sm text-muted-foreground">
                    {analysis.personaProfile.name} · {analysis.personaProfile.occupation}
                  </p>
                )}
              </div>
            </div>

            {analysis.personaProfile && <PersonaIdentityCard profile={analysis.personaProfile} />}

            {/* Overview */}
            {analysis.overview && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Overview</span>
                <p className="text-sm text-foreground/80 leading-relaxed">{analysis.overview}</p>
              </div>
            )}

            {/* Customer Journey */}
            {analysis.customerJourney.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer Journey</p>
                <div className="flex flex-col gap-2">
                  {analysis.customerJourney.map((stage) => (
                    <div key={stage.stage} className="rounded-lg border border-border bg-card/50 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`h-2 w-2 rounded-full ${
                          stage.outcome === 'succeeded' ? 'bg-green-500' : stage.outcome === 'blocked' ? 'bg-amber-500' : 'bg-red-500'
                        }`} />
                        <span className="text-xs font-semibold uppercase tracking-wider">
                          {stage.stage}
                        </span>
                        {stage.sentiment === 'positive' && <ThumbsUpIcon className="h-3 w-3 text-green-500" />}
                        {stage.sentiment === 'negative' && <ThumbsDownIcon className="h-3 w-3 text-red-500" />}
                      </div>
                      <p className="text-sm text-foreground/80">{stage.description}</p>
                      {stage.transition && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{stage.transition}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Research Question Answer */}
            {analysis.researchQuestionAnswer && (
              <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 block">Research Question</span>
                <p className="text-sm text-foreground/80">{analysis.researchQuestionAnswer}</p>
              </div>
            )}

            {/* Major Findings */}
            {analysis.majorFindings.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Major Findings</p>
                {analysis.majorFindings.map((finding: MajorFinding, i: number) => (
                  <div key={i} className="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{finding.observation}</p>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                        finding.confidence === 'High' ? 'bg-green-500/10 text-green-600 border border-green-500/20' :
                        finding.confidence === 'Medium' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                        'bg-red-500/10 text-red-600 border border-red-500/20'
                      }`}>
                        {finding.confidence}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Evidence:</span> {finding.evidence}</p>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Impact:</span> {finding.impact}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Points of Friction */}
            {analysis.pointsOfFriction.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Points of Friction</p>
                <ul className="list-disc list-inside text-sm text-foreground/80">
                  {analysis.pointsOfFriction.map((f: string, i: number) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}

            {/* Unanswered Questions */}
            {analysis.unansweredQuestions.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unanswered Questions</p>
                <ul className="list-disc list-inside text-sm text-foreground/80">
                  {analysis.unansweredQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
          </div>
          )
        })}
      </div>

      {simulation.screenshot && (
        <div className="rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${simulation.screenshot}`}
            alt="Captured page"
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}
