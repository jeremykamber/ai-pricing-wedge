'use client'

import { use, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { useRouter } from 'next/navigation'
import { getAnalysisResultAction } from '@/actions/getAnalysisResult'
import { getProgressAction } from '@/actions/getProgress'
import { StepIndicator } from '@/components/custom/StepIndicator'
import { ArrowLeftIcon, ClockIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ChevronDownIcon, ChevronRightIcon, UsersIcon, MessageCircleIcon, DownloadIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { exportAnalysisAsPdf } from '@/lib/exportPdf'
import type { Persona } from '@/domain/entities/Persona'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { MajorFinding } from '@/domain/entities/MajorFinding'
import type { StageSentiment, StageOutcome } from '@/domain/entities/StageJourney'
import { computeSynthesis } from '@/ui/dashboard/utils/computeSynthesis'
import { resolveChatPersona } from '@/ui/dashboard/utils/resolveChatPersona'
import { PersonaChat } from '@/ui/dashboard/components/chat/PersonaChat'
import { PanelChat } from '@/ui/dashboard/components/chat/PanelChat'
import { InlineRenamable } from '@/components/custom/InlineRenamable'

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

// Journey dots encode how the persona FELT at each stage; the outcome badge
// encodes whether they progressed. Two separate axes — a persona can stop with
// positive feelings, so color alone would mislead.
const SENTIMENT_DOT: Record<StageSentiment, string> = {
  positive: 'bg-green-500',
  neutral: 'bg-amber-500',
  negative: 'bg-red-500',
}

const OUTCOME_META: Record<StageOutcome, { label: string; icon: typeof CheckCircleIcon; className: string }> = {
  succeeded: { label: 'Passed', icon: CheckCircleIcon, className: 'text-green-600 bg-green-500/10 border-green-500/20' },
  blocked: { label: 'Blocked', icon: AlertTriangleIcon, className: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
  stopped: { label: 'Stopped', icon: XCircleIcon, className: 'text-red-600 bg-red-500/10 border-red-500/20' },
}

function StageOutcomeBadge({ outcome }: { outcome: StageOutcome }) {
  const meta = OUTCOME_META[outcome]
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border ${meta.className}`}>
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  )
}

export default function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const analysis = useAnalysisStore((s) => s.getAnalysis(id))
  const updateAnalysis = useAnalysisStore((s) => s.updateAnalysis)
  const removeAnalysis = useAnalysisStore((s) => s.removeAnalysis)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleExportPdf = async () => {
    if (isExporting || !analysis) return
    setIsExporting(true)
    try {
      await exportAnalysisAsPdf(analysis)
      toast.success('PDF report downloaded')
    } catch (err) {
      console.error('Failed to export PDF:', err)
      toast.error('Failed to generate PDF report. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }
  // During SSR there's no localStorage → store is always empty → getAnalysis
  // returns undefined. Without hydration tracking, the server renders the
  // "not found" fallback while the client (after rehydration) renders the
  // full content, causing Next.js hydration mismatch.
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Reconnection: when the page loads and the analysis is IN_PROGRESS,
  // the server-side IIFE is still running (from the original server action).
  // Poll the server-side result store to catch results that were computed
  // after the client disconnected (reload/navigate away).
  useEffect(() => {
    if (!isHydrated || !analysis || analysis.status !== 'IN_PROGRESS') return
    console.log(`[DETAIL_POLL] Starting result poll for ${analysis.id}`)

    let active = true
    let attempts = 0
    const MAX_ATTEMPTS = 600 // 10 minutes at 1s intervals (6-persona analysis takes ~15 min)

    const poll = async () => {
      while (active && attempts < MAX_ATTEMPTS) {
        attempts++
        try {
          const result = await getAnalysisResultAction(analysis.id)
          if (!active) return

          if (result.found) {
            console.log(`[DETAIL_POLL] ${analysis.id}: RESULT FOUND on attempt ${attempts}`)
            if (result.error) {
              useAnalysisStore.getState().markError(analysis.id, result.error)
            } else if (result.analyses && result.analyses.length > 0) {
              useAnalysisStore.getState().markComplete(analysis.id, result.analyses)
            }
            return
          }
        } catch {
          // Poller error — retry on next interval
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      console.log(`[DETAIL_POLL] ${analysis.id}: Exhausted ${MAX_ATTEMPTS} attempts without finding result`)
    }

    poll()
    return () => { active = false }
  }, [isHydrated, analysis?.id, analysis?.status])

  // Progress polling: when the analysis is IN_PROGRESS and the RSC stream
  // may have disconnected (navigation), poll the server-side progress store
  // for intermediate updates (currentStep, completedResponses) and detection
  // of completion. This complements the result polling above.
  useEffect(() => {
    if (!isHydrated || !analysis || analysis.status !== 'IN_PROGRESS') return
    console.log(`[DETAIL_POLL] Starting progress poll for ${analysis.id}`)

    const interval = setInterval(async () => {
      try {
        const result = await getProgressAction(analysis.id);
        if (!result.found || !result.progress) return;

        const p = result.progress;
        const updates: Partial<import('@/domain/entities/ArtifactAnalysis').ArtifactAnalysis> = {};

        if (p.step) updates.currentStep = p.step as any;
        if (p.completedResponses !== undefined) updates.completedResponses = p.completedResponses;
        if (p.totalResponses !== undefined) updates.totalResponses = p.totalResponses;

        if (Object.keys(updates).length > 0) {
          useAnalysisStore.getState().updateAnalysis(analysis.id, updates);
        }

        if (p.hasCompleted) {
          clearInterval(interval);
          const result2 = await getAnalysisResultAction(analysis.id);
          if (result2.found && result2.analyses && result2.analyses.length > 0) {
            useAnalysisStore.getState().markComplete(analysis.id, result2.analyses);
          }
        }

        if (p.error) {
          clearInterval(interval);
          useAnalysisStore.getState().markError(analysis.id, p.error);
        }
      } catch {
        // Poller error — retry on next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isHydrated, analysis?.id, analysis?.status])

  if (!isHydrated) {
    return (
      <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">← Analyses</span>
        </div>
        <div className="flex items-center justify-center py-32">
          <p className="text-muted-foreground text-sm">Loading analysis...</p>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <XCircleIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Analysis not found</h2>
        <p className="text-muted-foreground text-sm mb-6">This analysis may have been removed or never existed.</p>
        <button
          onClick={() => router.push('/dashboard/analyses')}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Back to Analyses
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/analyses')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Analyses
        </button>
      </div>

      {/* Title area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <InlineRenamable
              value={analysis.name}
              onRename={(name) => updateAnalysis(analysis.id, { name })}
              className="text-2xl"
            />
            <StatusBadge status={analysis.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {analysis.url} · {analysis.personaCount} personas
            {analysis.batchName && ` · Batch: ${analysis.batchName}`}
            {analysis.createdAt && ` · Started ${new Date(analysis.createdAt).toLocaleString()}`}
          </p>
          {analysis.error && (
            <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md mt-2">{analysis.error}</p>
          )}
        </div>

        {analysis.status === 'COMPLETED' && (
          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-secondary px-4 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed border border-border/60 shadow-xs"
            >
              {isExporting ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadIcon className="h-3.5 w-3.5" />
              )}
              {isExporting ? 'Generating PDF...' : 'Download PDF Report'}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {analysis.status === 'IN_PROGRESS' ? (
        <InProgressView
          analysis={analysis}
          onUpdate={(updates) => updateAnalysis(id, updates)}
        />
      ) : analysis.status === 'COMPLETED' ? (
        <CompletedView analysis={analysis} onRemove={() => removeAnalysis(id)} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Analysis was {analysis.status.toLowerCase()}.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Run New Analysis
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
  analysis,
  onUpdate,
}: {
  analysis: import('@/domain/entities/ArtifactAnalysis').ArtifactAnalysis
  onUpdate: (updates: Partial<import('@/domain/entities/ArtifactAnalysis').ArtifactAnalysis>) => void
}) {
  const currentStep = getCurrentStep(analysis.currentStep)

  return (
    <div className="flex flex-col md:flex-row gap-12 py-4">
      <div className="flex-shrink-0 w-full md:w-56 border-r-0 md:border-r border-border/40 pr-0 md:pr-8">
        <StepIndicator steps={ANALYSIS_STEPS} currentStep={currentStep} />
      </div>

      <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center space-y-4 w-full max-w-lg">
          <p className="text-sm font-medium text-muted-foreground animate-pulse">
            {analysis.currentStep === 'INTAKE' && 'Loading artifact...'}
            {analysis.currentStep === 'ANALYZING' &&
              `Gathering responses (${analysis.completedResponses ?? 0}/${analysis.totalResponses ?? analysis.personaCount})`}
            {(!analysis.currentStep || analysis.currentStep === 'STARTING') && 'Initializing...'}
          </p>

          {analysis.screenshot && (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${analysis.screenshot}`}
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

          {!analysis.screenshot && (
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
  analysis,
  onRemove,
}: {
  analysis: import('@/domain/entities/ArtifactAnalysis').ArtifactAnalysis
  onRemove: () => void
}) {
  const analyses = analysis.responses as PersonaResponse[] | undefined
  const [expandedPersonas, setExpandedPersonas] = useState<Set<number>>(new Set())
  const [chatTarget, setChatTarget] = useState<{ persona: Persona; analysis: PersonaResponse } | null>(null)
  const [isPanelChatOpen, setIsPanelChatOpen] = useState(false)
  const batches = usePersonaStore((s) => s.batches)

  const synthesis = useMemo(
    () => {
      if (analysis.synthesis) return analysis.synthesis
      if (!analyses) return null
      // Fall back to computed synthesis when LLM-generated one isn't available
      return computeSynthesis(analyses)
    },
    [analyses, analysis.synthesis]
  )

  // Resolve each response back to a full Persona once — chat needs the
  // psychometrics/backstory, not just the display projection.
  const resolvedPersonas = useMemo(
    () => (analyses ?? []).map((a) => resolveChatPersona(a, batches)),
    [analyses, batches]
  )

  const togglePersona = (index: number) => {
    setExpandedPersonas(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  if (!analyses || analyses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">No analysis data available for this analysis.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Executive Synthesis ─────────────────────────────── */}
      {synthesis && (
        <div className="flex flex-col gap-6">
          {/* Persona completion status */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Completed: {synthesis.completedCount}/{synthesis.totalPersonaCount}</span>
              {synthesis.failedCount > 0 && (
                <span className="text-destructive">Failed: {synthesis.failedCount}</span>
              )}
            </div>
            <button
              onClick={() => setIsPanelChatOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 w-fit"
            >
              <UsersIcon className="h-3.5 w-3.5" />
              Ask the whole audience
            </button>
          </div>

          {/* Research Question Answer */}
          {synthesis.researchQuestionAnswer && (
            <div className="rounded-lg border border-primary/10 bg-primary/5 p-5">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 block">Research Question</span>
              <p className="text-sm text-foreground/90 leading-relaxed">{synthesis.researchQuestionAnswer}</p>
            </div>
          )}

          {/* Top Findings with Observed Counts */}
          {synthesis.topFindings.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Top Findings
              </h3>
              {synthesis.topFindings.slice(0, 5).map((finding, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{finding.observation}</p>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                      finding.confidence === 'strongly supported' ? 'bg-green-500/10 text-green-600 border border-green-500/20' :
                      finding.confidence === 'some support' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                      'bg-red-500/10 text-red-600 border border-red-500/20'
                    }`}>
                      {finding.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground"><span className="font-medium">Evidence:</span> {finding.evidence}</p>
                  <p className="text-xs text-muted-foreground"><span className="font-medium">Impact:</span> {finding.impact}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UsersIcon className="h-3 w-3" />
                    <span>Observed in {finding.affectedPersonaCount}/{finding.totalPersonaCount} personas</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Disagreements */}
          {synthesis.disagreements.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Disagreements — Where Personas Split
              </h3>
              {synthesis.disagreements.map((d, i) => (
                <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-2">
                  <p className="text-sm font-medium text-foreground">{d.topic}</p>
                  <div className="flex flex-col gap-1.5">
                    {d.split.map((side, j) => (
                      <div key={j} className="text-xs text-muted-foreground">
                        <span className="font-medium">{side.view}:</span> {side.personaCount} {side.personaCount === 1 ? 'persona' : 'personas'}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Biggest Frictions */}
          {synthesis.biggestFrictions.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Biggest Friction Points
              </h3>
              <ul className="list-disc list-inside text-sm text-foreground/80 space-y-1">
                {synthesis.biggestFrictions.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Per-Persona Drill-Down ──────────────────────────── */}
      <div className="border-t border-border/40 pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Individual Persona Reports
        </h3>
        <div className="grid gap-3">
          {analyses.map((analysis, index) => {
            const personaName = analysis.personaProfile?.name ?? `Persona ${index + 1}`
            const isExpanded = expandedPersonas.has(index)
            const chatPersona = resolvedPersonas[index]

            return (
            <div
              key={analysis.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <button
                onClick={() => togglePersona(index)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex flex-col gap-0.5">
                  <h4 className="font-semibold text-sm">{personaName}</h4>
                  {analysis.personaProfile && (
                    <p className="text-xs text-muted-foreground">
                      {analysis.personaProfile.occupation} · {analysis.personaProfile.communicationStyle}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {analysis.customerJourney && (
                    <div className="flex gap-1">
                      {analysis.customerJourney.map((s) => (
                        <span key={s.stage} className={`h-2 w-2 rounded-full ${SENTIMENT_DOT[s.sentiment]}`} title={`${s.stage} — ${s.outcome}`} />
                      ))}
                    </div>
                  )}
                  {isExpanded ? <ChevronDownIcon className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 flex flex-col gap-4">
                  {chatPersona && (
                    <button
                      onClick={() => setChatTarget({ persona: chatPersona, analysis })}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40 w-fit"
                    >
                      <MessageCircleIcon className="h-3.5 w-3.5" />
                      Ask {personaName} about what they saw
                    </button>
                  )}
                  {analysis.personaProfile && <PersonaIdentityCard profile={analysis.personaProfile} />}

                  {analysis.overview && (
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Overview</span>
                      <p className="text-sm text-foreground/80 leading-relaxed">{analysis.overview}</p>
                    </div>
                  )}

                  {analysis.customerJourney?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Journey</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Felt positive</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Neutral</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Felt negative</span>
                        <span className="text-muted-foreground/60">· badge = whether they progressed</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {analysis.customerJourney.map((stage) => (
                          <div key={stage.stage} className="rounded-lg border border-border bg-card/50 p-2.5">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`h-2 w-2 rounded-full ${SENTIMENT_DOT[stage.sentiment]}`} />
                              <span className="text-xs font-semibold uppercase tracking-wider">
                                {stage.stage}
                              </span>
                              <StageOutcomeBadge outcome={stage.outcome} />
                            </div>
                            <p className="text-xs text-foreground/80">{stage.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.researchQuestionAnswer && (
                    <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 block">Research Question</span>
                      <p className="text-sm text-foreground/80">{analysis.researchQuestionAnswer}</p>
                    </div>
                  )}

                  {analysis.majorFindings.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Findings</p>
                      {analysis.majorFindings.map((finding: MajorFinding, i: number) => (
                        <div key={i} className="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-foreground">{finding.observation}</p>
                          </div>
                          <p className="text-xs text-muted-foreground"><span className="font-medium">Evidence:</span> {finding.evidence}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {analysis.pointsOfFriction.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Friction</p>
                      <ul className="list-disc list-inside text-xs text-foreground/80">
                        {analysis.pointsOfFriction.map((f: string, i: number) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}

                  {analysis.unansweredQuestions.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Questions</p>
                      <ul className="list-disc list-inside text-xs text-foreground/80">
                        {analysis.unansweredQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      </div>

      {analysis.screenshot && (
        <div className="rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${analysis.screenshot}`}
            alt="Captured page"
            className="w-full"
          />
        </div>
      )}

      {chatTarget && (
        <PersonaChat
          persona={chatTarget.persona}
          analysis={chatTarget.analysis}
          isOpen={!!chatTarget}
          onClose={() => setChatTarget(null)}
        />
      )}

      <PanelChat
        responses={analyses}
        synthesis={synthesis}
        personaNames={analysis.personaNames ?? []}
        isOpen={isPanelChatOpen}
        onClose={() => setIsPanelChatOpen(false)}
      />
    </div>
  )
}
