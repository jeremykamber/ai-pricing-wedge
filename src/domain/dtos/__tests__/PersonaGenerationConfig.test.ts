import { describe, it, expect } from 'vitest'
import {
  ResearchPersonaConfigSchema,
  StrategyPersonaConfigSchema,
  ClusterPersonaConfigSchema,
} from '../PersonaGenerationConfig'

describe('ResearchPersonaConfig', () => {
  it('should validate a valid research config', () => {
    const result = ResearchPersonaConfigSchema.safeParse({
      count: 3,
      personaDescription: 'Junior backend engineers looking for jobs',
      evidenceThreshold: 0.7,
      preserveUncertainty: true,
    })
    expect(result.success).toBe(true)
  })

  it('should accept optional interviewIds', () => {
    const result = ResearchPersonaConfigSchema.safeParse({
      count: 3,
      personaDescription: 'Test',
      interviewIds: ['int-1', 'int-2'],
    })
    expect(result.success).toBe(true)
  })

  it('should reject evidenceThreshold outside 0-1', () => {
    const result = ResearchPersonaConfigSchema.safeParse({
      count: 3,
      personaDescription: 'Test',
      evidenceThreshold: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('should reject count above max', () => {
    const result = ResearchPersonaConfigSchema.safeParse({
      count: 11,
      personaDescription: 'Test',
    })
    expect(result.success).toBe(false)
  })

  it('should reject count below min', () => {
    const result = ResearchPersonaConfigSchema.safeParse({
      count: 0,
      personaDescription: 'Test',
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty personaDescription', () => {
    const result = ResearchPersonaConfigSchema.safeParse({
      count: 3,
      personaDescription: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('StrategyPersonaConfig', () => {
  it('should validate a valid strategy config', () => {
    const result = StrategyPersonaConfigSchema.safeParse({
      count: 5,
      personaDescription: 'Enterprise buyers',
      allowSyntheticBackstory: true,
      storytellingLevel: 'rich',
    })
    expect(result.success).toBe(true)
  })

  it('should accept all three storytelling levels', () => {
    for (const level of ['conservative', 'moderate', 'rich'] as const) {
      const result = StrategyPersonaConfigSchema.safeParse({
        count: 3,
        personaDescription: 'Test',
        storytellingLevel: level,
      })
      expect(result.success).toBe(true)
    }
  })

  it('should reject invalid storytelling level', () => {
    const result = StrategyPersonaConfigSchema.safeParse({
      count: 3,
      personaDescription: 'Test',
      storytellingLevel: 'extreme',
    })
    expect(result.success).toBe(false)
  })
})

describe('ClusterPersonaConfig', () => {
  it('should validate a valid cluster config', () => {
    const result = ClusterPersonaConfigSchema.safeParse({
      count: 3,
      personaDescription: 'Representative users',
      interviewIds: ['int-1', 'int-2', 'int-3'],
      clusterLabel: 'Efficiency-focused engineers',
      minClusterSize: 5,
    })
    expect(result.success).toBe(true)
  })

  it('should allow optional personaDescription', () => {
    const result = ClusterPersonaConfigSchema.safeParse({
      count: 3,
      interviewIds: ['int-1'],
      clusterLabel: 'Test',
      minClusterSize: 1,
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty interviewIds', () => {
    const result = ClusterPersonaConfigSchema.safeParse({
      count: 3,
      interviewIds: [],
      clusterLabel: 'Test',
      minClusterSize: 1,
    })
    expect(result.success).toBe(false)
  })

  it('should reject minClusterSize less than 1', () => {
    const result = ClusterPersonaConfigSchema.safeParse({
      count: 3,
      interviewIds: ['int-1'],
      clusterLabel: 'Test',
      minClusterSize: 0,
    })
    expect(result.success).toBe(false)
  })
})
