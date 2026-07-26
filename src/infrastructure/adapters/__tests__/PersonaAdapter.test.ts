import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PersonaAdapter } from '../PersonaAdapter'
import { LlmServiceImpl } from '../LlmServiceImpl'
import { Persona } from '@/domain/entities/Persona'

describe('PersonaAdapter', () => {
  let adapter: PersonaAdapter
  let mockLlm: {
    createChatCompletion: ReturnType<typeof vi.fn>
    smallTextModel: string
    provider: ReturnType<typeof vi.fn>
    textModel: string
  }

  const mockReferencePersona: Persona = {
    id: 'ref-1',
    name: 'Jordan Chen',
    age: 34,
    occupation: 'Product Manager',
    educationLevel: "Master's in Business",
    interests: ['SaaS tools', 'product analytics', 'design thinking'],
    goals: ['Reduce churn', 'Improve onboarding'],
    conscientiousness: 75,
    neuroticism: 40,
    openness: 80,
    extraversion: 60,
    agreeableness: 55,
    values: ['Efficiency', 'User-centric design', 'Data-driven decisions'],
    fears: ['Wasting budget', 'Adopting the wrong tool'],
    communicationStyle: 'analytical',
    decisionStyle: 'data-driven',
    pricingSensitivity: 45,
    typicalBudget: '$50-100/user/month',
    domainExpertise: ['product management', 'B2B SaaS'],
    backstory: 'I have spent a decade in product management...',
  }

  beforeEach(() => {
    mockLlm = {
      createChatCompletion: vi.fn(),
      smallTextModel: 'test-model',
      provider: vi.fn(),
      textModel: 'test-model',
    }
    adapter = new PersonaAdapter(mockLlm as unknown as LlmServiceImpl)
  })

  describe('generateVariationPersonas', () => {
    const defaultAdjustments = {
      bigFive: {
        conscientiousness: 70,
        neuroticism: 50,
        openness: 60,
        extraversion: 40,
        agreeableness: 65,
      },
      variationLevel: 40,
    }

    it('should generate persona variations from a reference', async () => {
      const llmResponse = JSON.stringify([
        {
          id: 'var-1',
          name: 'Alex Rivera',
          age: 29,
          occupation: 'Associate Product Manager',
          educationLevel: "Bachelor's in Computer Science",
          interests: ['growth metrics', 'user research', 'agile workflows'],
          goals: ['Ship faster', 'Validate hypotheses'],
          conscientiousness: 70,
          neuroticism: 50,
          openness: 60,
          extraversion: 40,
          agreeableness: 65,
          values: ['Speed', 'Experimentation'],
          fears: ['Building the wrong thing'],
          communicationStyle: 'direct',
          decisionStyle: 'data-driven',
          pricingSensitivity: 50,
          typicalBudget: '$30-60/user/month',
          domainExpertise: ['product management'],
          backstory: 'I started in engineering...',
        },
      ])

      mockLlm.createChatCompletion.mockResolvedValue(llmResponse)

      const result = await adapter.generateVariationPersonas(
        mockReferencePersona,
        defaultAdjustments,
        1,
      )

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Alex Rivera')
      expect(result[0].occupation).toBe('Associate Product Manager')
      expect(result[0].backstory).toBeTruthy()
    })

    it('should generate multiple variations', async () => {
      const llmResponse = JSON.stringify([
        {
          id: 'var-1', name: 'Persona A', age: 30, occupation: 'Engineer', educationLevel: 'BS',
          interests: ['coding'], goals: ['build things'],
          conscientiousness: 70, neuroticism: 50, openness: 60, extraversion: 40, agreeableness: 65,
          values: ['quality'], fears: ['bugs'], communicationStyle: 'direct', decisionStyle: 'analytical',
          pricingSensitivity: 50, typicalBudget: '$50/mo',
          domainExpertise: ['engineering'],
          backstory: 'Story A',
        },
        {
          id: 'var-2', name: 'Persona B', age: 35, occupation: 'Designer', educationLevel: 'BFA',
          interests: ['design'], goals: ['create'],
          conscientiousness: 70, neuroticism: 50, openness: 60, extraversion: 40, agreeableness: 65,
          values: ['aesthetics'], fears: ['ugliness'], communicationStyle: 'warm', decisionStyle: 'intuitive',
          pricingSensitivity: 50, typicalBudget: '$40/mo',
          domainExpertise: ['design'],
          backstory: 'Story B',
        },
        {
          id: 'var-3', name: 'Persona C', age: 28, occupation: 'Marketer', educationLevel: 'BA',
          interests: ['campaigns'], goals: ['grow'],
          conscientiousness: 70, neuroticism: 50, openness: 60, extraversion: 40, agreeableness: 65,
          values: ['reach'], fears: ['low engagement'], communicationStyle: 'persuasive', decisionStyle: 'data-driven',
          pricingSensitivity: 50, typicalBudget: '$60/mo',
          domainExpertise: ['marketing'],
          backstory: 'Story C',
        },
      ])

      mockLlm.createChatCompletion.mockResolvedValue(llmResponse)

      const result = await adapter.generateVariationPersonas(
        mockReferencePersona,
        defaultAdjustments,
        3,
      )

      expect(result).toHaveLength(3)
      expect(result.map((p) => p.name)).toEqual(['Persona A', 'Persona B', 'Persona C'])
    })

    it('should pass the reference persona and adjustments to the LLM', async () => {
      mockLlm.createChatCompletion.mockResolvedValue('[]')

      const result = await adapter.generateVariationPersonas(mockReferencePersona, defaultAdjustments, 1)

      expect(result).toEqual([])
      expect(mockLlm.createChatCompletion).toHaveBeenCalledTimes(1)
      const callArgs = mockLlm.createChatCompletion.mock.calls[0]
      const messages = callArgs[0]

      const systemMsg = messages[0].content
      expect(systemMsg).toContain('Jordan Chen')
      expect(systemMsg).toContain('70')
      expect(systemMsg).toContain('VARIATION LEVEL: 40')

      const userMsg = messages[1].content
      expect(userMsg).toContain('Jordan Chen')
    })

    it('should handle unexpected LLM response gracefully', async () => {
      mockLlm.createChatCompletion.mockResolvedValue('not valid json')

      await expect(
        adapter.generateVariationPersonas(mockReferencePersona, defaultAdjustments, 1),
      ).rejects.toThrow('Failed to parse variation personas from LLM response')
    })

    it('should return empty array for empty LLM response', async () => {
      mockLlm.createChatCompletion.mockResolvedValue('[]')

      const result = await adapter.generateVariationPersonas(mockReferencePersona, defaultAdjustments, 1)

      expect(result).toEqual([])
    })

    it('should use higher temperature for high variation levels', async () => {
      mockLlm.createChatCompletion.mockResolvedValue('[]')

      await adapter.generateVariationPersonas(mockReferencePersona, defaultAdjustments, 1)

      const highVariation = { ...defaultAdjustments, variationLevel: 90 }
      await adapter.generateVariationPersonas(mockReferencePersona, highVariation, 1)

      const lowCall = mockLlm.createChatCompletion.mock.calls[0]
      const highCall = mockLlm.createChatCompletion.mock.calls[1]
      const lowTemp = lowCall[1].temperature as number
      const highTemp = highCall[1].temperature as number

      expect(highTemp).toBeGreaterThan(lowTemp)
    })

    it('should strip code fences from LLM response', async () => {
      const llmResponse = '```json\n[{"name":"Test","age":25,"occupation":"Dev","educationLevel":"BS","interests":["code"],"goals":["ship"],"conscientiousness":70,"neuroticism":50,"openness":60,"extraversion":40,"agreeableness":65,"values":["x"],"fears":["y"],"communicationStyle":"direct","decisionStyle":"fast","pricingSensitivity":50,"typicalBudget":"$50","domainExpertise":["eng"],"backstory":"story"}]\n```'
      mockLlm.createChatCompletion.mockResolvedValue(llmResponse)

      const result = await adapter.generateVariationPersonas(
        mockReferencePersona,
        defaultAdjustments,
        1,
      )

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test')
    })
  })
})
