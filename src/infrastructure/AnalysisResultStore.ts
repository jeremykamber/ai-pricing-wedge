import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'
import { ExpiringStore } from './ExpiringStore'

interface StoredAnalysis {
  analyses: PersonaResponse[]
  completedAt: string
  error?: string
  synthesis?: ArtifactSynthesis
}

/**
 * Server-side in-memory store for completed analysis results.
 * Analyses run in a fire-and-forget IIFE inside the server action.
 * When the client disconnects (reload/navigate away), the IIFE continues
 * running but the streaming response has no reader. This store captures
 * the results so they can be fetched on reconnection.
 *
 * Results are kept for 30 minutes after completion, then cleaned up.
 * Delegates to ExpiringStore for HMR-safe storage and TTL cleanup.
 */
class AnalysisResultStore {
  private readonly store = new ExpiringStore<StoredAnalysis>(
    '__kynd_analysis_results',
    '__kynd_analysis_cleanups',
  );

  save(runId: string, analyses: PersonaResponse[], synthesis?: ArtifactSynthesis): void {
    console.log(`[RESULT_STORE] Saving ${analyses.length} analyses for ${runId}`);
    this.store.set(runId, {
      analyses,
      completedAt: new Date().toISOString(),
      synthesis,
    })
  }

  saveError(runId: string, error: string): void {
    console.log(`[RESULT_STORE] Saving error for ${runId}: ${error}`);
    this.store.set(runId, {
      analyses: [],
      completedAt: new Date().toISOString(),
      error,
    })
  }

  get(runId: string): StoredAnalysis | undefined {
    return this.store.get(runId)
  }

  remove(runId: string): void {
    this.store.delete(runId)
  }
}

export const analysisResultStore = new AnalysisResultStore()
