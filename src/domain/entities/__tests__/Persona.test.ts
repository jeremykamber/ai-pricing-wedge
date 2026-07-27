import { describe, it, expect } from 'vitest'
import { validatePersona, stringifyPersona } from '../Persona'

describe('Persona entity', () => {
  const validPersona = {
    id: '1',
    name: 'Test Persona',
    age: 30,
    occupation: 'Software Engineer',
    educationLevel: 'Bachelors',
    interests: ['coding'],
    goals: ['learning'],
    conscientiousness: 70,
    neuroticism: 40,
    openness: 80,
    extraversion: 30,
    agreeableness: 50,
    values: ['Efficiency'],
    fears: ['Wasted effort'],
    communicationStyle: 'Direct',
    decisionStyle: 'Data-driven',
    pricingSensitivity: 60,
    typicalBudget: 'Up to $20/user/month',
    backstory: 'A test backstory',
  }

  it('should validate a correct persona', () => {
    expect(validatePersona(validPersona)).toBe(true)
  })

  it('should reject null entity', () => {
    expect(validatePersona(null)).toBe(false)
  })

  it('should reject undefined entity', () => {
    expect(validatePersona(undefined)).toBe(false)
  })

  it('should reject empty object', () => {
    expect(validatePersona({})).toBe(false)
  })

  it('should stringify a persona correctly', () => {
    const str = stringifyPersona(validPersona)
    expect(str).toContain('Name: Test Persona')
    expect(str).toContain('Age: 30')
    expect(str).toContain('A test backstory')
  })

  it('stringifyPersona should handle null', () => {
    expect(stringifyPersona(null)).toBe('—')
  })

  it('stringifyPersona should handle undefined', () => {
    expect(stringifyPersona(undefined)).toBe('—')
  })

  it('stringifyPersona should handle empty object', () => {
    const str = stringifyPersona({})
    expect(str).toContain('Name: —')
  })
})
