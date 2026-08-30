import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'

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
 *
 * NOTE: Maps are stored on globalThis to survive Next.js HMR (dev mode).
 * Without this, module re-evaluation during hot reload wipes the in-memory
 * data while the running IIFE writes to the old instance.
 */
const GLOBAL_KEY = '__kynd_analysis_results';
const GLOBAL_CLEANUP_KEY = '__kynd_analysis_cleanups';

function getGlobalMap<K, V>(key: string): Map<K, V> {
  return ((globalThis as any)[key] ?? ((globalThis as any)[key] = new Map()));
}

class AnalysisResultStore {
  private get results() { return getGlobalMap<string, StoredAnalysis>(GLOBAL_KEY); }
  private get cleanups() { return getGlobalMap<string, ReturnType<typeof setTimeout>>(GLOBAL_CLEANUP_KEY); }

  save(runId: string, analyses: PersonaResponse[], synthesis?: ArtifactSynthesis): void {
    console.log(`[RESULT_STORE] Saving ${analyses.length} analyses for ${runId}`);
    this.results.set(runId, {
      analyses,
      completedAt: new Date().toISOString(),
      synthesis,
    })
    this.scheduleCleanup(runId)
  }

  saveError(runId: string, error: string): void {
    console.log(`[RESULT_STORE] Saving error for ${runId}: ${error}`);
    this.results.set(runId, {
      analyses: [],
      completedAt: new Date().toISOString(),
      error,
    })
    this.scheduleCleanup(runId)
  }

  get(runId: string): StoredAnalysis | undefined {
    return this.results.get(runId)
  }

  remove(runId: string): void {
    this.results.delete(runId)
    const timer = this.cleanups.get(runId)
    if (timer) {
      clearTimeout(timer)
      this.cleanups.delete(runId)
    }
  }

  private scheduleCleanup(runId: string): void {
    const existing = this.cleanups.get(runId)
    if (existing) clearTimeout(existing)
    this.cleanups.set(
      runId,
      setTimeout(() => this.remove(runId), 30 * 60 * 1000),
    )
  }
}

export const analysisResultStore = new AnalysisResultStore()
