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
    fireEvent.click(screen.getByText('Edit Profile'))
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
    fireEvent.click(screen.getByText('Edit Profile'))
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
    fireEvent.click(screen.getByText('Edit Profile'))
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
    fireEvent.click(screen.getByText('Edit Profile'))
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
    fireEvent.click(screen.getByText('Edit Profile'))
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
    fireEvent.click(screen.getByText('Edit Profile'))
    const backstoryInput = screen.getByDisplayValue('I grew up in a household that valued frugality.')
    fireEvent.change(backstoryInput, { target: { value: 'New backstory text here.' } })
    fireEvent.click(screen.getAllByText('Save Changes')[0])
    expect(onEdit).toHaveBeenCalledWith('p1', expect.objectContaining({
      backstory: 'New backstory text here.',
    }))
  })
})

describe('PersonaDetailSheet evidence rendering', () => {
  // Strategy personas quote the user's own response; the disclosure must say
  // so and show the quote verbatim (evidence-integrity contract).
  const evidencePersona: Persona = {
    ...basePersona,
    generationMode: 'strategy',
    valueEvidence: ['asked for full autonomy over the roadmap'],
    fearEvidence: ['A churn spike would end the runway'],
    evidenceLinks: [{ transcriptId: 'user-input', excerpt: 'full autonomy over the roadmap', attribute: 'values' }],
  }

  it('labels strategy-mode sources "Your response" and renders quotes verbatim', () => {
    render(
      <PersonaDetailSheet
        persona={evidencePersona}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    // value evidence, fear evidence, and the evidenceLinks label
    expect(screen.getAllByText('Your response').length).toBe(3)
    expect(screen.getByText('“asked for full autonomy over the roadmap”')).toBeTruthy()
    expect(screen.getByText('“A churn spike would end the runway”')).toBeTruthy()
    expect(screen.getByText('“full autonomy over the roadmap”')).toBeTruthy()
    // the raw transcriptId is not shown for strategy — the source is the user's response
    expect(screen.queryByText('user-input')).toBeNull()
  })

  it('renders the guided-form question the quote answers in parentheses', () => {
    const withQuestions: Persona = {
      ...evidencePersona,
      evidenceQuestions: {
        'asked for full autonomy over the roadmap': 'Goals they are trying to accomplish',
        'A churn spike would end the runway': 'Biggest frustration',
        'full autonomy over the roadmap': 'Goals they are trying to accomplish',
      },
    }
    render(
      <PersonaDetailSheet
        persona={withQuestions}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('“asked for full autonomy over the roadmap”')).toBeTruthy()
    expect(screen.getByText('“A churn spike would end the runway”')).toBeTruthy()
    expect(screen.getByText('“full autonomy over the roadmap”')).toBeTruthy()
    // the parenthetical is a nested span; match it by its own content
    expect(screen.getAllByText(/^\(Answer to “Goals they are trying to accomplish” in audience description\)$/).length).toBe(2) // values + links
    expect(screen.getByText('(Answer to “Biggest frustration” in audience description)')).toBeTruthy()
  })

  it('keeps the generic "Source" label for research-mode personas', () => {
    render(
      <PersonaDetailSheet
        persona={{ ...evidencePersona, generationMode: 'research' }}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getAllByText('Source').length).toBe(2) // value + fear evidence
  })

  it('renders behavioral-dimension evidence the same way as value/fear sources', () => {
    const withDims: Persona = {
      ...evidencePersona,
      behavioralDimensions: [
        { name: 'Time-sensitivity', score: 85, context: 'tool adoption', description: 'Cuts hours', evidence: 'Save time' },
      ],
      evidenceQuestions: {
        'asked for full autonomy over the roadmap': 'Goals they are trying to accomplish',
        'A churn spike would end the runway': 'Biggest frustration',
        'full autonomy over the roadmap': 'Goals they are trying to accomplish',
        'Save time': 'Goals they are trying to accomplish',
      },
    }
    const { rerender } = render(
      <PersonaDetailSheet
        persona={withDims}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    // strategy mode: "Your response" label + single curly wrap + question
    expect(screen.getAllByText('Your response').length).toBe(4) // value + fear + link + dim
    expect(screen.getByText('“Save time”')).toBeTruthy()
    expect(screen.getAllByText(/^\(Answer to “Goals they are trying to accomplish” in audience description\)$/).length).toBe(3) // values + link + dim

    rerender(
      <PersonaDetailSheet
        persona={{ ...withDims, generationMode: 'research' }}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getAllByText('Source').length).toBe(3) // value + fear + dim
  })
})
