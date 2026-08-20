"use server";

// ─────────────────────────────────────────────────────────────────────────────
// Server-side progress store for long-running VPS analyses.
// The RSC stream (readStreamableValue) uses an in-memory promise chain that
// dies when the user navigates away from the dashboard. Without a persistent
// store, the analysis stays IN_PROGRESS forever because the DONE event is
// never consumed by the disconnected client.
//
// This store acts as a side-channel: progress callbacks in the analysis
// pipeline write here, and the analysis detail page polls for updates
// after navigation. Combined with the AnalysisResultStore (which captures
// the final analyses), this ensures progress visibility survives navigation.
//
// IMPORTANT: Do not import types from other modules. "use server" files are
// transformed by the bundler and type imports can break at runtime.
// ─────────────────────────────────────────────────────────────────────────────

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";
import { progressMap } from "@/infrastructure/progressStore";

export interface ProgressState {
  step?: string;
  streamingText?: string;
  personaName?: string;
  completedResponses?: number;
  totalResponses?: number;
  completedCount?: number;
  totalCount?: number;
  error?: string;
  hasCompleted?: boolean;
}

export async function storeProgress(runId: string, state: ProgressState): Promise<void> {
  const existing = progressMap.get(runId) || {};
  const clean = Object.fromEntries(
    Object.entries(state).filter(([_, v]) => v !== undefined)
  );
  progressMap.set(runId, { ...existing, ...clean });
  console.log(`[PROGRESS_STORE] Saved for ${runId}: step=${state.step ?? existing.step ?? '?'}, completed=${state.completedResponses ?? existing.completedResponses ?? '?'}/${state.totalResponses ?? existing.totalResponses ?? '?'}, hasCompleted=${!!state.hasCompleted}, error=${state.error ?? 'none'}`);
}

export async function storeCompleted(runId: string, errorMsg?: string): Promise<void> {
  console.log(`[PROGRESS_STORE] markCompleted for ${runId}`);
  await storeProgress(runId, { step: 'DONE', hasCompleted: true, error: errorMsg });
}

export async function getProgressAction(runId: string): Promise<{
  found: boolean;
  progress?: ProgressState;
}> {
  if (shouldRunLocally()) {
    const p = progressMap.get(runId);
    if (!p) {
      console.log(`[PROGRESS_POLL] ${runId}: NOT FOUND (map size=${progressMap.size})`);
      return { found: false };
    }
    console.log(`[PROGRESS_POLL] ${runId}: FOUND step=${p.step ?? '?'}, completed=${p.completedResponses ?? '?'}/${p.totalResponses ?? '?'}, hasCompleted=${!!p.hasCompleted}, error=${p.error ?? 'none'}`);
    return { found: true, progress: p };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/analyze-progress?runId=${runId}`, {
    headers: { Authorization: `Bearer ${getVpsAuthToken()}` },
  });
  if (!res.ok) {
    console.error(`[PROGRESS_POLL] VPS returned ${res.status} for ${runId}`);
    return { found: false };
  }
  return res.json();
}
