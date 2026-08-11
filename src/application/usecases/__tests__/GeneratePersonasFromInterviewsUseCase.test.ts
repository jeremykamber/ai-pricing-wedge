import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeneratePersonasFromInterviewsUseCase } from '../GeneratePersonasFromInterviewsUseCase';
import { poolSignals } from '@/application/interviewPipeline/pooling';
import { samplePersonas } from '@/application/interviewPipeline/sampling';
import { chunkInterviewSignals } from '@/application/interviewPipeline/chunkInterviewSignals';
import type { PooledDistributionSummary, SampledPersonaSignal, ExtractedInterviewSignals } from '@/application/interviewPipeline/types';
import type { ResearchPersonaConfig } from '@/domain/dtos/PersonaGenerationConfig';

vi.mock('@/application/interviewPipeline/pooling', () => ({ poolSignals: vi.fn() }));
vi.mock('@/application/interviewPipeline/sampling', () => ({ samplePersonas: vi.fn() }));
vi.mock('@/application/interviewPipeline/chunkInterviewSignals', () => ({ chunkInterviewSignals: vi.fn() }));

describe('GeneratePersonasFromInterviewsUseCase', () => {
  let useCase: GeneratePersonasFromInterviewsUseCase;
  let mockLlmService: any;
  let mockIdRagStore: any;
  let mockGenerateUseCase: any;

  const baseSignal: ExtractedInterviewSignals = {
    interviewId: 'interview-0',
    painPoints: [
      { text: 'High costs', quote: 'it is too expensive', sourceSegmentId: 's1' },
    ],
    goals: [
      { text: 'Save money', quote: 'want to reduce spend', sourceSegmentId: 's2' },
    ],
    values: [
      { text: 'Efficiency', quote: 'value efficiency above all', sourceSegmentId: 's3' },
    ],
    featureDesires: [
      { text: 'Better reporting', quote: 'wish reports were clearer', sourceSegmentId: 's4' },
    ],
    decisionPatterns: [
      { text: 'Data-driven', quote: 'I always check the numbers', sourceSegmentId: 's5' },
    ],
    context: {
      role: 'Engineering Manager',
      industry: 'SaaS',
      teamSize: '15',
    },
    communicationStyle: 'Direct and analytical',
    salientQuotes: ['it is too expensive', 'I always check the numbers'],
  };

  const mockDistribution: PooledDistributionSummary = {
    painPoints: [
      { text: 'High costs', weight: 1, sourceExamples: ['it is too expensive'] },
    ],
    goals: [
      { text: 'Save money', weight: 1, sourceExamples: ['want to reduce spend'] },
    ],
    values: [
      { text: 'Efficiency', weight: 1, sourceExamples: ['value efficiency above all'] },
    ],
    featureDesires: [
      { text: 'Better reporting', weight: 1, sourceExamples: ['wish reports were clearer'] },
    ],
    decisionPatterns: [
      { text: 'Data-driven', weight: 1, sourceExamples: ['I always check the numbers'] },
    ],
    contextDistribution: {
      roles: [
        { text: 'Engineering Manager', weight: 1, sourceExamples: [] },
      ],
      industries: [
        { text: 'SaaS', weight: 1, sourceExamples: [] },
      ],
    },
    communicationStyles: [
      { text: 'Direct and analytical', weight: 1, sourceExamples: [] },
    ],
    allSalientQuotes: ['it is too expensive', 'I always check the numbers'],
    totalInterviews: 3,
  };

  const mockSampledSignals: SampledPersonaSignal[] = [
    {
      id: 'sampled-0',
      painPoints: [
        { text: 'High costs', quote: 'it is too expensive', sourceSegmentId: 's1' },
      ],
      goals: [
        { text: 'Save money', quote: 'want to reduce spend', sourceSegmentId: 's2' },
      ],
      values: [
        { text: 'Efficiency', quote: 'value efficiency above all', sourceSegmentId: 's3' },
      ],
      featureDesires: [
        { text: 'Better reporting', quote: 'wish reports were clearer', sourceSegmentId: 's4' },
      ],
      decisionPattern: {
        text: 'Data-driven',
        quote: 'I always check the numbers',
        sourceSegmentId: 's5',
      },
      context: {
        role: { text: 'Engineering Manager', weight: 1, sourceExamples: [] },
        industry: { text: 'SaaS', weight: 1, sourceExamples: [] },
      },
      communicationStyle: { text: 'Direct and analytical', weight: 1, sourceExamples: [] },
    },
    {
      id: 'sampled-1',
      painPoints: [
        { text: 'Slow onboarding', quote: 'onboarding takes forever', sourceSegmentId: 's6' },
      ],
      goals: [
        { text: 'Faster time-to-value', quote: 'want results quickly', sourceSegmentId: 's7' },
      ],
      values: [
        { text: 'Speed', quote: 'time is money', sourceSegmentId: 's8' },
      ],
      featureDesires: [
        { text: 'Guided setup', quote: 'need a wizard to guide me', sourceSegmentId: 's9' },
      ],
      decisionPattern: {
        text: 'Gut-driven',
        quote: 'I go with my gut',
        sourceSegmentId: 's10',
      },
      context: {
        role: { text: 'Product Designer', weight: 0.8, sourceExamples: [] },
        industry: { text: 'Design', weight: 0.8, sourceExamples: [] },
      },
      communicationStyle: { text: 'Creative', weight: 0.8, sourceExamples: [] },
    },
  ];

  const mockPersonas: any[] = [
    { id: 'persona-1', name: 'Efficient Engineer', backstory: 'Engineer backstory here' },
    { id: 'persona-2', name: 'Design-Driven Designer', backstory: 'Designer backstory here' },
  ];

  const mockChunks: any[] = [
    { id: 'chunk-1', personaId: 'persona-1', text: 'test chunk', chunkType: 'backstory', metadata: {} },
  ];

  const transcripts = [
    { filename: 'customer-alpha.txt', content: 'Interview transcript one...' },
    { filename: 'customer-beta.txt', content: 'Interview transcript two...' },
    { filename: 'customer-gamma.txt', content: 'Interview transcript three...' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(poolSignals).mockReturnValue(mockDistribution);
    vi.mocked(samplePersonas).mockResolvedValue(mockSampledSignals);
    vi.mocked(chunkInterviewSignals).mockReturnValue(mockChunks as any);

    mockLlmService = {
      extractInterviewSignals: vi.fn().mockResolvedValue(baseSignal),
      createChatCompletion: vi.fn().mockResolvedValue(
        JSON.stringify({ contradictoryIndices: [] }),
      ),
      // Dual-mode generation: synthesized/individual personas come from
      // generateResearchPersonas (the legacy generateInitialPersonas path
      // is no longer part of this pipeline).
      generateResearchPersonas: vi.fn().mockResolvedValue(mockPersonas),
    };

    mockIdRagStore = {
      chunkBackstory: vi.fn().mockReturnValue([]),
      ingestChunks: vi.fn(),
    };

    mockGenerateUseCase = {
      execute: vi.fn().mockResolvedValue(mockPersonas),
    };

    useCase = new GeneratePersonasFromInterviewsUseCase(
      mockLlmService,
      mockIdRagStore,
      mockGenerateUseCase,
    );
  });

  // ---------------------------------------------------------------------------
  // 1) Full pipeline orchestration
  // ---------------------------------------------------------------------------
  it('should run the full pipeline end-to-end', async () => {
    const onProgress = vi.fn();
    const result = await useCase.execute(transcripts, onProgress);

    // All extraction calls
    expect(mockLlmService.extractInterviewSignals).toHaveBeenCalledTimes(3);
    expect(mockLlmService.extractInterviewSignals).toHaveBeenCalledWith(
      transcripts[0].content,
      'interview-0',
    );
    expect(mockLlmService.extractInterviewSignals).toHaveBeenCalledWith(
      transcripts[1].content,
      'interview-1',
    );
    expect(mockLlmService.extractInterviewSignals).toHaveBeenCalledWith(
      transcripts[2].content,
      'interview-2',
    );

    // Pooling receives extractions
    expect(poolSignals).toHaveBeenCalledTimes(1);
    expect(poolSignals).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ interviewId: 'interview-0' })]),
    );

    // Sampling invoked
    expect(samplePersonas).toHaveBeenCalledTimes(1);

    // Generation receives description via research-mode generation
    expect(mockLlmService.generateResearchPersonas).toHaveBeenCalledTimes(1);
    expect(mockLlmService.generateResearchPersonas).toHaveBeenCalledWith(
      expect.objectContaining({
        personaDescription: expect.any(String),
        count: expect.any(Number),
      }),
    );

    // Ingestion for each persona
    expect(mockIdRagStore.ingestChunks).toHaveBeenCalledTimes(2);
    expect(mockIdRagStore.ingestChunks).toHaveBeenCalledWith(
      'persona-1',
      expect.any(Array),
    );
    expect(mockIdRagStore.ingestChunks).toHaveBeenCalledWith(
      'persona-2',
      expect.any(Array),
    );

    // Results match
    expect(result).toEqual(mockPersonas);
  });

  // ---------------------------------------------------------------------------
  // 2) Extraction phase runs in parallel (all transcripts extracted)
  // ---------------------------------------------------------------------------
  it('should call extractInterviewSignals for every transcript', async () => {
    await useCase.execute(transcripts);

    expect(mockLlmService.extractInterviewSignals).toHaveBeenCalledTimes(3);
    transcripts.forEach((t, i) => {
      expect(mockLlmService.extractInterviewSignals).toHaveBeenCalledWith(
        t.content,
        `interview-${i}`,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3) Pooling receives correct extraction results
  // ---------------------------------------------------------------------------
  it('should pass successful extractions to poolSignals', async () => {
    await useCase.execute(transcripts);

    expect(poolSignals).toHaveBeenCalledTimes(1);
    const args = vi.mocked(poolSignals).mock.calls[0];
    const extractions = args[0] as ExtractedInterviewSignals[];
    expect(extractions).toHaveLength(3);
    extractions.forEach((sig) => {
      expect(sig).toMatchObject({
        context: { role: 'Engineering Manager' },
        communicationStyle: 'Direct and analytical',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4) Generation receives correctly formatted descriptions
  // ---------------------------------------------------------------------------
  it('should pass formatted descriptions from sampled signals to research persona generation', async () => {
    await useCase.execute(transcripts);

    const descriptionArg = mockLlmService.generateResearchPersonas.mock.calls[0][0].personaDescription;

    // Contains data from first sampled signal
    expect(descriptionArg).toContain('Role: Engineering Manager');
    expect(descriptionArg).toContain('Industry: SaaS');
    expect(descriptionArg).toContain('Communication Style: Direct and analytical');
    expect(descriptionArg).toContain('High costs');
    expect(descriptionArg).toContain('it is too expensive');
    expect(descriptionArg).toContain('Save money');

    // Contains data from second sampled signal
    expect(descriptionArg).toContain('Role: Product Designer');
    expect(descriptionArg).toContain('Industry: Design');
    expect(descriptionArg).toContain('Slow onboarding');

    // Separator between personas
    expect(descriptionArg).toContain('---');
  });

  // ---------------------------------------------------------------------------
  // 6) Verbatim source: the raw transcript is the evidence source, not the
  //    synthesized summary (fixes third-person paraphrase quotes)
  // ---------------------------------------------------------------------------
  it('passes the raw transcript as verbatimSource in individual mode', async () => {
    const onProgress = vi.fn();
    await useCase.execute(transcripts, onProgress, 2, 'individual');

    expect(mockLlmService.generateResearchPersonas).toHaveBeenCalledTimes(3); // one per transcript
    const calls = mockLlmService.generateResearchPersonas.mock
      .calls as unknown as [ResearchPersonaConfig][];
    calls.forEach(([config], i) => {
      expect(config.verbatimSource).toBe(transcripts[i].content);
      expect(config.interviewIds).toEqual([`interview-${i}`]);
    });
  });

  it('attaches the verbatim signal quotes to individual-mode descriptions (same as synthesized)', async () => {
    const onProgress = vi.fn();
    await useCase.execute(transcripts, onProgress, 2, 'individual');

    const calls = mockLlmService.generateResearchPersonas.mock
      .calls as unknown as [ResearchPersonaConfig][];
    expect(calls).toHaveLength(3); // one per transcript
    for (const [config] of calls) {
      const d = config.personaDescription;
      // The paraphrase texts are present AND their verbatim transcript quotes
      // are attached — `- <text> (quote: "<quote>")` — exactly like the
      // synthesized mode, so the model can quote real transcript fragments
      // and the verbatim check (against the full transcript) can pass.
      expect(d).toContain('Interview transcript excerpt:');
      expect(d).toContain('- High costs (quote: "it is too expensive")');
      expect(d).toContain('- Save money (quote: "want to reduce spend")');
      expect(d).toContain('- Efficiency (quote: "value efficiency above all")');
      expect(d).toContain('- Better reporting (quote: "wish reports were clearer")');
      expect(d).toContain('- Data-driven (quote: "I always check the numbers")');
    }
  });

  it('passes all raw transcripts as verbatimSource in synthesized mode', async () => {
    await useCase.execute(transcripts);

    const call = mockLlmService.generateResearchPersonas.mock.calls[0][0];
    expect(call.verbatimSource).toBe(
      transcripts.map((t) => t.content).join('\n\n'),
    );
  });

  // ---------------------------------------------------------------------------
  // 5) Ingestion happens for each persona
  // ---------------------------------------------------------------------------
  it('should ingest chunks for every generated persona', async () => {
    mockIdRagStore.chunkBackstory
      .mockReturnValueOnce([{ id: 'bc-1', personaId: 'persona-1', text: 'p1 backstory', chunkType: 'backstory', metadata: {} }])
      .mockReturnValueOnce([{ id: 'bc-2', personaId: 'persona-2', text: 'p2 backstory', chunkType: 'backstory', metadata: {} }]);

    await useCase.execute(transcripts);

    // chunkBackstory called once per persona
    expect(mockIdRagStore.chunkBackstory).toHaveBeenCalledTimes(2);
    expect(mockIdRagStore.chunkBackstory).toHaveBeenCalledWith('persona-1', 'Engineer backstory here');
    expect(mockIdRagStore.chunkBackstory).toHaveBeenCalledWith('persona-2', 'Designer backstory here');

    // ingestChunks called once per persona with combined chunks
    expect(mockIdRagStore.ingestChunks).toHaveBeenCalledTimes(2);
    expect(mockIdRagStore.ingestChunks).toHaveBeenCalledWith(
      'persona-1',
      expect.arrayContaining([
        expect.objectContaining({ id: 'bc-1' }),
      ]),
    );
    expect(mockIdRagStore.ingestChunks).toHaveBeenCalledWith(
      'persona-2',
      expect.arrayContaining([
        expect.objectContaining({ id: 'bc-2' }),
      ]),
    );
  });

  // ---------------------------------------------------------------------------
  // 6) Progress callbacks fired
  // ---------------------------------------------------------------------------
  it('should fire onProgress for each pipeline phase', async () => {
    const onProgress = vi.fn();
    await useCase.execute(transcripts, onProgress);

    const steps = onProgress.mock.calls.map((c: any[]) => c[0].step);

    expect(steps).toContain('EXTRACTING');
    expect(steps).toContain('POOLING');
    expect(steps).toContain('SAMPLING');
    expect(steps).toContain('GENERATING');
    expect(steps).toContain('INGESTING');
    expect(steps).toContain('DONE');

    // EXTRACTING step includes progress info
    const extractingCalls = onProgress.mock.calls.filter(
      (c: any[]) => c[0].step === 'EXTRACTING',
    );
    expect(extractingCalls.length).toBeGreaterThanOrEqual(3);
    expect(extractingCalls[0][0].total).toBe(3);
    expect(extractingCalls[0][0].current).toBe(0);

    // Individual transcript progress
    const transcriptProgress = extractingCalls.filter(
      (c: any[]) => c[0].current > 0,
    );
    expect(transcriptProgress.length).toBe(3);
    expect(transcriptProgress[0][0].message).toBe('customer-alpha.txt');

    // DONE step includes personas
    const doneCall = onProgress.mock.calls.find(
      (c: any[]) => c[0].step === 'DONE',
    );
    expect(doneCall).toBeDefined();
    expect(doneCall![0].personas).toEqual(mockPersonas);
  });

  // ---------------------------------------------------------------------------
  // 7) Partial extraction failure (1 of 3 fails)
  // ---------------------------------------------------------------------------
  it('should continue when only one extraction fails', async () => {
    mockLlmService.extractInterviewSignals
      .mockResolvedValueOnce(baseSignal)
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce(baseSignal);

    const result = await useCase.execute(transcripts);

    // 2 successful extractions → poolSignals called with 2 items
    expect(poolSignals).toHaveBeenCalledTimes(1);
    const poolArgs = vi.mocked(poolSignals).mock.calls[0];
    const poolExtractions = poolArgs[0] as ExtractedInterviewSignals[];
    expect(poolExtractions).toHaveLength(2);

    expect(samplePersonas).toHaveBeenCalled();
    expect(mockLlmService.generateResearchPersonas).toHaveBeenCalled();
    expect(result).toEqual(mockPersonas);
  });

  // ---------------------------------------------------------------------------
  // 8) All extractions fail
  // ---------------------------------------------------------------------------
  it('should throw when all extractions fail', async () => {
    mockLlmService.extractInterviewSignals.mockRejectedValue(
      new Error('API unavailable'),
    );

    await expect(useCase.execute(transcripts)).rejects.toThrow(
      'No interviews extracted successfully. At least one is required.',
    );

    expect(poolSignals).not.toHaveBeenCalled();
    expect(samplePersonas).not.toHaveBeenCalled();
    expect(mockGenerateUseCase.execute).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 9) Empty transcript array
  // ---------------------------------------------------------------------------
  it('should throw when transcript array is empty', async () => {
    await expect(useCase.execute([])).rejects.toThrow(
      'At least one interview transcript is required',
    );

    expect(mockLlmService.extractInterviewSignals).not.toHaveBeenCalled();
    expect(poolSignals).not.toHaveBeenCalled();
    expect(mockGenerateUseCase.execute).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 7b) Single successful extraction is enough
  // ---------------------------------------------------------------------------
  it('should proceed when only 1 extraction succeeds', async () => {
    mockLlmService.extractInterviewSignals
      .mockResolvedValueOnce(baseSignal)
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'));

    vi.mocked(poolSignals).mockReturnValue(mockDistribution);
    vi.mocked(samplePersonas).mockResolvedValue([mockSampledSignals[0]]);
    mockGenerateUseCase.execute.mockResolvedValue(mockPersonas);

    const result = await useCase.execute(transcripts);

    expect(result).toHaveLength(2);
    expect(poolSignals).toHaveBeenCalled();
    expect(samplePersonas).toHaveBeenCalled();
    expect(mockLlmService.generateResearchPersonas).toHaveBeenCalled();
  });
});
