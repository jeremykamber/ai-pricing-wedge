import { describe, it, expect } from 'vitest'
import { PersonaAdapter } from '../PersonaAdapter'
import { surveyToPrompt, type PersonaSurvey } from '@/lib/surveyToPrompt'

// The private evidenceQuestionsFor maps each evidence quote to the label of the
// input section containing it. Regression coverage for the deployed "every ICP
// quote says (Answer to "Target audience")" bug: the section split relies on
// blank-line separators, so a description written as newline-separated labelled
// lines (no blank lines) collapses to ONE section whose first label is used for
// every quote.
const adapterForQuestions = PersonaAdapter as unknown as {
  evidenceQuestionsFor(
    description: string,
    p: Record<string, unknown>,
  ): Record<string, string> | undefined
}

const survey: PersonaSurvey = {
  targetAudience: 'Small business owners',
  goals: ['Save time', 'Reduce costs'],
  frustration: 'Too much manual work',
  currentSolution: 'Spreadsheet',
  decisionFactors: ['Ease of use', 'Price'],
  audienceKnowledge: 'I have interviewed many of them',
  decisionTypes: ['Landing pages', 'Pricing'],
}

const profile = {
  valueEvidence: ['Save time', 'Small business owners', 'Ease of use'],
  fearEvidence: ['Too much manual work'],
  behavioralDimensions: [{ evidence: 'Spreadsheet' }],
  evidenceLinks: [{ excerpt: 'Landing pages' }],
}

describe('evidenceQuestionsFor', () => {
  it('maps quotes to their own section when the description uses blank-line sections (guided form)', () => {
    const questions = adapterForQuestions.evidenceQuestionsFor(
      surveyToPrompt(survey),
      profile,
    )
    expect(questions?.['Save time']).toBe('Goals they are trying to accomplish')
    expect(questions?.['Small business owners']).toBe('Target audience')
    expect(questions?.['Ease of use']).toBe('Top factors when choosing a product')
    expect(questions?.['Too much manual work']).toBe('Biggest frustration')
    expect(questions?.['Spreadsheet']).toBe('Current solution')
    expect(questions?.['Landing pages']).toBe('Primary decisions to model')
  })

  it('does NOT label quotes from a single unlabelled paragraph (textarea, no labels)', () => {
    const description =
      'B2B SaaS founders dealing with high churn rates, usually aged 30-45. ' +
      'They want to save time on admin and reduce tool sprawl.'
    const questions = adapterForQuestions.evidenceQuestionsFor(description, profile)
    // Quotes are verbatim fragments of the description, but there is no
    // labelled section to attribute them to — the UI must omit the
    // parenthetical instead of inventing a question.
    expect(questions).toBeUndefined()
  })

  it('omits question labels when sections are newline-separated without blank lines (freeform textarea)', () => {
    // A user typing labelled lines into the textarea (Enter between lines, no
    // blank line) — previously collapsed to one section and every quote was
    // answered with the first label ("Target audience"). With no blank-line
    // structure there is no reliable section boundary, so the honest output
    // is no question attribution (UI omits the parenthetical).
    const description = [
      'Target audience: Small business owners',
      'Goals they are trying to accomplish: Save time, Reduce costs',
      'Biggest frustration: Too much manual work',
      'Current solution: Spreadsheet',
      'Top factors when choosing a product: Ease of use, Price',
      'Primary decisions to model: Landing pages, Pricing',
    ].join('\n')

    const questions = adapterForQuestions.evidenceQuestionsFor(description, profile)
    expect(questions).toBeUndefined()
  })
})
