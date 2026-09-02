import { describe, it, expect } from 'vitest'
import { dbToPersona, personaToDb } from '../PersonaMapper'

describe('PersonaMapper', () => {
  const mockPersona = {
    id: '1',
    name: 'Test Persona',
    age: 30,
    occupation: 'Software Engineer',
    educationLevel: 'Bachelors',
    interests: ['coding'],
    goals: ['learning'],
    conscientiousness: 50,
    neuroticism: 50,
    openness: 50,
    extraversion: 50,
    agreeableness: 50,
    values: ['Efficiency'],
    fears: ['Wasted effort'],
    communicationStyle: 'Direct',
    decisionStyle: 'Data-driven',
    backstory: 'A test backstory'
  }

  it('should map db record to entity', () => {
    const db = {
      id: '1',
      name: 'Test Persona',
      age: 30,
      occupation: 'Software Engineer',
      educationLevel: 'Bachelors',
      interests: ['coding'],
      goals: ['learning'],
      personalityTraits: ['logical'],
      backstory: 'A test backstory'
    }
    const entity = dbToPersona(db)
    expect(entity.id).toBe('1')
    expect(entity.name).toBe('Test Persona')
  })

  it('should map entity to db record', () => {
    const db = personaToDb(mockPersona)
    expect(db.id).toBe('1')
    expect(db.name).toBe('Test Persona')
  })
})
