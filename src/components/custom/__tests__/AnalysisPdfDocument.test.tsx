import { describe, it, expect } from 'vitest'
import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { AnalysisPdfDocument } from '../AnalysisPdfDocument'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'

const mockResponses: PersonaResponse[] = [
  {
    id: 'resp-1',
    personaId: 'p-1',
    screenshotBase64: '',
    rawAnalysis: 'Raw trace...',
    overview: 'The user understood the core value proposition quickly.',
    researchQuestionAnswer: 'Pricing is clear but extra fees caused hesitation.',
    customerJourney: [
      { stage: 'interpretation', description: 'Understood the headline.', sentiment: 'positive', outcome: 'succeeded' },
      { stage: 'understanding', description: 'Understood feature tiers.', sentiment: 'positive', outcome: 'succeeded' },
      { stage: 'belief', description: 'Believed social proof logos.', sentiment: 'neutral', outcome: 'succeeded' },
      { stage: 'motivation', description: 'Motivated by self-serve demo.', sentiment: 'positive', outcome: 'succeeded' },
      { stage: 'action', description: 'Hesitated on annual discount toggle.', sentiment: 'neutral', outcome: 'stopped' },
    ],
    majorFindings: [
      {
        observation: 'Confused by annual vs monthly billing toggle',
        evidence: 'Spent 20 seconds looking for monthly price breakdown',
        impact: 'May bounce before starting trial',
      },
    ],
    pointsOfFriction: ['Annual discount is misleading'],
    unansweredQuestions: ['Is there a setup fee?'],
    personaProfile: {
      name: 'Alex Rivera',
      occupation: 'Growth Lead',
      bigFive: { conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 60, agreeableness: 50 },
      values: ['Speed', 'Simplicity'],
      fears: ['Hidden costs'],
      communicationStyle: 'Direct',
      decisionStyle: 'Pragmatic',
    },
  },
  {
    id: 'resp-2',
    personaId: 'p-2',
    screenshotBase64: '',
    rawAnalysis: 'Raw trace 2...',
    overview: 'User felt the enterprise tier lacked feature transparency.',
    researchQuestionAnswer: 'Enterprise contact form felt like a blocker.',
    customerJourney: [
      { stage: 'interpretation', description: 'Understood the hero text.', sentiment: 'positive', outcome: 'succeeded' },
      { stage: 'understanding', description: 'Could not find SSO pricing.', sentiment: 'negative', outcome: 'blocked' },
      { stage: 'belief', description: 'Trusted brand reputation.', sentiment: 'positive', outcome: 'succeeded' },
      { stage: 'motivation', description: 'Wanted security compliance sheet.', sentiment: 'neutral', outcome: 'succeeded' },
      { stage: 'action', description: 'Did not click talk to sales.', sentiment: 'negative', outcome: 'stopped' },
    ],
    majorFindings: [
      {
        observation: 'Enterprise tier requires sales call for basic SAML SSO',
        evidence: 'Pricing table says Contact Us under Security',
        impact: 'High churn among security-conscious buyers',
      },
    ],
    pointsOfFriction: ['No transparent SSO pricing'],
    unansweredQuestions: ['What is the SOC2 compliance status?'],
    personaProfile: {
      name: 'Jordan Chen',
      occupation: 'VP of Engineering',
      bigFive: { conscientiousness: 90, neuroticism: 40, openness: 60, extraversion: 40, agreeableness: 60 },
      values: ['Security', 'Compliance'],
      fears: ['Breaches'],
      communicationStyle: 'Technical',
      decisionStyle: 'Analytical',
    },
  },
]

const mockSynthesis: ArtifactSynthesis = {
  overview: 'The audience generally grasped the core positioning, but enterprise features lack upfront pricing transparency.',
  researchQuestionAnswer: 'Prospective buyers understand the entry tiers but enterprise prospects hit friction with gated sales forms.',
  topFindings: [
    {
      observation: 'Enterprise tier requires sales call for basic SAML SSO',
      evidence: 'Observed across technical buyers',
      impact: 'High churn among security-conscious buyers',
      confidence: 'strongly supported',
      affectedPersonaCount: 2,
      totalPersonaCount: 2,
    },
  ],
  disagreements: [],
  biggestFrictions: ['No transparent SSO pricing', 'Annual discount toggle confusion'],
  completedCount: 2,
  failedCount: 0,
  totalPersonaCount: 2,
}

const baseAnalysis: ArtifactAnalysis = {
  id: 'analysis-123',
  name: '"SaaS ICPs" on Acme.com',
  url: 'https://acme.com/pricing',
  status: 'COMPLETED',
  batchName: 'SaaS ICPs',
  personaCount: 2,
  createdAt: '2026-08-20T12:00:00.000Z',
  completedAt: '2026-08-20T12:05:00.000Z',
  responses: mockResponses,
  synthesis: mockSynthesis,
}

describe('AnalysisPdfDocument', () => {
  it('renders a full analysis with pre-computed synthesis to a PDF blob', async () => {
    const doc = <AnalysisPdfDocument analysis={baseAnalysis} />
    const blob = await pdf(doc).toBlob()
    expect(blob).toBeDefined()
    expect(blob.size).toBeGreaterThan(100)
    expect(blob.type).toBe('application/pdf')
  })

  it('renders correctly when synthesis is missing by deriving it from responses', async () => {
    const analysisWithoutSynthesis: ArtifactAnalysis = {
      ...baseAnalysis,
      synthesis: undefined,
    }
    const doc = <AnalysisPdfDocument analysis={analysisWithoutSynthesis} />
    const blob = await pdf(doc).toBlob()
    expect(blob).toBeDefined()
    expect(blob.size).toBeGreaterThan(100)
  })

  it('handles partial / failed personas without throwing', async () => {
    const partialAnalysis: ArtifactAnalysis = {
      ...baseAnalysis,
      responses: [
        mockResponses[0],
        {
          id: 'resp-failed',
          personaId: 'p-3',
          screenshotBase64: '',
          rawAnalysis: '',
          overview: 'Analysis failed for this persona due to timeout.',
          researchQuestionAnswer: '',
          customerJourney: [],
          majorFindings: [],
          pointsOfFriction: [],
          unansweredQuestions: [],
        },
      ],
      synthesis: undefined,
    }
    const doc = <AnalysisPdfDocument analysis={partialAnalysis} />
    const blob = await pdf(doc).toBlob()
    expect(blob).toBeDefined()
    expect(blob.size).toBeGreaterThan(100)
  })

  it('handles completely empty responses gracefully', async () => {
    const emptyAnalysis: ArtifactAnalysis = {
      ...baseAnalysis,
      responses: [],
      synthesis: undefined,
    }
    const doc = <AnalysisPdfDocument analysis={emptyAnalysis} />
    const blob = await pdf(doc).toBlob()
    expect(blob).toBeDefined()
    expect(blob.size).toBeGreaterThan(100)
  })
})
