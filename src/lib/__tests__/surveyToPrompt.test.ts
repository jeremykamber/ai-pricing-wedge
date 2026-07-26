import { describe, it, expect } from 'vitest'
import { surveyToPrompt } from '../surveyToPrompt'
import { PersonaSurveySchema } from '../surveyToPrompt'

describe('surveyToPrompt', () => {
  const minimalSurvey = {
    targetAudience: 'small business owners',
    goals: ['Save time'],
    frustration: 'Too much manual work',
    currentSolution: 'Spreadsheet',
    decisionFactors: ['Ease of use'],
    audienceKnowledge: 'I have interviewed many of them',
    decisionTypes: ['Pricing'],
  }

  it('should produce a string with all survey fields', () => {
    const result = surveyToPrompt(minimalSurvey)
    expect(result).toContain('small business owners')
    expect(result).toContain('Save time')
    expect(result).toContain('Too much manual work')
    expect(result).toContain('Spreadsheet')
    expect(result).toContain('Ease of use')
    expect(result).toContain('direct research with this audience')
    expect(result).toContain('Pricing')
  })

  it('should include confidence calibration based on audience knowledge', () => {
    const high = surveyToPrompt({ ...minimalSurvey, audienceKnowledge: 'I have interviewed many of them' })
    expect(high).toContain('HIGH')

    const low = surveyToPrompt({ ...minimalSurvey, audienceKnowledge: 'Mostly assumptions' })
    expect(low).toContain('LOWER')
  })

  it('should include optional additional notes', () => {
    const result = surveyToPrompt({
      ...minimalSurvey,
      additionalNotes: 'They are all in the US market',
    })
    expect(result).toContain('US market')
  })

  it('should handle up to 3 goals', () => {
    const result = surveyToPrompt({
      ...minimalSurvey,
      goals: ['Save time', 'Reduce costs', 'Grow revenue'],
    })
    expect(result).toContain('Save time')
    expect(result).toContain('Reduce costs')
    expect(result).toContain('Grow revenue')
  })

  it('should handle all decision types', () => {
    const result = surveyToPrompt({
      ...minimalSurvey,
      decisionTypes: ['Landing pages', 'Pricing', 'Product features'],
    })
    expect(result).toContain('Landing pages')
    expect(result).toContain('Pricing')
    expect(result).toContain('Product features')
  })
})

describe('PersonaSurveySchema', () => {
  it('should validate a valid survey', () => {
    const result = PersonaSurveySchema.safeParse({
      targetAudience: 'test',
      goals: ['Save time'],
      frustration: 'Too much manual work',
      currentSolution: 'Spreadsheet',
      decisionFactors: ['Ease of use'],
      audienceKnowledge: 'I have interviewed many of them',
      decisionTypes: ['Pricing'],
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty target audience', () => {
    const result = PersonaSurveySchema.safeParse({
      targetAudience: '',
      goals: ['Save time'],
      frustration: 'Too much manual work',
      currentSolution: 'Spreadsheet',
      decisionFactors: ['Ease of use'],
      audienceKnowledge: 'I have interviewed many of them',
      decisionTypes: ['Pricing'],
    })
    expect(result.success).toBe(false)
  })

  it('should accept up to 5 goals', () => {
    const result = PersonaSurveySchema.safeParse({
      targetAudience: 'test',
      goals: ['a', 'b', 'c', 'd', 'e'],
      frustration: 'Too much manual work',
      currentSolution: 'Spreadsheet',
      decisionFactors: ['Ease of use'],
      audienceKnowledge: 'I have interviewed many of them',
      decisionTypes: ['Pricing'],
    })
    expect(result.success).toBe(true)
  })
})
