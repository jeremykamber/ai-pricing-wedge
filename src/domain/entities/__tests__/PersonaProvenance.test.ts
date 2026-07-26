import { describe, it, expect } from 'vitest'
import { PersonaProvenanceSchema, TierLabel } from '../PersonaProvenance'

describe('PersonaProvenance', () => {
  it('should validate a correct provenance with tier labels', () => {
    const provenance = {
      attributes: [
        { attribute: 'values', tier: 'observed' as TierLabel, confidence: 0.95, evidence: 'User said "I value transparency"' },
        { attribute: 'personality', tier: 'interpreted' as TierLabel, confidence: 0.7 },
        { attribute: 'backstory', tier: 'synthetic' as TierLabel, confidence: 0.5 },
      ],
      generationMode: 'research',
      overallConfidence: 0.72,
    }
    const result = PersonaProvenanceSchema.safeParse(provenance)
    expect(result.success).toBe(true)
  })

  it('should reject invalid tier label', () => {
    const provenance = {
      attributes: [
        { attribute: 'values', tier: 'invented', confidence: 0.5 },
      ],
      generationMode: 'research',
      overallConfidence: 0.5,
    }
    const result = PersonaProvenanceSchema.safeParse(provenance)
    expect(result.success).toBe(false)
  })

  it('should reject confidence outside 0-1 range', () => {
    const provenance = {
      attributes: [
        { attribute: 'values', tier: 'observed' as TierLabel, confidence: 1.5 },
      ],
      generationMode: 'research',
      overallConfidence: 1.5,
    }
    const result = PersonaProvenanceSchema.safeParse(provenance)
    expect(result.success).toBe(false)
  })

  it('should reject invalid generationMode', () => {
    const provenance = {
      attributes: [
        { attribute: 'values', tier: 'observed' as TierLabel, confidence: 0.9 },
      ],
      generationMode: 'invalid-mode',
      overallConfidence: 0.9,
    }
    const result = PersonaProvenanceSchema.safeParse(provenance)
    expect(result.success).toBe(false)
  })

  it('should accept all three generation modes', () => {
    for (const mode of ['research', 'strategy', 'cluster'] as const) {
      const provenance = {
        attributes: [],
        generationMode: mode,
        overallConfidence: 0.5,
      }
      const result = PersonaProvenanceSchema.safeParse(provenance)
      expect(result.success).toBe(true)
    }
  })

  it('should accept optional source field on attributes', () => {
    const provenance = {
      attributes: [
        {
          attribute: 'values',
          tier: 'observed' as TierLabel,
          confidence: 0.9,
          source: 'transcript',
          evidence: 'Direct quote from interview',
        },
      ],
      generationMode: 'research',
      overallConfidence: 0.9,
    }
    const result = PersonaProvenanceSchema.safeParse(provenance)
    expect(result.success).toBe(true)
  })
})
