'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ClockIcon, CheckCircleIcon, XCircleIcon, ArrowLeftIcon } from 'lucide-react'
import { getProgressAction } from '@/actions/getProgress'
import { getPersonaGenerationResultAction } from '@/actions/getPersonaGenerationResult'
import { StepIndicator } from '@/components/custom/StepIndicator'
import { Progress } from '@/components/ui/progress'
import type { PersonaGenerationResult } from '@/actions/getPersonaGenerationResult'

type FlowStep = { title: string; description?: string }

const PERSONA_STEPS: FlowStep[] = [
  { title: 'Analyzing Market', description: 'Mapping demographics and psychographics' },
  { title: 'Generating Personas', description: 'Creating detailed backstories and traits' },
  { title: 'Rationalizing Behavior', description: 'Anchoring psychographics to personality traits' },
  { title: 'Finalizing', description: 'Preparing avatars, insights, and profiles' },
]

const PIPELINE_STEPS: FlowStep[] = [
  { title: 'Extracting Signals', description: 'Analyzing interview transcripts for behavioral signals' },
  { title: 'Pooling Signals', description: 'Aggregating patterns across all interviews' },
  { title: 'Sampling Personas', description: 'Drawing coherent persona profiles from the distribution' },
  { title: 'Generating Personas', description: 'Building backstories, psychographics, and insights' },
  { title: 'Ingesting to Memory', description: 'Indexing personas for retrieval-augmented chat' },
]

function detectFlowType(runId: string): 'persona' | 'pipeline' | 'unknown' {
  if (runId.startsWith('pipeline-')) return 'pipeline'
  if (runId.startsWith('persona-')) return 'persona'
  return 'unknown'
}

function stepToIndex(step: string | undefined, steps: FlowStep[]): number {
  if (!step) return 0
  if (steps.length === 5) {
    // Pipeline steps
    if (step === 'UPLOADING' || step === 'EXTRACTING' || step === 'EXTRACTING_SIGNALS') return 0
    if (step === 'POOLING' || step === 'POOLING_SIGNALS') return 1
    if (step === 'SAMPLING' || step === 'SAMPLING_PERSONAS') return 2
    if (step === 'GENERATING' || step === 'GENERATING_PERSONAS') return 3
    if (step === 'INGESTING' || step === 'INGESTING_TO_MEMORY') return 4
    return 0
  }
  // Persona steps
  if (step === 'BRAINSTORMING_PERSONAS') return 0
  if (step === 'GENERATING_BACKSTORIES') return 1
  if (step === 'ADDING_BEHAVIORAL_DEPTH') return 2
  if (step === 'GENERATING_INSIGHTS') return 2
  if (step === 'DONE') return 3
  return 0
}

export default function GeneratingPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.runId as string
  const flowType = detectFlowType(runId)
  const steps = flowType === 'pipeline' ? PIPELINE_STEPS : PERSONA_STEPS
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState<number>(0)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [personaName, setPersonaName] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState<number | undefined>(undefined)
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined)
  const [result, setResult] = useState<PersonaGenerationResult | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!runId) return

    const poll = async () => {
      if (!mountedRef.current) return

      // Check for completion first
      const res = await getPersonaGenerationResultAction(runId)
      if (res.found) {
        if (mountedRef.current) setResult(res)
        return
      }

      // Poll progress
      const p = await getProgressAction(runId)
      if (!p.found || !p.progress || !mountedRef.current) return

      setCurrentStep(stepToIndex(p.progress.step, steps))
      setStreamingText(p.progress.streamingText ?? null)
      setPersonaName(p.progress.personaName ?? null)

      const completed = p.progress.completedCount ?? p.progress.completedResponses
      const total = p.progress.totalCount ?? p.progress.totalResponses
      setCompletedCount(completed)
      setTotalCount(total)

      if (total && total > 0 && completed != null) {
        setProgress(Math.min(completed / total, 1) * 100)
      }
    }

    poll()
    const interval = setInterval(poll, 1000)
    return () => clearInterval(interval)
  }, [runId, steps])

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Back link */}
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to Dashboard
      </button>

      {result ? (
        /* ── Completion / Error state ── */
        <div className="rounded-xl border border-border bg-card p-8 md:p-12">
          {result.error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircleIcon className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold tracking-tight">Generation Failed</h2>
              <p className="text-sm text-muted-foreground max-w-md">{result.error}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircleIcon className="h-12 w-12 text-green-500" />
              <h2 className="text-xl font-semibold tracking-tight">
                {result.personas?.length ?? 0} Personas Ready
              </h2>
              <p className="text-sm text-muted-foreground">
                Your personas have been generated and added to the dashboard.
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors mt-2"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                View on Dashboard
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Progress view ── */
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-8 pt-6 pb-2 border-b border-border/40">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight min-w-0">
                {flowType === 'pipeline' ? 'Processing Interview Transcripts' : 'Synthesizing Personas'}
              </h3>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-8 px-4 sm:px-8 py-6">
            <div className="flex-shrink-0 w-full md:w-48">
              <StepIndicator steps={steps} currentStep={currentStep} />
            </div>
            <div className="flex-1 min-h-[200px] flex flex-col justify-center items-center">
              {streamingText && (
                <div className="mb-6 text-center">
                  <p className="text-sm text-muted-foreground">{streamingText}</p>
                  {personaName && (
                    <p className="mt-1.5 text-xs font-mono text-muted-foreground/60">
                      ↳ persona: {personaName}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-col items-center justify-center w-full max-w-xs mx-auto space-y-4">
                <Progress value={Math.max(progress, 10)} className="h-2 w-full" />
                {completedCount !== undefined && totalCount !== undefined && (
                  <p className="text-xs font-mono text-muted-foreground tabular-nums">
                    {completedCount}/{totalCount}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
