import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PersonaTraitsSuggestionDialog } from '../PersonaTraitsSuggestionDialog'
import { Persona } from '@/domain/entities/Persona'

afterEach(cleanup)

const mockPersona: Persona = {
  id: 'p1',
  name: 'Sarah Miller',
  age: 34,
  occupation: 'Engineer',
  educationLevel: 'BS',
  interests: ['tech'],
  goals: ['build'],
  conscientiousness: 85,
  neuroticism: 40,
  openness: 75,
  extraversion: 60,
  agreeableness: 45,
  values: ['Efficiency', 'Transparency'],
  fears: ['Wasting money'],
  communicationStyle: 'Direct, strategic',
  decisionStyle: 'Data-driven',
  pricingSensitivity: 50,
  typicalBudget: '$50/mo',
}

const mockTraits = {
  conscientiousness: 90,
  neuroticism: 30,
  openness: 70,
  extraversion: 55,
  agreeableness: 50,
  values: ['Quality', 'Precision'],
  fears: ['Bugs', 'Downtime'],
  communicationStyle: 'analytical',
  decisionStyle: 'data-driven',
}

describe('PersonaTraitsSuggestionDialog', () => {
  it('renders with suggested values and diff rows', () => {
    render(
      <PersonaTraitsSuggestionDialog
        isOpen={true}
        onClose={vi.fn()}
        onApply={vi.fn()}
        suggestedTraits={mockTraits}
        originalPersona={mockPersona}
      />
    )
    expect(screen.queryAllByText('Traits Inferred from Backstory').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('90')).toBeTruthy()
    expect(screen.queryAllByText(/Quality/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows loading spinner when suggestedTraits is null', () => {
    render(
      <PersonaTraitsSuggestionDialog
        isOpen={true}
        onClose={vi.fn()}
        onApply={vi.fn()}
        suggestedTraits={null}
        originalPersona={mockPersona}
      />
    )
    expect(screen.getByText('Analyzing backstory...')).toBeTruthy()
  })

  it('calls onApply with per-value decisions when confirming', () => {
    const onApply = vi.fn()
    render(
      <PersonaTraitsSuggestionDialog
        isOpen={true}
        onClose={vi.fn()}
        onApply={onApply}
        suggestedTraits={mockTraits}
        originalPersona={mockPersona}
      />
    )
    fireEvent.click(screen.getByText('Apply selections'))
    expect(onApply).toHaveBeenCalled()
    const decisions = onApply.mock.calls[0][0]
    expect(decisions.conscientiousness).toBe(true)
    expect(decisions.neuroticism).toBe(true)
    expect(decisions.values).toBe(true)
  })

  it('calls onApply with all false on Keep originals', () => {
    const onApply = vi.fn()
    render(
      <PersonaTraitsSuggestionDialog
        isOpen={true}
        onClose={vi.fn()}
        onApply={onApply}
        suggestedTraits={mockTraits}
        originalPersona={mockPersona}
      />
    )
    fireEvent.click(screen.getByText('Keep originals'))
    expect(onApply).toHaveBeenCalled()
    const decisions = onApply.mock.calls[0][0]
    expect(decisions.conscientiousness).toBe(false)
    expect(decisions.neuroticism).toBe(false)
  })

  it('shows Apply/Keep toggles per row on hover', () => {
    render(
      <PersonaTraitsSuggestionDialog
        isOpen={true}
        onClose={vi.fn()}
        onApply={vi.fn()}
        suggestedTraits={mockTraits}
        originalPersona={mockPersona}
      />
    )
    const applyButtons = screen.getAllByText('Apply')
    expect(applyButtons.length).toBeGreaterThanOrEqual(5)
    const keepButtons = screen.getAllByText('Keep')
    expect(keepButtons.length).toBeGreaterThanOrEqual(5)
  })
})
