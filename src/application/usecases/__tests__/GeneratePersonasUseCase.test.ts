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
      generateResearchPersonas: vi.fn(),
      generateStrategyPersonas: vi.fn(),
      generateClusterPersonas: vi.fn(),
    } as any;

    useCase = new GeneratePersonasUseCase(mockLlmService);
  });

  it('should generate personas with backstories and rationalization (default mode)', async () => {
    const description = 'Busy founders';

    mockLlmService.generateInitialPersonas.mockResolvedValue([{ ...fullPersona }]);
    mockLlmService.generateAbbreviatedBackstoriesBatch.mockResolvedValue(['backstory content']);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);

    const results = await useCase.execute(description);

    expect(mockLlmService.generateInitialPersonas).toHaveBeenCalledWith(description, 3);
    expect(mockLlmService.generateAbbreviatedBackstoriesBatch).toHaveBeenCalled();
    expect(mockLlmService.rationalizePersonas).toHaveBeenCalled();
    expect(results.length).toBe(1);
    expect(results[0].backstory).toBe('backstory content');
  });

  it('should dispatch to research mode when specified', async () => {
    mockLlmService.generateResearchPersonas.mockResolvedValue([{ ...fullPersona, generationMode: 'research' } as Persona]);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);

    const results = await useCase.execute('Test description', undefined, 1, undefined, 'research');

    expect(mockLlmService.generateResearchPersonas).toHaveBeenCalled();
    expect(results[0].generationMode).toBe('research');
    expect(mockLlmService.generateInitialPersonas).not.toHaveBeenCalled();
  });

  it('should throw when cluster mode is used without interview IDs', async () => {
    await expect(useCase.execute('Test', undefined, 1, undefined, 'cluster'))
      .rejects.toThrow("Cluster mode requires interview IDs");
  });

  it('should run PB&J for research mode but store in pbjRationales', async () => {
    const researchPersona = { ...fullPersona, generationMode: 'research' } as Persona;
    mockLlmService.generateResearchPersonas.mockResolvedValue([researchPersona]);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);

    const results = await useCase.execute('Test', undefined, 1, undefined, 'research');

    expect(mockLlmService.rationalizePersonas).toHaveBeenCalled();
    expect(mockLlmService.generateAbbreviatedBackstoriesBatch).not.toHaveBeenCalled();
    expect(results[0].pbjRationales).toBeUndefined(); // no PB&J section to extract since mock returns same persona
  });

  it('should dispatch to strategy mode when specified', async () => {
    mockLlmService.generateStrategyPersonas.mockResolvedValue([{ ...fullPersona, generationMode: 'strategy' } as Persona]);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);

    const results = await useCase.execute('Test description', undefined, 1, undefined, 'strategy');

    expect(mockLlmService.generateStrategyPersonas).toHaveBeenCalled();
    expect(results[0].generationMode).toBe('strategy');
    expect(mockLlmService.generateInitialPersonas).not.toHaveBeenCalled();
    // Strategy now gets the same PB&J pass as research
    expect(mockLlmService.rationalizePersonas).toHaveBeenCalled();
  });

  it('should extract PB&J rationales into pbjRationales for strategy mode', async () => {
    mockLlmService.generateStrategyPersonas.mockResolvedValue([{
      ...fullPersona,
      backstory: 'Original story.',
      generationMode: 'strategy',
    } as Persona]);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) =>
      ps.map((p) => ({ ...p, backstory: p.backstory + '\n\n<<PSYCHOLOGICAL RATIONALES (PB&J)>>\nBecause of X' } as Persona)),
    );

    const results = await useCase.execute('Test', undefined, 1, undefined, 'strategy');

    expect(results[0].pbjRationales).toContain('<<PSYCHOLOGICAL RATIONALES (PB&J)>>');
    expect(results[0].backstory).toBe('Original story.'); // restored, not polluted
  });

  it('should degrade gracefully when the PB&J pass fails', async () => {
    mockLlmService.generateStrategyPersonas.mockResolvedValue([{ ...fullPersona, generationMode: 'strategy' } as Persona]);
    mockLlmService.rationalizePersonas.mockRejectedValue(new Error('LLM down'));

    const results = await useCase.execute('Test', undefined, 1, undefined, 'strategy');

    expect(results).toHaveLength(1);
    expect(results[0].pbjRationales).toBeUndefined();
  });

  it('should forward phased backstory progress to onProgress', async () => {
    mockLlmService.generateStrategyPersonas.mockImplementation(async (_config: any, onPhase?: any) => {
      onPhase?.('profiles', { completed: 0, total: 1 });
      onPhase?.('profiles', { completed: 1, total: 1 });
      onPhase?.('backstories', { completed: 0, total: 2 });
      onPhase?.('backstories', { completed: 1, total: 2, personaName: 'A' });
      onPhase?.('backstories', { completed: 2, total: 2, personaName: 'B' });
      return [{ ...fullPersona, generationMode: 'strategy' } as Persona];
    });
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);

    const progress: any[] = [];
    await useCase.execute('Test', (p) => progress.push(p), 1, undefined, 'strategy');

    const backstorySteps = progress.filter((p) => p.step === 'GENERATING_BACKSTORIES');
    expect(backstorySteps).toHaveLength(3); // start + one tick per persona
    expect(backstorySteps[1]).toMatchObject({ personaName: 'A', completedCount: 1, totalCount: 2 });
    expect(backstorySteps[2]).toMatchObject({ personaName: 'B', completedCount: 2, totalCount: 2 });
  });

  it('should surface a friendly retry status when profile generation retries', async () => {
    mockLlmService.generateStrategyPersonas.mockImplementation(async (_config: any, _onPhase?: any, onRetry?: any) => {
      // Simulate the adapter firing onRetry right before attempt 2 (a real retry).
      onRetry?.(2, 3);
      return [{ ...fullPersona, generationMode: 'strategy' } as Persona];
    });
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);

    const progress: any[] = [];
    await useCase.execute('Test', (p) => progress.push(p), 1, undefined, 'strategy');

    const retryUpdates = progress.filter(
      (p) => p.step === 'BRAINSTORMING_PERSONAS' && typeof p.streamingText === 'string',
    );
    expect(retryUpdates.length).toBeGreaterThan(0);
    const retryText = retryUpdates[retryUpdates.length - 1]?.streamingText;
    expect(retryText.toLowerCase()).toContain('retrying');
  });
});
