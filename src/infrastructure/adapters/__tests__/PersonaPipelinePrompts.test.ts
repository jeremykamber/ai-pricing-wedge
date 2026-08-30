import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { streamObject } from 'ai'
import {
  VisionAnalysisAdapter,
  buildVisceralMonologueSystemPrompt,
  buildPersonaExtractionSystemPrompt,
} from '../VisionAnalysisAdapter'
import { LlmServiceImpl } from '../LlmServiceImpl'
import { PersonaResponseSchema } from '@/domain/entities/PersonaResponse'
import type { Persona } from '@/domain/entities/Persona'

vi.mock('ai', () => ({ streamObject: vi.fn() }))

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'p1',
    name: 'Maya Chen',
    age: 34,
    occupation: 'freelance illustrator',
    educationLevel: 'BA',
    interests: ['art', 'coffee'],
    goals: ['find affordable health insurance'],
    conscientiousness: 60,
    neuroticism: 40,
    openness: 70,
    extraversion: 50,
    agreeableness: 55,
    values: ['independence'],
    fears: ['surprise bills'],
    communicationStyle: 'direct',
    decisionStyle: 'gut-driven',
    backstory: 'She left a studio job to go freelance last year.',
    ...overrides,
  }
}

describe('buildVisceralMonologueSystemPrompt (System 1 — Actor)', () => {
  it('speaks as the persona: name, role, background, goal', () => {
    const prompt = buildVisceralMonologueSystemPrompt(makePersona(), 'Why do founders hesitate?')
    expect(prompt).toContain('You are Maya Chen, freelance illustrator.')
    expect(prompt).toContain('She left a studio job to go freelance last year.')
    expect(prompt).toContain('find affordable health insurance')
  })

  it('carries the operating rules verbatim and ends with the stream-opening cue', () => {
    const prompt = buildVisceralMonologueSystemPrompt(makePersona(), 'rq')
    expect(prompt).toContain('You are an impatient human browsing a website')
    expect(prompt).toContain('"CTA", "social proof", "value proposition", or "friction"')
    expect(prompt).toContain('implicit attention budget')
    expect(prompt).toContain('unfiltered, fragmented stream-of-consciousness')
    expect(prompt).toContain('Do not justify or over-rationalize. React viscerally.')
    expect(prompt.trimEnd().endsWith('Begin your raw stream of thought now:')).toBe(true)
  })

  it('never leaks DOM-grade context: no PAGE FACT SUMMARY, no intake summary text', () => {
    const prompt = buildVisceralMonologueSystemPrompt(makePersona(), 'rq')
    expect(prompt).not.toContain('PAGE FACT SUMMARY')
    expect(prompt).not.toContain('RETRIEVED MEMORY')
    expect(prompt).not.toContain('factual summary of the page')
  })

  it('falls back to the research question as browsing intent only when the persona has no goals', () => {
    const noGoals = makePersona({ goals: [] })
    const prompt = buildVisceralMonologueSystemPrompt(noGoals, 'Why do founders hesitate?')
    expect(prompt).toContain('Why do founders hesitate?')
  })
})

describe('buildPersonaExtractionSystemPrompt (System 2 — Anthropologist)', () => {
  it('embeds the persona name, research question, and the raw monologue', () => {
    const prompt = buildPersonaExtractionSystemPrompt(makePersona(), 'ugh this pricing table is a maze', 'Why do founders hesitate?')
    expect(prompt).toContain("Map Maya Chen's unfiltered behavior into the structured JSON schema.")
    expect(prompt).toContain('Research Question: Why do founders hesitate?')
    expect(prompt).toContain('"""ugh this pricing table is a maze"""')
  })

  it('enforces third person, no fabricated progress, and all five canonical stages', () => {
    const prompt = buildPersonaExtractionSystemPrompt(makePersona(), 'monologue', 'rq')
    expect(prompt).toContain('Write strictly in the THIRD PERSON')
    expect(prompt).toContain('DO NOT fabricate steps')
    expect(prompt).toContain('"blocked" or "stopped"')
    expect(prompt).toContain('Ground every statement entirely in the transcript')
    expect(prompt).toContain('(interpretation, understanding, belief, motivation, action)')
  })
})

describe('VisionAnalysisAdapter Observer-Actor pipeline wiring', () => {
  let createChatCompletion: Mock
  let adapter: VisionAnalysisAdapter

  const validResponse = {
    overview: 'The user bounced off the pricing table.',
    customerJourney: [
      { stage: 'interpretation', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
      { stage: 'understanding', description: 'd', sentiment: 'negative', outcome: 'blocked' },
      { stage: 'belief', description: 'd', sentiment: 'negative', outcome: 'stopped' },
      { stage: 'motivation', description: 'd', sentiment: 'negative', outcome: 'stopped' },
      { stage: 'action', description: 'd', sentiment: 'negative', outcome: 'stopped' },
    ],
    researchQuestionAnswer: 'They hesitated because the tiers were unclear.',
    majorFindings: [],
    pointsOfFriction: ['confusing tiers'],
    unansweredQuestions: [],
  }

  beforeEach(() => {
    createChatCompletion = vi.fn().mockResolvedValue('ugh another maze of tiers... clicking away')
    vi.mocked(streamObject).mockReset()
    vi.mocked(streamObject).mockReturnValue({
      partialObjectStream: (async function* () { /* drained */ })(),
      object: Promise.resolve(validResponse),
    } as never)
    adapter = new VisionAnalysisAdapter({
      visionModel: 'qwen-vl-test',
      textModel: 'deepseek-test',
      provider: vi.fn().mockReturnValue({}),
      createChatCompletion,
    } as unknown as LlmServiceImpl)
  })

  it('System 1 sends the screenshot ONLY — intake summary/pageHtml never reach the actor', async () => {
    const persona = makePersona()
    const monologue = await adapter.generateVisceralMonologue(
      persona,
      { screenshotBase64: 'IMG64', summary: 'SECRET_DOM_SUMMARY', pageHtml: '<html>SECRET_HTML</html>' },
      'Why do founders hesitate?',
      { runId: 'run1' },
    )

    expect(monologue).toEqual({ text: 'ugh another maze of tiers... clicking away' })
    expect(createChatCompletion).toHaveBeenCalledTimes(1)
    const [messages, callOptions] = createChatCompletion.mock.calls[0]
    const wireContent = JSON.stringify(messages)
    expect(wireContent).toContain('data:image/jpeg;base64,IMG64')
    expect(wireContent).not.toContain('SECRET_DOM_SUMMARY')
    expect(wireContent).not.toContain('SECRET_HTML')
    expect(wireContent).not.toContain('PAGE FACT SUMMARY')
    expect(callOptions).toMatchObject({ temperature: 0.7, model: 'qwen-vl-test', runId: 'run1' })
  })

  it('System 2 extracts from the monologue text via the text model — no image, no summary', async () => {
    const persona = makePersona()
    const response = await adapter.extractPersonaResponse(
      persona,
      'RAW_MONOLOGUE_TEXT',
      'Why do founders hesitate?',
      { runId: 'run1' },
    )

    expect(response).toBe(validResponse)
    expect(streamObject).toHaveBeenCalledTimes(1)
    const call = vi.mocked(streamObject).mock.calls[0][0] as Record<string, unknown>
    expect(call.schema).toBe(PersonaResponseSchema)
    expect(JSON.stringify(call.messages)).not.toContain('image_url')
    expect(JSON.stringify(call.messages)).not.toContain('SECRET_DOM_SUMMARY')
    expect(call.system).toContain('RAW_MONOLOGUE_TEXT')
    expect(call.system).toContain('THIRD PERSON')
    expect(call.temperature).toBe(0.1)
  })
})
