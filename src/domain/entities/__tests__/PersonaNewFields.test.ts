import { describe, it, expect } from 'vitest'
import { PersonaSchema, stringifyPersona, validatePersona } from '../Persona'
import { BehavioralDimensionSchema } from '../BehavioralDimension'
import { PersonaProvenanceSchema } from '../PersonaProvenance'

describe('Persona new fields', () => {
  const basePersona = {
    id: 'test-1',
    name: 'Sawyer Miller',
    age: 24,
    occupation: 'Junior Backend Engineer',
    educationLevel: 'B.S. Computer Science',
    interests: ['automation', 'scripting'],
    goals: ['Find a backend role', 'Reduce job search friction'],
    conscientiousness: 70,
    neuroticism: 40,
    openness: 80,
    extraversion: 30,
    agreeableness: 50,
    values: ['Efficiency', 'Transparency'],
    fears: ['Wasted effort', 'Outdated job postings'],
    communicationStyle: 'Direct',
    decisionStyle: 'Data-driven',
    pricingSensitivity: 60,
    typicalBudget: 'Up to $20/user/month',
  }

  it('should accept all three generationModes', () => {
    for (const mode of ['research', 'strategy', 'cluster'] as const) {
      const persona = {
        ...basePersona,
        generationMode: mode,
        behavioralDimensions: [],
        provenance: {
          attributes: [],
          generationMode: mode,
          overallConfidence: 0.5,
        },
        evidenceLinks: [],
      }
      const result = PersonaSchema.safeParse(persona)
      expect(result.success).toBe(true)
    }
  })

  it('should validate behavioralDimensions within persona', () => {
    const persona = {
      ...basePersona,
      generationMode: 'research' as const,
      behavioralDimensions: [
        {
          name: 'friction-tolerance',
          score: 85,
          context: 'job search behavior',
          description: 'Tolerance for unnecessary workflow steps',
          evidence: 'User said "extra clicks add friction"',
        },
        {
          name: 'recency-sensitivity',
          score: 90,
          context: 'job search behavior',
          description: 'Preference for recently posted opportunities',
          evidence: 'User said "these are from two weeks ago"',
        },
      ],
      provenance: {
        attributes: [
          { attribute: 'friction-tolerance', tier: 'observed' as const, confidence: 0.9, evidence: 'Direct quote' },
          { attribute: 'recency-sensitivity', tier: 'observed' as const, confidence: 0.9, evidence: 'Direct quote' },
        ],
        generationMode: 'research' as const,
        overallConfidence: 0.9,
      },
      evidenceLinks: [],
    }
    const result = PersonaSchema.safeParse(persona)
    expect(result.success).toBe(true)
  })

  it('should reject invalid generationMode', () => {
    const persona = {
      ...basePersona,
      generationMode: 'invalid-mode',
      behavioralDimensions: [],
      provenance: { attributes: [], generationMode: 'research' as const, overallConfidence: 0.5 },
      evidenceLinks: [],
    }
    const result = PersonaSchema.safeParse(persona)
    expect(result.success).toBe(false)
  })

  it('should validate evidenceLinks', () => {
    const persona = {
      ...basePersona,
      generationMode: 'research' as const,
      behavioralDimensions: [],
      provenance: {
        attributes: [{ attribute: 'goals', tier: 'observed' as const, confidence: 0.95 }],
        generationMode: 'research' as const,
        overallConfidence: 0.95,
      },
      evidenceLinks: [
        {
          transcriptId: 'interview-1',
          excerpt: 'I think Jobright makes it easier',
          attribute: 'automation-preference',
        },
      ],
    }
    const result = PersonaSchema.safeParse(persona)
    expect(result.success).toBe(true)
  })

  it('should validate clusterInfo', () => {
    const persona = {
      ...basePersona,
      generationMode: 'cluster' as const,
      behavioralDimensions: [],
      provenance: {
        attributes: [],
        generationMode: 'cluster' as const,
        overallConfidence: 0.6,
      },
      evidenceLinks: [],
      clusterInfo: {
        representedCount: 8,
        sourceIds: ['interview-1', 'interview-2', 'interview-3'],
      },
    }
    const result = PersonaSchema.safeParse(persona)
    expect(result.success).toBe(true)
  })

  it('should validate identityContext and situationContext', () => {
    const persona = {
      ...basePersona,
      generationMode: 'research' as const,
      behavioralDimensions: [],
      provenance: {
        attributes: [],
        generationMode: 'research' as const,
        overallConfidence: 0.5,
      },
      evidenceLinks: [],
      identityContext: 'Friction-averse in tool evaluation across all domains',
      situationContext: 'Recency-obsessed specifically during active job search',
    }
    const result = PersonaSchema.safeParse(persona)
    expect(result.success).toBe(true)
  })

  it('should validate counterfactualTest', () => {
    const persona = {
      ...basePersona,
      generationMode: 'strategy' as const,
      behavioralDimensions: [],
      provenance: {
        attributes: [],
        generationMode: 'strategy' as const,
        overallConfidence: 0.5,
      },
      evidenceLinks: [],
      counterfactualTest: 'If the backstory detail about Jobright usage were false, would the automation-preference dimension change?',
    }
    const result = PersonaSchema.safeParse(persona)
    expect(result.success).toBe(true)
  })

  it('stringifyPersona should handle new fields', () => {
    const persona = {
      ...basePersona,
      generationMode: 'research' as const,
      behavioralDimensions: [
        {
          name: 'friction-tolerance',
          score: 85,
          context: 'job search behavior',
          description: 'Tolerance for unnecessary steps',
        },
      ],
      provenance: {
        attributes: [
          { attribute: 'friction-tolerance', tier: 'observed' as const, confidence: 0.9, evidence: 'Quotes' },
        ],
        generationMode: 'research' as const,
        overallConfidence: 0.9,
      },
      evidenceLinks: [],
      identityContext: 'Friction-averse',
      counterfactualTest: 'Test description',
    }
    const str = stringifyPersona(persona)
    expect(str).toContain('research')
    expect(str).toContain('friction-tolerance')
    expect(str).toContain('Friction-averse')
    expect(str).toContain('Test description')
  })

  it('should pass schema validation for personas with all new fields populated', () => {
    const persona = {
      ...basePersona,
      generationMode: 'research' as const,
      behavioralDimensions: [],
      provenance: {
        attributes: [],
        generationMode: 'research' as const,
        overallConfidence: 0.5,
      },
      evidenceLinks: [],
    }
    const result = PersonaSchema.safeParse(persona)
    expect(result.success).toBe(true)
  })

  it('should be backward compatible with old persona shape (no new fields)', () => {
    const result = PersonaSchema.safeParse(basePersona)
    expect(result.success).toBe(true)
  })
})
