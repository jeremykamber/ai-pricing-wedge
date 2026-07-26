import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PersonaDetailSheet } from '../PersonaDetailSheet'
import { Persona } from '@/domain/entities/Persona'

afterEach(cleanup)

const basePersona: Persona = {
  id: 'p1',
  name: 'Sarah Miller',
  age: 34,
  occupation: 'Founder & CEO',
  educationLevel: 'MBA',
  interests: ['Hiking', 'Product Strategy'],
  goals: ['Scale revenue', 'Optimize burn rate'],
  conscientiousness: 85,
  neuroticism: 40,
  openness: 75,
  extraversion: 60,
  agreeableness: 45,
  values: ['Efficiency', 'Transparency'],
  fears: ['Wasting money', 'Hidden contract traps'],
  communicationStyle: 'Direct, strategic',
  decisionStyle: 'Data-driven but gut-checked',
  pricingSensitivity: 65,
  typicalBudget: 'Up to $20/user/month',
  backstory: 'I grew up in a household that valued frugality.',
}

describe('PersonaDetailSheet edit mode', () => {
  it('renders name as text by default, not as an input', () => {
    render(
      <PersonaDetailSheet
        persona={basePersona}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Sarah Miller')).toBeTruthy()
    expect(screen.queryByDisplayValue('Sarah Miller')).toBeNull()
  })

  it('shows edit inputs when Edit button is clicked', () => {
    const onEdit = vi.fn()
    render(
      <PersonaDetailSheet
        persona={basePersona}
        isOpen={true}
        onClose={vi.fn()}
        onEdit={onEdit}
      />
    )
    fireEvent.click(screen.getByLabelText('Edit persona'))
    expect(screen.getByDisplayValue('Sarah Miller')).toBeTruthy()
    expect(screen.getByDisplayValue('Founder & CEO')).toBeTruthy()
    expect(screen.getByDisplayValue('I grew up in a household that valued frugality.')).toBeTruthy()
  })

  it('shows Save and Cancel buttons in edit mode', () => {
    render(
      <PersonaDetailSheet
        persona={basePersona}
        isOpen={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Edit persona'))
    expect(screen.queryAllByText('Save Changes').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryAllByText('Cancel').length).toBeGreaterThanOrEqual(1)
  })

  it('calls onEdit with updated name on Save', () => {
    const onEdit = vi.fn()
    render(
      <PersonaDetailSheet
        persona={basePersona}
        isOpen={true}
        onClose={vi.fn()}
        onEdit={onEdit}
      />
    )
    fireEvent.click(screen.getByLabelText('Edit persona'))
    const nameInput = screen.getByDisplayValue('Sarah Miller')
    fireEvent.change(nameInput, { target: { value: 'Sarah Johnson' } })
    fireEvent.click(screen.getAllByText('Save Changes')[0])
    expect(onEdit).toHaveBeenCalledWith('p1', expect.objectContaining({
      name: 'Sarah Johnson',
    }))
  })

  it('does not call onEdit on Cancel', () => {
    const onEdit = vi.fn()
    render(
      <PersonaDetailSheet
        persona={basePersona}
        isOpen={true}
        onClose={vi.fn()}
        onEdit={onEdit}
      />
    )
    fireEvent.click(screen.getByLabelText('Edit persona'))
    fireEvent.click(screen.getAllByText('Cancel')[0])
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('shows Big Five as read-only in edit mode', () => {
    render(
      <PersonaDetailSheet
        persona={basePersona}
        isOpen={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Edit persona'))
    expect(screen.queryAllByText('Conscientiousness').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Inferred from backstory')).toBeTruthy()
  })

  it('allows editing backstory in textarea', () => {
    const onEdit = vi.fn()
    render(
      <PersonaDetailSheet
        persona={basePersona}
        isOpen={true}
        onClose={vi.fn()}
        onEdit={onEdit}
      />
    )
    fireEvent.click(screen.getByLabelText('Edit persona'))
    const backstoryInput = screen.getByDisplayValue('I grew up in a household that valued frugality.')
    fireEvent.change(backstoryInput, { target: { value: 'New backstory text here.' } })
    fireEvent.click(screen.getAllByText('Save Changes')[0])
    expect(onEdit).toHaveBeenCalledWith('p1', expect.objectContaining({
      backstory: 'New backstory text here.',
    }))
  })
})
