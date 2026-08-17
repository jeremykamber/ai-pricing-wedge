'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import { getProgressAction } from '@/actions/getProgress'
import { getSimulationResultAction } from '@/actions/getSimulationResult'
import { ClockIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon } from 'lucide-react'
import type { Simulation } from '@/domain/entities/Simulation'

/**
 * Module-level toast ID map — survives component remounts so existing toasts
 * are never orphaned when React re-renders the tree (e.g. suspense, nav).
 */
const toastIdMap = new Map<string, string | number>()

function SimulationToastContent({
  sim,
  onView,
  onDismiss,
  actionLabel,
}: {
  sim: Simulation
  onView: () => void
  onDismiss: () => void
  actionLabel?: string
}) {
  const completed = sim.completedAnalyses ?? 0
  const total = sim.totalAnalyses ?? 0
  const progress = total > 0 ? Math.min(completed / total, 1) : 0
  const isTerminal = sim.status !== 'IN_PROGRESS'

  const statusConfig = {
    IN_PROGRESS: {
      icon: <ClockIcon className="h-4 w-4 shrink-0 text-primary animate-spin" />,
      label: sim.completedAnalyses != null && sim.totalAnalyses != null
        ? `${sim.completedAnalyses}/${sim.totalAnalyses} analyses`
        : 'Analyzing...',
      accentClass: 'bg-primary/[0.06]',
      ringClass: 'ring-primary/20',
      progressWidth: `${progress * 100}%`,
      buttonClass: 'text-primary hover:text-primary/80',
    },
    COMPLETED: {
      icon: <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />,
      label: 'Simulation complete',
      accentClass: 'bg-green-500/[0.06]',
      ringClass: 'ring-green-500/20',
      progressWidth: '100%',
      buttonClass: 'text-green-600 hover:text-green-700',
    },
    ERROR: {
      icon: <XCircleIcon className="h-4 w-4 shrink-0 text-destructive" />,
      label: sim.error || 'Simulation failed',
      accentClass: 'bg-destructive/[0.06]',
      ringClass: 'ring-destructive/20',
      progressWidth: '100%',
      buttonClass: 'text-destructive hover:text-destructive/80',
    },
    CANCELLED: {
      icon: <AlertCircleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />,
      label: 'Simulation cancelled',
      accentClass: 'bg-muted/30',
      ringClass: 'ring-muted-foreground/20',
      progressWidth: '100%',
      buttonClass: 'text-muted-foreground hover:text-foreground',
    },
  }[sim.status]

  return (
    <div className="relative group overflow-hidden rounded-lg border border-border bg-card">
      {sim.status === 'IN_PROGRESS' && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-primary/20 animate-[sim-ring-fade_0.6s_ease-out_forwards]" />
      )}
      <div
        className={`absolute inset-y-0 left-0 ${statusConfig.accentClass} transition-all duration-300 ease-out`}
        style={{ width: statusConfig.progressWidth }}
      />
      {isTerminal && (
        <button
          onClick={onDismiss}
          className="absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-destructive focus:outline-none z-10"
          aria-label="Dismiss"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
      <div className="relative z-10 flex items-center gap-3 p-4">
        {statusConfig.icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{sim.name}</p>
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
      </div>
    </div>
  )
}

/**
 * Parse a snapshot string into a map of sim IDs to their statuses.
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

export function SimulationToaster() {
  const lastSnapshotRef = useRef<string>('')

  const snapshot = useSimulationStore(
    (s) =>
      s.simulations
        .map(
          (sim) =>
            `${sim.id}:${sim.status}:${sim.completedAnalyses ?? 0}/${sim.totalAnalyses ?? 0}`,
        )
        .join('|'),
  )

  const persistDismiss = (id: string) => {
    toastIdMap.delete(id)
    useSimulationStore.getState().dismissSimulation(id)
  }

  useEffect(() => {
    // Build a set of sim IDs that were already terminal in the previous
    // snapshot. Only sims that transitioned INTO a terminal state (i.e.
    // were not terminal before) should get a toast. This prevents the
    // flash-back bug where pre-existing terminal sims briefly appear as
    // toasts after Zustand persist hydrates or the component remounts.
    const prevStatuses = parseSnapshotStatuses(lastSnapshotRef.current)
    const prevTerminal = new Set<string>()
    for (const [id, status] of prevStatuses) {
      if (status !== 'IN_PROGRESS') prevTerminal.add(id)
    }

    // On the very first run (empty prev snapshot), just record current
    // state and bail — nothing to transition from.
    if (lastSnapshotRef.current === '') {
      const store = useSimulationStore.getState()
      for (const id of store.dismissedSimulationIds) {
        toastIdMap.delete(id)
      }
      lastSnapshotRef.current = snapshot
      return
    }

    if (snapshot === lastSnapshotRef.current) return
    lastSnapshotRef.current = snapshot

    const simulations = useSimulationStore.getState().simulations
    const dismissedIds = useSimulationStore.getState().dismissedSimulationIds

    for (const sim of simulations) {
      if (dismissedIds.includes(sim.id)) continue

      // Skip sims that were already terminal in the previous snapshot —
      // they already had their chance to show a toast (or were dismissed).
      if (prevTerminal.has(sim.id)) continue

      const existingToastId = toastIdMap.get(sim.id)

      const navigateTo = (path: string) => {
        window.location.href = path
      }

      const onDismiss = () => persistDismiss(sim.id)

      if (sim.status === 'IN_PROGRESS') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => navigateTo(`/dashboard/simulations/${sim.id}`)}
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
          toastIdMap.set(sim.id, id)
        }
      } else if (sim.status === 'COMPLETED') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => navigateTo(`/dashboard/simulations/${sim.id}`)}
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
          toastIdMap.set(sim.id, id)
        }
      } else if (sim.status === 'ERROR') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => navigateTo(`/dashboard/simulations/${sim.id}`)}
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
          toastIdMap.set(sim.id, id)
        }
      } else if (sim.status === 'CANCELLED') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => navigateTo(`/dashboard/simulations/${sim.id}`)}
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
          toastIdMap.set(sim.id, id)
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
      const sims = useSimulationStore.getState().simulations
      const inProgress = sims.filter((s) => s.status === 'IN_PROGRESS')
      if (inProgress.length === 0) return

      for (const sim of inProgress) {
        try {
          const result = await getProgressAction(sim.id)
          if (!result.found || !result.progress) continue

          const p = result.progress
          const updates: Partial<Simulation> = {}
          if (p.step) updates.currentStep = p.step as any
          if (p.completedAnalyses !== undefined) updates.completedAnalyses = p.completedAnalyses
          if (p.totalAnalyses !== undefined) updates.totalAnalyses = p.totalAnalyses

          if (Object.keys(updates).length > 0) {
            useSimulationStore.getState().updateSimulation(sim.id, updates)
          }

          if (p.hasCompleted) {
            const result2 = await getSimulationResultAction(sim.id)
            if (result2.found && result2.analyses && result2.analyses.length > 0) {
              useSimulationStore.getState().markComplete(sim.id, result2.analyses)
            } else if (result2.found && result2.error) {
              useSimulationStore.getState().markError(sim.id, result2.error)
            } else if (result2.found) {
              // Completed but no analyses and no error — avoid infinite IN_PROGRESS
              useSimulationStore.getState().markError(sim.id, 'Simulation completed with no results')
            }
          }

          if (p.error) {
            useSimulationStore.getState().markError(sim.id, p.error)
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
