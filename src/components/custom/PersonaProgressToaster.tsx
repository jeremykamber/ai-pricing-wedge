'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ClockIcon, CheckCircleIcon, XCircleIcon, XIcon } from 'lucide-react'
import { usePersonaStore, type PersonaBatch } from '@/ui/stores/personaStore'
import { getProgressAction } from '@/actions/getProgress'
import { getPersonaGenerationResultAction } from '@/actions/getPersonaGenerationResult'
import { batchConsumedRunIds } from '@/lib/generationRunState'

const POLL_INTERVAL_MS = 1000

/**
 * Progress per step as a 0-1 ratio, mirroring the full progress page
 * (DashboardClient). Based on position in the flow, not granular counts.
 */
const STEP_PROGRESS: Record<string, number> = {
  BRAINSTORMING_PERSONAS: 0.1,
  GENERATING_BACKSTORIES: 0.2,
  // ENHANCING_WITH_PBJ kept as a retrofitting measure — progress store entries
  // from before the rename (cached on globalThis) still carry the old value
  // until the server process is restarted.
  ENHANCING_WITH_PBJ: 0.5,
  ADDING_BEHAVIORAL_DEPTH: 0.5,
  GENERATING_INSIGHTS: 0.75,
  DONE: 1,
  // Long-form keys (ICP pipeline)
  EXTRACTING_SIGNALS: 0.15,
  POOLING_SIGNALS: 0.35,
  SAMPLING_PERSONAS: 0.5,
  INGESTING_TO_MEMORY: 0.8,
  // Short-form keys (interview pipeline — server emits these)
  EXTRACTING: 0.15,
  POOLING: 0.35,
  SAMPLING: 0.5,
  GENERATING: 0.65,
  INGESTING: 0.8,
}

/**
 * Deterministic toast id per run. poll() can overlap itself (async interval,
 * slow server-action round trips), so two executions may both try to create
 * the toast for the same run — sonner dedupes by id, so a stable id derived
 * from the runId guarantees exactly one toast per run, never a duplicate.
 */
const toastIdFor = (runId: string) => `persona-toast-${runId}`

/**
 * Failure reasons (e.g. a rejected verbatim-evidence batch) can be many KB
 * long. The toast shows a preview; the full error lives on the generating
 * page (/dashboard/generating/<runId>).
 */
const ERROR_PREVIEW_CHARS = 200
function truncateError(message: string): string {
  if (message.length <= ERROR_PREVIEW_CHARS) return message
  return `${message.slice(0, ERROR_PREVIEW_CHARS)}…`
}

const removedSet = new Set<string>()
const completedSet = new Set<string>()

export function PersonaProgressToaster() {
  const activeRunIds = usePersonaStore((s) => s.activeGenerationRunIds)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const persistDismiss = (runId: string) => {
    removedSet.add(runId)
    usePersonaStore.getState().removeActiveGeneration(runId)
  }

  // ── Interval-based polling: runs while runs are active ──
  useEffect(() => {
    if (activeRunIds.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const poll = async () => {
      const runIds = usePersonaStore.getState().activeGenerationRunIds
      if (runIds.length === 0) return

      for (const runId of runIds) {
        if (removedSet.has(runId)) continue

        // 1. Check for a final result (completed/error)
        const result = await getPersonaGenerationResultAction(runId)
        if (result.found) {
          // A concurrent poll may have settled this run while we were awaiting.
          if (completedSet.has(runId) || removedSet.has(runId)) continue

          completedSet.add(runId)
          removedSet.add(runId)
          usePersonaStore.getState().removeActiveGeneration(runId)

          const personaCount = result.personas?.length ?? 0
          const isError = !!result.error

          if (!isError && personaCount > 0 && !batchConsumedRunIds.has(runId)) {
            batchConsumedRunIds.add(runId)
            const source = runId.startsWith('pt-') ? 'description' : 'interviews'
            const label = source === 'interviews' ? `${personaCount} Personas from Interviews` : `${personaCount} Generated Personas`
            const batch: PersonaBatch = {
              id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              label,
              source,
              transcriptCount: undefined,
              createdAt: new Date().toISOString(),
              personas: result.personas!,
            }
            usePersonaStore.getState().addBatch(batch)
          }

          const content = (
            <PersonaToastContent
              title={isError ? 'Generation Failed' : `${personaCount} Personas Ready`}
              subtext={isError ? truncateError(result.error!) : undefined}
              progress={1}
              onView={() => {
                // The generating page carries the full error; the toast only
                // shows a preview.
                window.location.href = isError ? `/dashboard/generating/${runId}` : '/dashboard'
              }}
              onDismiss={() => persistDismiss(runId)}
              variant={isError ? 'error' : 'completed'}
            />
          )

          toast.custom(() => content, {
            id: toastIdFor(runId),
            dismissible: true,
            onDismiss: () => persistDismiss(runId),
            duration: 8000,
          })
          continue
        }

        // 2. Still in progress — poll progress details
        const p = await getProgressAction(runId)
        if (!p.found) continue

        // The progress store keeps failures forever (the result store entry
        // expires after 30 min), so a poll that misses the result must still
        // settle the run in the error state — otherwise the toast stays
        // "Generating personas" indefinitely.
        const failed = !!p.progress?.error

        if (failed) {
          if (completedSet.has(runId) || removedSet.has(runId)) continue

          completedSet.add(runId)
          removedSet.add(runId)
          usePersonaStore.getState().removeActiveGeneration(runId)

          toast.custom(
            () => (
              <PersonaToastContent
                title="Generation Failed"
                subtext={truncateError(p.progress!.error!)}
                progress={1}
                onView={() => {
                  window.location.href = `/dashboard/generating/${runId}`
                }}
                onDismiss={() => persistDismiss(runId)}
                variant="error"
              />
            ),
            {
              id: toastIdFor(runId),
              dismissible: true,
              onDismiss: () => persistDismiss(runId),
              duration: 8000,
            },
          )
          continue
        }

        // A concurrent poll may have settled the run (error/completed) while
        // we were awaiting — never overwrite its toast with a stale
        // in-progress render.
        if (removedSet.has(runId)) continue

        const step = p.progress?.step
        const progress = STEP_PROGRESS[step ?? ''] ?? 0
        const subtext = formatStepName(step)

        const content = (
          <PersonaToastContent
            title="Generating personas"
            subtext={subtext}
            progress={progress}
            onView={() => {
              window.location.href = `/dashboard/generating/${runId}`
            }}
          />
        )

        toast.custom(() => content, {
          id: toastIdFor(runId),
          dismissible: true,
          onDismiss: () => persistDismiss(runId),
          duration: Infinity,
        })
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [activeRunIds.length])

  return null
}

function PersonaToastContent({
  title,
  subtext,
  progress,
  onView,
  onDismiss,
  variant = 'in-progress',
}: {
  title: string
  subtext?: string
  progress: number
  onView: () => void
  onDismiss?: () => void
  variant?: 'in-progress' | 'completed' | 'error'
}) {
  const Icon =
    variant === 'completed'
      ? CheckCircleIcon
      : variant === 'error'
        ? XCircleIcon
        : ClockIcon

  const iconClass =
    variant === 'completed'
      ? 'text-green-500'
      : variant === 'error'
        ? 'text-destructive'
        : 'text-primary animate-spin'

  const label = variant === 'completed' ? 'View Batch' : 'View'
  const isTerminal = variant === 'completed' || variant === 'error'

  return (
    <div className="relative group overflow-hidden rounded-lg border border-border bg-card">
      {variant === 'in-progress' && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-primary/20 animate-[sim-ring-fade_0.6s_ease-out_forwards]" />
      )}
      <div
        className="absolute inset-y-0 left-0 bg-primary/[0.06] transition-all duration-300 ease-out"
        style={{ width: `${progress * 100}%` }}
      />
      {isTerminal && onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-destructive focus:outline-none z-10"
          aria-label="Dismiss"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
      <div className="relative z-10 flex items-center gap-3 p-4">
        <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {subtext && (
            <p className="text-xs text-muted-foreground">{subtext}</p>
          )}
        </div>
        {onView && (
          <button
            onClick={onView}
            className="shrink-0 text-xs font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
          >
            {label}
          </button>
        )}
      </div>
    </div>
  )
}

const STEP_DISPLAY: Record<string, string> = {
  BRAINSTORMING_PERSONAS: 'Brainstorming personas',
  GENERATING_BACKSTORIES: 'Generating backstories',
  ENHANCING_WITH_PBJ: 'Adding behavioral depth', // retrofitting — same reason as STEP_PROGRESS above
  ADDING_BEHAVIORAL_DEPTH: 'Adding behavioral depth',
  GENERATING_INSIGHTS: 'Generating insights',
  // Long-form keys (ICP pipeline)
  EXTRACTING_SIGNALS: 'Extracting signals from interviews',
  POOLING_SIGNALS: 'Pooling signals across interviews',
  SAMPLING_PERSONAS: 'Sampling persona profiles',
  INGESTING_TO_MEMORY: 'Indexing personas for chat',
  // Short-form keys (interview pipeline — server emits these)
  EXTRACTING: 'Extracting signals from interviews',
  POOLING: 'Pooling signals across interviews',
  SAMPLING: 'Sampling persona profiles',
  GENERATING: 'Generating personas',
  INGESTING: 'Indexing personas for chat',
  DONE: 'Complete',
  ERROR: 'Error',
}

function formatStepName(step?: string): string {
  if (!step) return 'Generating personas...'
  return STEP_DISPLAY[step] ?? step
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())
}
