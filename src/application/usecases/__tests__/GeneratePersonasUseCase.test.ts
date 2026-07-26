import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { GeneratePersonasUseCase } from '../GeneratePersonasUseCase';
import { LlmServicePort } from '@/domain/ports/LlmServicePort';
import { Persona } from '@/domain/entities/Persona';

describe('GeneratePersonasUseCase', () => {
  let useCase: GeneratePersonasUseCase;
  let mockLlmService: Mocked<LlmServicePort>;

  const fullPersona: Persona = {
    id: '1',
    name: 'Test Persona',
    age: 30,
    occupation: 'Tester',
    educationLevel: "Bachelor's",
    interests: ['Testing'],
    goals: ['Write good tests'],
    conscientiousness: 80,
    neuroticism: 20,
    openness: 70,
    extraversion: 50,
    agreeableness: 60,
    values: ['Quality'],
    fears: ['Bugs'],
    communicationStyle: 'direct',
    decisionStyle: 'data-driven',
    pricingSensitivity: 50,
    typicalBudget: '$50/mo',
  };

  beforeEach(() => {
    mockLlmService = {
      generateInitialPersonas: vi.fn(),
      generateAbbreviatedBackstoriesBatch: vi.fn(),
      rationalizePersonas: vi.fn(),
    } as any;

    useCase = new GeneratePersonasUseCase(mockLlmService);
  });

  it('should generate personas with backstories and rationalization', async () => {
    const description = 'Busy founders';

    mockLlmService.generateInitialPersonas.mockResolvedValue([{ ...fullPersona }]);
    mockLlmService.generateAbbreviatedBackstoriesBatch.mockResolvedValue(['backstory content']);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);

    const results = await useCase.execute(description);

    expect(mockLlmService.generateInitialPersonas).toHaveBeenCalledWith(description, undefined);
    expect(mockLlmService.generateAbbreviatedBackstoriesBatch).toHaveBeenCalled();
    expect(mockLlmService.rationalizePersonas).toHaveBeenCalled();
    expect(results.length).toBe(1);
    expect(results[0].backstory).toBe('backstory content');
  });

  it('should handle multiple personas', async () => {
    const personas = [
      { ...fullPersona, id: '1', name: 'Persona 1' },
      { ...fullPersona, id: '2', name: 'Persona 2' },
      { ...fullPersona, id: '3', name: 'Persona 3' }
    ];

    mockLlmService.generateInitialPersonas.mockResolvedValue(personas);
    mockLlmService.generateAbbreviatedBackstoriesBatch.mockResolvedValue(['a', 'b', 'c']);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);

    await useCase.execute('description');

    expect(mockLlmService.generateInitialPersonas).toHaveBeenCalled();
    expect(mockLlmService.generateAbbreviatedBackstoriesBatch).toHaveBeenCalled();
  });
});
