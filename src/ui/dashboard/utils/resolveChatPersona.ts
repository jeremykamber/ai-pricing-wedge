import type { Persona } from '@/domain/entities/Persona'
import type { PersonaProfile } from '@/domain/entities/PersonaProfile'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { PersonaBatch } from '@/ui/stores/personaStore'

/**
 * Resolve the full Persona behind an analysis response so the report page can
 * chat in-character. Preference order:
 *  1. Exact `personaId` match inside the analysis's batch (if known).
 *  2. Exact `personaId` match across any batch (batch may have been switched).
 *  3. Name match across any batch (older runs lack personaId).
 *  4. Reconstruct a persona from the embedded PersonaProfile — degraded but
 *     usable when the source batch was deleted. Age is unknown → 0, and the
 *     prompt compiler renders `Age: —` for falsy ages.
 */
export function resolveChatPersona(
  analysis: PersonaResponse,
  batches: PersonaBatch[],
): Persona | null {
  const id = analysis.personaId
  const name = analysis.personaProfile?.name

  const exactId = (p: Persona) => p.id === id
  const byName = (p: Persona) => p.name === name

  if (id) {
    for (const batch of batches) {
      const found = batch.personas.find(exactId)
      if (found) return found
    }
  }

  if (name) {
    for (const batch of batches) {
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
