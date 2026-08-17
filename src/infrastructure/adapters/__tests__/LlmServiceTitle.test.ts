import { describe, it, expect, vi } from 'vitest'
import { LlmServiceImpl } from '../LlmServiceImpl'
import { Persona } from '@/domain/entities/Persona'

function makeService(): LlmServiceImpl {
  return new LlmServiceImpl(
    {} as any,
    {} as any,
    {
      text: 'text-model',
      smallText: 'small-model',
      vision: 'vision-model',
      scout: 'scout-model',
      extraction: 'extraction-model',
    },
  )
}

const samplePersona: Persona = {
  id: 'p1',
  name: 'Maya',
  age: 34,
  occupation: 'Founder',
  educationLevel: "Bachelor's",
  interests: [],
  goals: ['Grow revenue'],
  conscientiousness: 70,
  neuroticism: 50,
  openness: 60,
  extraversion: 50,
  agreeableness: 50,
  values: ['Efficiency'],
  fears: ['Burnout'],
  communicationStyle: 'direct',
  decisionStyle: 'data-driven',
  pricingSensitivity: 50,
  typicalBudget: '$100/mo',
  backstory: 'Bootstrapped a B2B analytics company.',
}

describe('LlmServiceImpl title generation', () => {
  it('generateSimulationTitle trims quotes/spaces and returns a clean title', async () => {
    const llm = makeService()
    const spy = vi.spyOn(llm, 'createChatCompletion').mockResolvedValue('  "Pricing trust for founders"  ')

    const title = await llm.generateSimulationTitle({
      businessGoal: 'Increase conversions',
      researchQuestion: 'Why do founders hesitate?',
      artifactUrl: 'https://example.com',
      pageSummary: 'A pricing page.',
      screenshotBase64: 'base64img',
    })

    expect(title).toBe('Pricing trust for founders')
    // Uses the vision model so it can see the artifact
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: 'vision-model', purpose: 'simulation-title' }),
    )
  })

  it('generateSimulationTitle includes the screenshot as an image part when present', async () => {
    const llm = makeService()
    const spy = vi.spyOn(llm, 'createChatCompletion').mockResolvedValue('A title')

    await llm.generateSimulationTitle({ screenshotBase64: 'abc123' })

    const messages = spy.mock.calls[0][0]
    const content = messages[1].content as any[]
    const imagePart = content.find((part) => part.type === 'image_url')
    expect(imagePart).toBeTruthy()
    expect((imagePart as any).image_url.url).toBe('data:image/png;base64,abc123')
  })

  it('generateSimulationTitle omits the image part when there is no screenshot', async () => {
    const llm = makeService()
    const spy = vi.spyOn(llm, 'createChatCompletion').mockResolvedValue('A title')

    await llm.generateSimulationTitle({ businessGoal: 'goal' })

    const messages = spy.mock.calls[0][0]
    const content = messages[1].content as any[]
    expect(content.some((part) => part.type === 'image_url')).toBe(false)
  })

  it('generateSimulationTitle falls back to a default when the model returns empty', async () => {
    const llm = makeService()
    vi.spyOn(llm, 'createChatCompletion').mockResolvedValue('   ')

    const title = await llm.generateSimulationTitle({})
    expect(title).toBe('Untitled simulation')
  })

  it('generateBatchTitle calls createChatCompletion on the small text model', async () => {
    const llm = makeService()
    const spy = vi.spyOn(llm, 'createChatCompletion').mockResolvedValue('B2B SaaS founders')

    const title = await llm.generateBatchTitle([samplePersona], { source: 'description', description: 'founders' })

    expect(title).toBe('B2B SaaS founders')
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: 'small-model', purpose: 'batch-title' }),
    )
  })

  it('generateBatchTitle includes persona name/occupation in the prompt', async () => {
    const llm = makeService()
    const spy = vi.spyOn(llm, 'createChatCompletion').mockResolvedValue('A label')

    await llm.generateBatchTitle([samplePersona], { source: 'interviews', transcriptCount: 1 })

    const messages = spy.mock.calls[0][0]
    const userText = messages[1].content as string
    expect(userText).toContain('Maya')
    expect(userText).toContain('Founder')
  })
})
