import { describe, it, expect } from 'vitest'
import { dbToPersona, personaToDb } from '../PersonaMapper'

describe('PersonaMapper', () => {
  it('should map db record to entity', () => {
    const db = { id: '1' }
    const entity = dbToPersona(db)
    expect(entity.id).toBe('1')
  })
  it('should map entity to db record', () => {
    const entity = { id: '1' }
    const db = personaToDb(entity)
    expect(db.id).toBe('1')
  })
  // Add more tests here
})
