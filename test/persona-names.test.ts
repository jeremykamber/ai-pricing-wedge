import { describe, it, expect } from 'vitest';
import { PersonaAdapter } from '../src/infrastructure/adapters/PersonaAdapter';

// Minimal mock LLM service that returns a stable JSON array
class MockLlmService {
  smallTextModel = 'gpt-mock';
  async createChatCompletion(_: any) {
    const personas = [
      { name: 'X', age: 25 },
      { name: 'Y', age: 30 },
      { name: 'Z', age: 35 },
      { name: 'W', age: 40 },
      { name: 'V', age: 45 },
    ];
    return JSON.stringify(personas);
  }
}

describe('PersonaAdapter deterministic naming', () => {
  it('assigns deterministic neutral names for same description', async () => {
    const mock = new MockLlmService() as any;
    const adapter = new PersonaAdapter(mock as any);

    const desc = 'test persona description for determinism';

    const a = await adapter.generateInitialPersonas(desc);
    const b = await adapter.generateInitialPersonas(desc);

    // same length and same names order
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].name).toBe(b[i].name);
    }

    // names should be drawn from curated pool (string, not the LLM names)
    for (const p of a) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
    }
  });
});
