import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CitationTooltip, type EvidenceCitation } from '../CitationTooltip'
import { RawThinkAloudSheet } from '../RawThinkAloudSheet'

afterEach(cleanup)

// The transcript stands in for a persona's rawAnalysis. The quote MUST be a
// verbatim substring of it — that invariant is what the popover and the
// drawer's highlight both rely on.
const TRANSCRIPT = [
  'I land on the pricing page and immediately start scanning for the enterprise tier.',
  'The contact sales gate stops me cold because I cannot tell whether SSO is even included.',
  'Honestly, I would probably leave right here without converting.',
].join(' ')

const QUOTE = 'The contact sales gate stops me cold'

const citation: EvidenceCitation = {
  personaId: 'persona-1',
  personaName: 'Sarah Miller',
  quote: QUOTE,
}

describe('CitationTooltip', () => {
  it('renders one badge per citation and no popover initially', () => {
    render(
      <CitationTooltip
        citations={[
          citation,
          {
            personaId: 'persona-2',
            personaName: 'Jordan Chen',
            quote: 'Honestly, I would probably leave right here',
          },
        ]}
        onOpenTranscript={vi.fn()}
      />
    )
    expect(screen.getAllByLabelText(/Show citation from/)).toHaveLength(2)
    expect(screen.queryByText(QUOTE)).toBeNull()
  })

  it('click opens the popover with persona role and the verbatim quote', () => {
    render(
      <CitationTooltip
        citations={[citation]}
        onOpenTranscript={vi.fn()}
        getPersonaRole={() => 'VP of Engineering'}
      />
    )
    const badge = screen.getByLabelText('Show citation from Sarah Miller')
    // A real click arrives as pointerdown → mousedown → click; Radix HoverCard
    // binds the pointer variant only, so the tests send what the browser sends.
    fireEvent.pointerDown(badge)
    expect(screen.getByText('VP of Engineering')).toBeTruthy()
    const shown = screen.getByText(QUOTE).textContent
    expect(shown).toBe(QUOTE)
    // The quote card may never paraphrase: it must be a substring of the
    // transcript the drawer would open.
    expect(TRANSCRIPT).toContain(shown ?? '')
  })

  it('hover opens the popover (pointer-enter path)', () => {
    render(<CitationTooltip citations={[citation]} onOpenTranscript={vi.fn()} />)
    // React derives onPointerEnter from the bubbling pointerover event, so
    // that is what the test dispatches — same path a real hover takes.
    fireEvent.pointerOver(screen.getByLabelText('Show citation from Sarah Miller'))
    expect(screen.getByText(QUOTE)).toBeTruthy()
  })

  it('View full transcript calls onOpenTranscript with the citation and closes the popover', () => {
    const onOpenTranscript = vi.fn()
    render(<CitationTooltip citations={[citation]} onOpenTranscript={onOpenTranscript} />)
    fireEvent.pointerDown(screen.getByLabelText('Show citation from Sarah Miller'))
    fireEvent.click(screen.getByRole('button', { name: 'View full transcript' }))
    expect(onOpenTranscript).toHaveBeenCalledWith(citation)
    expect(screen.queryByText(QUOTE)).toBeNull()
  })

  it('pressing outside closes the popover', () => {
    render(<CitationTooltip citations={[citation]} onOpenTranscript={vi.fn()} />)
    fireEvent.pointerDown(screen.getByLabelText('Show citation from Sarah Miller'))
    expect(screen.getByText(QUOTE)).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByText(QUOTE)).toBeNull()
  })
})

describe('RawThinkAloudSheet', () => {
  const baseProps = {
    open: true,
    personaName: 'Sarah Miller',
    transcript: TRANSCRIPT,
  }

  it('shows the persona name and the full monologue', () => {
    render(<RawThinkAloudSheet {...baseProps} onOpenChange={vi.fn()} />)
    expect(screen.getByText('Sarah Miller')).toBeTruthy()
    // Radix portals the sheet into document.body, so assert there.
    expect(document.body.textContent).toContain('scanning for the enterprise tier')
    expect(document.body.textContent).toContain('without converting')
  })

  it('marks exactly the first occurrence of the highlight quote', () => {
    render(
      <RawThinkAloudSheet {...baseProps} onOpenChange={vi.fn()} highlight={QUOTE} />
    )
    // Radix portals the sheet into document.body, so query there.
    const marks = document.body.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe(QUOTE)
  })

  it('renders the monologue without a mark when the highlight does not match', () => {
    render(
      <RawThinkAloudSheet
        {...baseProps}
        onOpenChange={vi.fn()}
        highlight="not in transcript"
      />
    )
    expect(document.body.querySelectorAll('mark')).toHaveLength(0)
    expect(document.body.textContent).toContain('scanning for the enterprise tier')
  })

  it('requests close when the sheet close button is pressed', () => {
    const onOpenChange = vi.fn()
    render(<RawThinkAloudSheet {...baseProps} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByText('Close'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
