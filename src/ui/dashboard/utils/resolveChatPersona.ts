import type { Persona } from '@/domain/entities/Persona'
import type { PersonaProfile } from '@/domain/entities/PersonaProfile'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { PersonaBatch } from '@/ui/stores/personaStore'

/**
 * Resolve the full Persona behind an analysis response so the report page can
 * chat in-character. Preference order:
 *  1. Exact `personaId` match inside the analysis's batch (if batchId known).
 *  2. Exact `personaId` match across any batch (batch may have been switched).
 *  3. Name match inside the analysis's batch (if batchId known).
 *  4. Name match across any batch (older runs lack personaId).
 *  5. Reconstruct a persona from the embedded PersonaProfile — degraded but
 *     usable when the source batch was deleted. Age is unknown → 0, and the
 *     prompt compiler renders `Age: —` for falsy ages.
 */
export function resolveChatPersona(
  analysis: PersonaResponse,
  batches: PersonaBatch[],
  batchId?: string,
): Persona | null {
  const id = analysis.personaId
  const name = analysis.personaProfile?.name

  const exactId = (p: Persona) => p.id === id
  const byName = (p: Persona) => p.name === name

  // If batchId is known, search that batch first to avoid cross-batch collisions
  const scopedBatch = batchId ? batches.find((b) => b.id === batchId) : null
  const batchesToSearch = scopedBatch ? [scopedBatch, ...batches.filter((b) => b.id !== batchId)] : batches

  if (id) {
    for (const batch of batchesToSearch) {
      const found = batch.personas.find(exactId)
      if (found) return found
    }
  }

  if (name) {
    for (const batch of batchesToSearch) {
      const found = batch.personas.find(byName)
      if (found) return found
    }
  }

  return analysis.personaProfile
    ? personaFromProfile(analysis.personaProfile, id ?? analysis.id)
    : null
}

/** Reconstruct a minimal chat-capable Persona from a display projection. */
export function personaFromProfile(
  profile: PersonaProfile,
  id: string,
): Persona {
  const {
    name,
    occupation,
    bigFive: {
      conscientiousness,
      neuroticism,
      openness,
      extraversion,
      agreeableness,
    },
    values,
    fears,
    communicationStyle,
    decisionStyle,
  } = profile

  return {
    id,
    name,
    age: 0, // unknown — compiler renders "—"
    occupation,
    educationLevel: '',
    interests: [],
    goals: [],
    conscientiousness,
    neuroticism,
    openness,
    extraversion,
    agreeableness,
    values: [...values],
    fears: [...fears],
    communicationStyle,
    decisionStyle,
  }
}
