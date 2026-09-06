import type { Persona } from '@/domain/entities/Persona'
import { ExpiringStore } from './ExpiringStore'

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
 * Delegates to ExpiringStore for HMR-safe storage and TTL cleanup.
 */
class PersonaGenerationStore {
  private readonly store = new ExpiringStore<StoredPersonaGeneration>(
    '__kynd_persona_generation_results',
    '__kynd_persona_generation_cleanups',
  );

  save(runId: string, personas: Persona[]): void {
    console.log(`[PERSONA_STORE] Saving ${personas.length} personas for ${runId}`);
    this.store.set(runId, {
      personas,
      completedAt: new Date().toISOString(),
    });
  }

  saveError(runId: string, error: string): void {
    console.log(`[PERSONA_STORE] Saving error for ${runId}: ${error}`);
    this.store.set(runId, {
      personas: [],
      completedAt: new Date().toISOString(),
      error,
    });
  }

  get(runId: string): StoredPersonaGeneration | undefined {
    return this.store.get(runId);
  }

  remove(runId: string): void {
    this.store.delete(runId);
  }
}

export const personaGenerationStore = new PersonaGenerationStore();
