'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import { getProgressAction } from '@/actions/getProgress'
import { getAnalysisResultAction } from '@/actions/getAnalysisResult'
import { ClockIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon } from 'lucide-react'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'
import { summarizeError } from '@/lib/errorSummary'

/**
 * Module-level toast ID map — survives component remounts so existing toasts
 * are never orphaned when React re-renders the tree (e.g. suspense, nav).
 */
const toastIdMap = new Map<string, string | number>()

function AnalysisToastContent({
  analysis,
  onView,
  onDismiss,
  actionLabel,
}: {
  analysis: ArtifactAnalysis
  onView: () => void
  onDismiss: () => void
  actionLabel?: string
}) {
  const completed = analysis.completedResponses ?? 0
  const total = analysis.totalResponses ?? 0
  const progress = total > 0 ? Math.min(completed / total, 1) : 0
  const isTerminal = analysis.status !== 'IN_PROGRESS'

  const statusConfig = {
    IN_PROGRESS: {
      icon: <ClockIcon className="h-4 w-4 shrink-0 text-primary animate-spin" />,
      label: analysis.completedResponses != null && analysis.totalResponses != null
        ? `${analysis.completedResponses}/${analysis.totalResponses} analyses`
        : 'Analyzing...',
      accentClass: 'bg-primary/[0.06]',
      ringClass: 'ring-primary/20',
      progressWidth: `${progress * 100}%`,
      buttonClass: 'text-primary hover:text-primary/80',
    },
    COMPLETED: {
      icon: <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />,
      label: 'Analysis complete',
      accentClass: 'bg-green-500/[0.06]',
      ringClass: 'ring-green-500/20',
      progressWidth: '100%',
      buttonClass: 'text-green-600 hover:text-green-700',
    },
    ERROR: {
      icon: <XCircleIcon className="h-4 w-4 shrink-0 text-destructive" />,
      label: summarizeError(analysis.error || 'Analysis failed'),
      accentClass: 'bg-destructive/[0.06]',
      ringClass: 'ring-destructive/20',
      progressWidth: '100%',
      buttonClass: 'text-destructive hover:text-destructive/80',
    },
    CANCELLED: {
      icon: <AlertCircleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />,
      label: 'Analysis cancelled',
      accentClass: 'bg-muted/30',
      ringClass: 'ring-muted-foreground/20',
      progressWidth: '100%',
      buttonClass: 'text-muted-foreground hover:text-foreground',
    },
  }[analysis.status]

  return (
    <div className="relative group overflow-hidden rounded-lg border border-border bg-card">
      {analysis.status === 'IN_PROGRESS' && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-primary/20 animate-[analysis-ring-fade_0.6s_ease-out_forwards]" />
      )}
      <div
        className={`absolute inset-y-0 left-0 ${statusConfig.accentClass} transition-all duration-300 ease-out`}
        style={{ width: statusConfig.progressWidth }}
      />
      <div className="relative z-10 flex items-center gap-3 p-4">
        {statusConfig.icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{analysis.name}</p>
          <p className="text-xs text-muted-foreground">{statusConfig.label}</p>
        </div>
        {actionLabel && (
          <button
            onClick={onView}
            className={`shrink-0 text-xs font-semibold underline underline-offset-4 transition-colors ${statusConfig.buttonClass}`}
          >
            {actionLabel}
          </button>
        )}
        {isTerminal && (
          <button
            onClick={onDismiss}
            className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Dismiss"
          >
            <XIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Parse a snapshot string into a map of analysis IDs to their statuses.
 * Snapshot format: "id1:STATUS1:c/t|id2:STATUS2:c/t|..."
 */
function parseSnapshotStatuses(snapshot: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!snapshot) return map
  for (const part of snapshot.split('|')) {
    const [id, status] = part.split(':')
    if (id && status) map.set(id, status)
  }
  return map
}

export function AnalysisToaster() {
  const lastSnapshotRef = useRef<string>('')

  const snapshot = useAnalysisStore(
    (s) =>
      s.analyses
        .map(
          (a) =>
            `${a.id}:${a.status}:${a.completedResponses ?? 0}/${a.totalResponses ?? 0}`,
        )
        .join('|'),
  )

  const persistDismiss = (id: string) => {
    toastIdMap.delete(id)
    useAnalysisStore.getState().dismissAnalysis(id)
  }

  useEffect(() => {
    // Build a set of analysis IDs that were already terminal in the previous
    // snapshot. Only analyses that transitioned INTO a terminal state (i.e.
    // were not terminal before) should get a toast. This prevents the
    // flash-back bug where pre-existing terminal analyses briefly appear as
    // toasts after Zustand persist hydrates or the component remounts.
    const prevStatuses = parseSnapshotStatuses(lastSnapshotRef.current)
    const prevTerminal = new Set<string>()
    for (const [id, status] of prevStatuses) {
      if (status !== 'IN_PROGRESS') prevTerminal.add(id)
    }

    // On the very first run (empty prev snapshot), just record current
    // state and bail — nothing to transition from.
    if (lastSnapshotRef.current === '') {
      const store = useAnalysisStore.getState()
      for (const id of store.dismissedAnalysisIds) {
        toastIdMap.delete(id)
      }
      lastSnapshotRef.current = snapshot
      return
    }

    if (snapshot === lastSnapshotRef.current) return
    lastSnapshotRef.current = snapshot

    const analyses = useAnalysisStore.getState().analyses
    const dismissedIds = useAnalysisStore.getState().dismissedAnalysisIds

    for (const analysis of analyses) {
      if (dismissedIds.includes(analysis.id)) continue

      // Skip analyses that were already terminal in the previous snapshot —
      // they already had their chance to show a toast (or were dismissed).
      if (prevTerminal.has(analysis.id)) continue

      const existingToastId = toastIdMap.get(analysis.id)

      const navigateTo = (path: string) => {
        window.location.href = path
      }

      const onDismiss = () => persistDismiss(analysis.id)

      if (analysis.status === 'IN_PROGRESS') {
        const content = (
          <AnalysisToastContent
            analysis={analysis}
            onView={() => navigateTo(`/dashboard/analyses/${analysis.id}`)}
            onDismiss={onDismiss}
            actionLabel="View"
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss,
            duration: Infinity,
          })
          toastIdMap.set(analysis.id, id)
        }
      } else if (analysis.status === 'COMPLETED') {
        const content = (
          <AnalysisToastContent
            analysis={analysis}
            onView={() => navigateTo(`/dashboard/analyses/${analysis.id}`)}
            onDismiss={onDismiss}
            actionLabel="View Results"
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss,
          })
          toastIdMap.set(analysis.id, id)
        }
      } else if (analysis.status === 'ERROR') {
        const content = (
          <AnalysisToastContent
            analysis={analysis}
            onView={() => navigateTo(`/dashboard/analyses/${analysis.id}`)}
            onDismiss={onDismiss}
            actionLabel="Details"
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss,
          })
          toastIdMap.set(analysis.id, id)
        }
      } else if (analysis.status === 'CANCELLED') {
        const content = (
          <AnalysisToastContent
            analysis={analysis}
            onView={() => navigateTo(`/dashboard/analyses/${analysis.id}`)}
            onDismiss={onDismiss}
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss,
          })
          toastIdMap.set(analysis.id, id)
        }
      }
    }
  }, [snapshot])

  // Global progress polling — runs on every page since this component is
  // mounted in the root layout. Bridges server-side progress (from the VPS
  // analysis IIFE) to the Zustand store so the toast and any list/detail
  // page stay in sync without relying on the RSC stream (which is undefined
  // in VPS mode).
  useEffect(() => {
    const interval = setInterval(async () => {
      const analyses = useAnalysisStore.getState().analyses
      const inProgress = analyses.filter((a) => a.status === 'IN_PROGRESS')
      if (inProgress.length === 0) return

      for (const analysis of inProgress) {
        try {
          const result = await getProgressAction(analysis.id)
          if (!result.found || !result.progress) continue

          const p = result.progress
          const updates: Partial<ArtifactAnalysis> = {}
          if (p.step) updates.currentStep = p.step as any
          if (p.completedResponses !== undefined) updates.completedResponses = p.completedResponses
          if (p.totalResponses !== undefined) updates.totalResponses = p.totalResponses

          if (Object.keys(updates).length > 0) {
            useAnalysisStore.getState().updateAnalysis(analysis.id, updates)
          }

          if (p.hasCompleted) {
            const result2 = await getAnalysisResultAction(analysis.id)
            if (result2.found && result2.analyses && result2.analyses.length > 0) {
              useAnalysisStore.getState().markComplete(analysis.id, result2.analyses)
            } else if (result2.found && result2.error) {
              useAnalysisStore.getState().markError(analysis.id, result2.error)
            } else if (result2.found) {
              // Completed but no responses and no error — avoid infinite IN_PROGRESS
              useAnalysisStore.getState().markError(analysis.id, 'Analysis completed with no results')
            }
          }

          if (p.error) {
            useAnalysisStore.getState().markError(analysis.id, p.error)
          }
        } catch {
          // Poller error — retry on next interval
        }
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  return null
}
