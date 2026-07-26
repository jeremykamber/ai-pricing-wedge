import { describe, it, expect, beforeEach } from 'vitest'
import { usePersonaStore, type PersonaBatch } from '../personaStore'
import { Persona } from '@/domain/entities/Persona'

function createBatch(overrides?: Partial<PersonaBatch>): PersonaBatch {
  return {
    id: 'batch-1',
    label: 'Test Batch',
    source: 'description',
    createdAt: new Date().toISOString(),
    personas: [
      { id: 'p1', name: 'Alice', age: 30, occupation: 'Engineer', educationLevel: 'BS', interests: [], goals: [], conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50, values: [], fears: [], communicationStyle: '', decisionStyle: '', pricingSensitivity: 50, typicalBudget: '' },
      { id: 'p2', name: 'Bob', age: 35, occupation: 'Designer', educationLevel: 'BFA', interests: [], goals: [], conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50, values: [], fears: [], communicationStyle: '', decisionStyle: '', pricingSensitivity: 50, typicalBudget: '' },
      { id: 'p3', name: 'Charlie', age: 28, occupation: 'PM', educationLevel: 'MBA', interests: [], goals: [], conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50, values: [], fears: [], communicationStyle: '', decisionStyle: '', pricingSensitivity: 50, typicalBudget: '' },
    ],
    ...overrides,
  }
}

describe('personaStore', () => {
  beforeEach(() => {
    usePersonaStore.setState({ batches: [], activeBatchId: null })
  })

  it('addBatch adds a batch without setting it active', () => {
    const batch = createBatch()
    usePersonaStore.getState().addBatch(batch)

    const state = usePersonaStore.getState()
    expect(state.batches).toHaveLength(1)
    // addBatch intentionally does NOT set activeBatchId so the batch list view stays visible
    expect(state.activeBatchId).toBeNull()
  })

  it('insertPersonasAfter inserts right after the reference persona', () => {
    const batch = createBatch()
    usePersonaStore.getState().addBatch(batch)

    const newPersonas: Persona[] = [
      { id: 'v1', name: 'Variant 1', age: 25, occupation: 'Eng', educationLevel: 'BS', interests: [], goals: [], conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50, values: [], fears: [], communicationStyle: '', decisionStyle: '', pricingSensitivity: 50, typicalBudget: '', variantOf: { id: 'p1', name: 'Alice' } },
      { id: 'v2', name: 'Variant 2', age: 32, occupation: 'Eng', educationLevel: 'MS', interests: [], goals: [], conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50, values: [], fears: [], communicationStyle: '', decisionStyle: '', pricingSensitivity: 50, typicalBudget: '', variantOf: { id: 'p1', name: 'Alice' } },
    ]

    usePersonaStore.getState().insertPersonasAfter('batch-1', 'p1', newPersonas)

    const state = usePersonaStore.getState()
    const personas = state.batches[0].personas
    expect(personas).toHaveLength(5)
    expect(personas[0].id).toBe('p1')
    expect(personas[1].id).toBe('v1')
    expect(personas[2].id).toBe('v2')
    expect(personas[3].id).toBe('p2')
    expect(personas[4].id).toBe('p3')
  })

  it('insertPersonasAfter appends at end if reference not found', () => {
    const batch = createBatch()
    usePersonaStore.getState().addBatch(batch)

    const newPersona: Persona = { id: 'v1', name: 'Variant', age: 25, occupation: 'Eng', educationLevel: 'BS', interests: [], goals: [], conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50, values: [], fears: [], communicationStyle: '', decisionStyle: '', pricingSensitivity: 50, typicalBudget: '' }

    usePersonaStore.getState().insertPersonasAfter('batch-1', 'nonexistent', [newPersona])

    const state = usePersonaStore.getState()
    expect(state.batches[0].personas).toHaveLength(3)
  })

  it('updatePersona partially updates a persona', () => {
    const batch = createBatch()
    usePersonaStore.getState().addBatch(batch)

    usePersonaStore.getState().updatePersona('batch-1', 'p2', {
      name: 'Robert',
      occupation: 'Senior Designer',
      backstory: 'A new backstory',
    })

    const state = usePersonaStore.getState()
    const updated = state.batches[0].personas.find((p) => p.id === 'p2')
    expect(updated?.name).toBe('Robert')
    expect(updated?.occupation).toBe('Senior Designer')
    expect(updated?.backstory).toBe('A new backstory')
    // Unchanged fields preserved
    expect(updated?.age).toBe(35)
    expect(updated?.educationLevel).toBe('BFA')
  })

  it('updatePersona on nonexistent persona does nothing', () => {
    const batch = createBatch()
    usePersonaStore.getState().addBatch(batch)

    usePersonaStore.getState().updatePersona('batch-1', 'nonexistent', { name: 'Ghost' })

    const state = usePersonaStore.getState()
    expect(state.batches[0].personas).toHaveLength(3)
  })
})
