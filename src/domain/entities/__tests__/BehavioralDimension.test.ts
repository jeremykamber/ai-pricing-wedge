import { describe, it, expect } from 'vitest'
import { BehavioralDimensionSchema } from '../BehavioralDimension'

describe('BehavioralDimension', () => {
  it('should validate a correct behavioral dimension', () => {
    const dim = {
      name: 'friction-tolerance',
      score: 85,
      context: 'job search behavior',
      description: 'Tolerance for unnecessary workflow steps',
    }
    const result = BehavioralDimensionSchema.safeParse(dim)
    expect(result.success).toBe(true)
  })

  it('should reject score outside 0-100 range', () => {
    const dim = {
      name: 'friction-tolerance',
      score: 150,
      context: 'job search behavior',
      description: 'Tolerance for unnecessary workflow steps',
    }
    const result = BehavioralDimensionSchema.safeParse(dim)
    expect(result.success).toBe(false)
  })

  it('should reject negative score', () => {
    const dim = {
      name: 'friction-tolerance',
      score: -10,
      context: 'job search behavior',
      description: 'Tolerance for unnecessary workflow steps',
    }
    const result = BehavioralDimensionSchema.safeParse(dim)
    expect(result.success).toBe(false)
  })

  it('should accept optional evidence field', () => {
    const dim = {
      name: 'automation-preference',
      score: 90,
      context: 'job search behavior',
      description: 'Preference for automated repetitive tasks',
      evidence: 'User stated "I think Jobright makes it easier"',
    }
    const result = BehavioralDimensionSchema.safeParse(dim)
    expect(result.success).toBe(true)
  })

  it('should require name, score, context, and description', () => {
    const result = BehavioralDimensionSchema.safeParse({
      name: 'test',
      score: 50,
    })
    expect(result.success).toBe(false)
  })
})
