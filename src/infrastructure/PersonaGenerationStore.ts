import type { Persona } from '@/domain/entities/Persona'

interface StoredPersonaGeneration {
  personas: Persona[]
  completedAt: string
  error?: string
}

/**
 * Server-side in-memory store for completed persona generation results.
 * Persona generation runs in a fire-and-forget IIFE on the VPS; this store
 * captures the final results so they can be fetched by a polling GET endpoint.
 *
 * Results are kept for 30 minutes after completion, then cleaned up.
 *
 * Stored on globalThis to survive Next.js HMR (dev mode).
 */
const GLOBAL_KEY = '__kynd_persona_generation_results';
const GLOBAL_CLEANUP_KEY = '__kynd_persona_generation_cleanups';

function getGlobalMap<K, V>(key: string): Map<K, V> {
  return ((globalThis as any)[key] ?? ((globalThis as any)[key] = new Map()));
}

class PersonaGenerationStore {
  private get results() { return getGlobalMap<string, StoredPersonaGeneration>(GLOBAL_KEY); }
  private get cleanups() { return getGlobalMap<string, ReturnType<typeof setTimeout>>(GLOBAL_CLEANUP_KEY); }

  save(runId: string, personas: Persona[]): void {
    console.log(`[PERSONA_STORE] Saving ${personas.length} personas for ${runId}`);
    this.results.set(runId, {
      personas,
      completedAt: new Date().toISOString(),
    });
    this.scheduleCleanup(runId);
  }

  saveError(runId: string, error: string): void {
    console.log(`[PERSONA_STORE] Saving error for ${runId}: ${error}`);
    this.results.set(runId, {
      personas: [],
      completedAt: new Date().toISOString(),
      error,
    });
    this.scheduleCleanup(runId);
  }

  get(runId: string): StoredPersonaGeneration | undefined {
    return this.results.get(runId);
  }

  remove(runId: string): void {
    this.results.delete(runId);
    const timer = this.cleanups.get(runId);
    if (timer) {
      clearTimeout(timer);
      this.cleanups.delete(runId);
    }
  }

  private scheduleCleanup(runId: string): void {
    const existing = this.cleanups.get(runId);
    if (existing) clearTimeout(existing);
    this.cleanups.set(
      runId,
      setTimeout(() => this.remove(runId), 30 * 60 * 1000),
    );
  }
}

export const personaGenerationStore = new PersonaGenerationStore();
