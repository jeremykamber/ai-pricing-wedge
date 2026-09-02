import { describe, it, expect } from 'vitest'
import { PricingAnalysis, validatePricingAnalysis } from '../PricingAnalysis'

describe('PricingAnalysis entity', () => {
  const mockAnalysis:PricingAnalysis = {
    id: '1',
    url: 'https://example.com/pricing',
    screenshotBase64: 'base64data',
    thoughts: 'Some thoughts',
    scores: {
      clarity: 8,
      clarityReason: "The tiers are well laid out and easy to compare.",
      valuePerception: 7,
      valuePerceptionReason: "Good value for the features offered.",
      trust: 9,
      trustReason: "Transparent pricing builds confidence.",
      explorationIntent: 8,
      explorationIntentReason: "Would explore further to see integrations.",
      analysisIntent: 7,
      analysisIntentReason: "Worth a deeper look with the team.",
      buyIntent: 6,
      buyIntentReason: "Likely to buy after evaluation.",
    },
    risks: ['Risk 1'],
    aiSuggestion: "Needs more features/reasons to justify buying",
    recommendations: [],
  }

  it('should validate a correct analysis', () => {
    expect(validatePricingAnalysis(mockAnalysis)).toBe(true)
  })

  it('should fail validation for missing fields', () => {
    const invalid = { id: '1' } as any
    expect(validatePricingAnalysis(invalid)).toBe(false)
  })
})
