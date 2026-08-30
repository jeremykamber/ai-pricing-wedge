import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalyzeArtifactUseCase } from '../AnalyzeArtifactUseCase'
import type { ArtifactIntakeAdapter } from '@/infrastructure/adapters/ArtifactIntakeAdapter'
import type { LlmServicePort } from '@/domain/ports/LlmServicePort'
import type { Persona } from '@/domain/entities/Persona'

function makePersona(name: string): Persona {
  return {
    id: `p-${name}`,
    name,
    age: 30,
    occupation: 'designer',
    educationLevel: 'BA',
    interests: [],
    goals: ['evaluate tools'],
    conscientiousness: 50,
    neuroticism: 50,
    openness: 50,
    extraversion: 50,
    agreeableness: 50,
    values: [],
    fears: [],
    communicationStyle: 'direct',
    decisionStyle: 'gut-driven',
  }
}

function makeLlm(): LlmServicePort {
  return {
    generateSimulationTitle: vi.fn().mockResolvedValue('Test title'),
    generateVisceralMonologue: vi.fn().mockResolvedValue({ text: 'visceral reaction text' }),
    extractPersonaResponse: vi.fn().mockResolvedValue({
      overview: 'ok',
      customerJourney: [
        { stage: 'interpretation', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
        { stage: 'understanding', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
        { stage: 'belief', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
        { stage: 'motivation', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
        { stage: 'action', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
      ],
      researchQuestionAnswer: 'answer',
      majorFindings: [],
      pointsOfFriction: [],
      unansweredQuestions: [],
    }),
  } as unknown as LlmServicePort
}

const intake = {
  screenshotBase64: 'img64',
  url: 'https://example.com',
  summary: 'A B2B pricing page.',
  pageHtml: '<html></html>',
}

function makeUseCase(llm: LlmServicePort) {
  return new AnalyzeArtifactUseCase({ intake: vi.fn().mockResolvedValue(intake) } as unknown as ArtifactIntakeAdapter, llm)
}

describe('AnalyzeArtifactUseCase Observer-Actor pipeline', () => {
  let llm: LlmServicePort

  beforeEach(() => {
    llm = makeLlm()
  })

  it('runs visceral monologue then extraction per persona and stores the monologue verbatim as rawAnalysis', async () => {
    const useCase = makeUseCase(llm)
    const responses = await useCase.execute(
      { type: 'url', url: 'https://example.com' },
      [makePersona('Ada'), makePersona('Ben')],
      'Increase conversions',
      'Why do founders hesitate?',
    )

    expect(responses).toHaveLength(2)
    expect(llm.generateVisceralMonologue).toHaveBeenCalledTimes(2)
    for (const persona of [makePersona('Ada'), makePersona('Ben')]) {
      expect(llm.generateVisceralMonologue).toHaveBeenCalledWith(
        expect.objectContaining({ name: persona.name }),
        intake,
        'Why do founders hesitate?',
        expect.objectContaining({ runId: 'unknown' }),
      )
    }
    expect(llm.extractPersonaResponse).toHaveBeenCalledTimes(2)
    // Extraction receives the EXACT monologue produced by stage 1, not a wrapped object.
    expect(llm.extractPersonaResponse).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ada' }),
      'visceral reaction text',
      'Why do founders hesitate?',
      expect.objectContaining({ runId: 'unknown' }),
    )
    expect(responses[0].rawAnalysis).toBe('visceral reaction text')
    expect(responses[0].customerJourney).toHaveLength(5)
    expect(responses[0].overview).toBe('ok')
  })

  it('businessGoal is NOT forwarded to the persona pipeline calls', async () => {
    const useCase = makeUseCase(llm)
    await useCase.execute({ type: 'url', url: 'https://x.com' }, [makePersona('Ada')], 'goal', 'rq')

    const monologueArgs = vi.mocked(llm.generateVisceralMonologue).mock.calls[0]
    expect(monologueArgs).toHaveLength(4) // persona, context, researchQuestion, options
    const extractArgs = vi.mocked(llm.extractPersonaResponse).mock.calls[0]
    expect(extractArgs).toHaveLength(4)
  })

  it('falls back to a shape-valid response when the monologue call fails', async () => {
    vi.mocked(llm.generateVisceralMonologue).mockRejectedValue(new Error('vlm down'))
    const useCase = makeUseCase(llm)
    const responses = await useCase.execute(
      { type: 'url', url: 'https://x.com' },
      [makePersona('Ada')],
      'goal',
      'rq',
    )

    expect(responses).toHaveLength(1)
    const failed = responses[0]
    expect(failed.rawAnalysis).toBe('Analysis failed: vlm down')
    expect(failed.customerJourney).toHaveLength(5)
    expect(failed.pointsOfFriction).toContain('vlm down')
  })

  it('falls back to a shape-valid response when extraction fails after the monologue succeeded', async () => {
    vi.mocked(llm.extractPersonaResponse).mockRejectedValue(new Error('formatter down'))
    const useCase = makeUseCase(llm)
    const responses = await useCase.execute(
      { type: 'url', url: 'https://x.com' },
      [makePersona('Ada')],
      'goal',
      'rq',
    )

    expect(responses).toHaveLength(1)
    expect(responses[0].rawAnalysis).toBe('Analysis failed: formatter down')
  })

  it('treats total wrapper rejection (abandoned personas) as a run failure', async () => {
    // LLM failures inside the loop become fallbacks; only a rejection from
    // the wrapper itself (persona abandoned before its slot) drains responses.
    vi.mocked(llm.generateVisceralMonologue).mockRejectedValue(new Error('vlm down'))
    const useCase = makeUseCase(llm)
    const responses = await useCase.execute(
      { type: 'url', url: 'https://x.com' },
      [makePersona('Ada')],
      'goal',
      'rq',
    )
    expect(responses).toHaveLength(1)
    expect(responses.every((r) => r.rawAnalysis.startsWith('Analysis failed:'))).toBe(true)
  })
})
