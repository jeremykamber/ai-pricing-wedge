import { describe, it, expect } from 'vitest'

describe('POST /api/report - Validation Tests', () => {
  const createValidPersona = (overrides = {}) => ({
    id: 'persona-1',
    name: 'Test Persona',
    age: 30,
    occupation: 'Developer',
    educationLevel: 'BS',
    interests: ['tech'],
    goals: ['learn'],
    personalityTraits: ['curious'],
    conscientiousness: 70,
    neuroticism: 30,
    openness: 80,
    extraversion: 50,
    agreeableness: 60,
    cognitiveReflex: 65,
    technicalFluency: 75,
    economicSensitivity: 50,
    designStyle: 'Minimalist',
    livingEnvironment: 'Urban',
    ...overrides,
  })

  const createRequest = (body: object) =>
    new Request('http://localhost/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  describe('url validation', () => {
    it('should return 400 when url is missing', async () => {
      const { POST } = await import('../route')
      const req = createRequest({ personas: [createValidPersona()] })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("Missing or invalid 'url'")
    })

    it('should return 400 when url is not a string', async () => {
      const { POST } = await import('../route')
      const req = createRequest({ url: 123, personas: [createValidPersona()] })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("Missing or invalid 'url'")
    })

    it('should return 400 when url is empty string', async () => {
      const { POST } = await import('../route')
      const req = createRequest({ url: '', personas: [createValidPersona()] })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("Missing or invalid 'url'")
    })
  })

  describe('personas validation', () => {
    it('should return 400 when personas is missing', async () => {
      const { POST } = await import('../route')
      const req = createRequest({ url: 'https://example.com' })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("Missing or invalid 'personas'")
    })

    it('should return 400 when personas is not an array', async () => {
      const { POST } = await import('../route')
      const req = createRequest({ url: 'https://example.com', personas: 'not-array' })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("Missing or invalid 'personas'")
    })

    it('should return 400 when personas is empty array', async () => {
      const { POST } = await import('../route')
      const req = createRequest({ url: 'https://example.com', personas: [] })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("Missing or invalid 'personas'")
    })

    it('should return 400 when persona at index is not an object', async () => {
      const { POST } = await import('../route')
      const req = createRequest({
        url: 'https://example.com',
        personas: ['not-an-object'],
      })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain('must be an object')
    })

    it('should return 400 when persona is missing id field', async () => {
      const { POST } = await import('../route')
      const req = createRequest({
        url: 'https://example.com',
        personas: [createValidPersona({ id: undefined })],
      })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("missing or invalid 'id' field")
    })

    it('should return 400 when persona has non-string id', async () => {
      const { POST } = await import('../route')
      const req = createRequest({
        url: 'https://example.com',
        personas: [createValidPersona({ id: 123 })],
      })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("missing or invalid 'id' field")
    })

    it('should return 400 when persona is missing name field', async () => {
      const { POST } = await import('../route')
      const req = createRequest({
        url: 'https://example.com',
        personas: [createValidPersona({ name: undefined })],
      })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("missing or invalid 'name' field")
    })

    it('should return 400 when persona has non-string name', async () => {
      const { POST } = await import('../route')
      const req = createRequest({
        url: 'https://example.com',
        personas: [createValidPersona({ name: 456 })],
      })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain("missing or invalid 'name' field")
    })

    it('should validate all personas - error on second invalid persona', async () => {
      const { POST } = await import('../route')
      const req = createRequest({
        url: 'https://example.com',
        personas: [
          createValidPersona(),
          createValidPersona({ id: undefined }),
        ],
      })
      const response = await POST(req)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain('index 1')
      expect(json.error).toContain("missing or invalid 'id' field")
    })
  })
})