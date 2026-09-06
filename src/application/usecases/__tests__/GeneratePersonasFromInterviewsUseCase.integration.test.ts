/**
 * Integration test for the full interview-to-persona pipeline.
 *
 * Real components exercised:
 * - poolSignals (n-gram clustering, weighted distribution)
 * - samplePersonas (injectable coherence validation)
 * - chunkInterviewSignals (signal → Chunk conversion)
 * - IdRagStore (ingestion, retrieval, formatting)
 * - GeneratePersonasUseCase (orchestration with mocked LLM)
 *
 * Mocked components:
 * - LlmServicePort (all LLM calls return controlled data)
 *   - extractInterviewSignals → known signal distribution
 *   - createChatCompletion → { contradictoryIndices: [] }
 *   - generateResearchPersonas → N controlled Persona objects with backstories
 *
 * Signal distribution across 3 transcripts:
 *   Interview 1: "slow onboarding" (×2) + "expensive" (×1)
 *   Interview 2: "slow onboarding" (×2) + "poor support" (×1)
 *   Interview 3: "complex setup" (×1) + "lack of documentation" (×1)
 *
 *   Known weights after pooling (3 interviews):
 *     "slow onboarding process" → 0.67 (appears in 2/3 interviews)
 *     "expensive pricing"       → 0.33 (1/3)
 *     "poor customer support"   → 0.33 (1/3)
 *     "complex setup process"   → 0.33 (1/3)
 *     "lack of documentation"   → 0.33 (1/3)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeneratePersonasFromInterviewsUseCase } from '../GeneratePersonasFromInterviewsUseCase';
import { GeneratePersonasUseCase } from '../GeneratePersonasUseCase';
import { IdRagStore } from '@/infrastructure/adapters/IdRagStore';
import type { Persona } from '@/domain/entities/Persona';
import type { ExtractedInterviewSignals } from '@/application/interviewPipeline/types';

// ---- Fixtures ----

const mockTranscripts = [
  { filename: 'interview-1.txt', content: 'transcript about slow onboarding and expensive pricing' },
  { filename: 'interview-2.txt', content: 'transcript about slow onboarding and poor support' },
  { filename: 'interview-3.txt', content: 'transcript about complex setup and lack of documentation' },
];

/**
 * Controlled signal extraction results with known distribution.
 * "slow onboarding process" text is identical in interviews 0 and 1
 * so n-gram similarity (≥ 0.7 threshold) clusters them → weight 0.67.
 */
const interview0Signals: ExtractedInterviewSignals = {
  interviewId: 'interview-0',
  painPoints: [
    { text: 'slow onboarding process', quote: 'it took forever to get our team set up', sourceSegmentId: '1-1' },
    { text: 'expensive pricing', quote: 'way too expensive for a small team', sourceSegmentId: '1-2' },
  ],
  goals: [{ text: 'reduce onboarding time', quote: 'we need to onboard faster', sourceSegmentId: '1-3' }],
  values: [{ text: 'efficiency', quote: 'efficiency is key for our team', sourceSegmentId: '1-4' }],
  featureDesires: [{ text: 'quick setup wizard', quote: 'a wizard would help speed things up', sourceSegmentId: '1-5' }],
  decisionPatterns: [{ text: 'evaluates ROI first', quote: 'I always look at ROI before buying', sourceSegmentId: '1-6' }],
  context: { role: 'CTO', industry: 'SaaS', teamSize: '50' },
  communicationStyle: 'direct',
  salientQuotes: ['it took forever to get our team set up'],
};

const interview1Signals: ExtractedInterviewSignals = {
  interviewId: 'interview-1',
  painPoints: [
    { text: 'slow onboarding process', quote: 'onboarding was painfully slow for everyone', sourceSegmentId: '2-1' },
    { text: 'poor customer support', quote: 'support never responded in time', sourceSegmentId: '2-2' },
  ],
  goals: [{ text: 'get faster support', quote: 'we need quicker support responses', sourceSegmentId: '2-3' }],
  values: [{ text: 'reliability', quote: 'reliability matters more than features', sourceSegmentId: '2-4' }],
  featureDesires: [{ text: 'better documentation', quote: 'docs need to be more comprehensive', sourceSegmentId: '2-5' }],
  decisionPatterns: [{ text: 'asks for references', quote: 'I always check with peers first', sourceSegmentId: '2-6' }],
  context: { role: 'VP Engineering', industry: 'SaaS', teamSize: '200' },
  communicationStyle: 'analytical',
  salientQuotes: ['onboarding was painfully slow for everyone'],
};

const interview2Signals: ExtractedInterviewSignals = {
  interviewId: 'interview-2',
  painPoints: [
    { text: 'complex setup process', quote: 'setup was overly complex and confusing', sourceSegmentId: '3-1' },
    { text: 'lack of documentation', quote: 'no proper documentation to follow', sourceSegmentId: '3-2' },
  ],
  goals: [{ text: 'simplify integration', quote: 'we need something that just works', sourceSegmentId: '3-3' }],
  values: [{ text: 'simplicity', quote: 'simple tools are the best tools', sourceSegmentId: '3-4' }],
  featureDesires: [{ text: 'step-by-step guide', quote: 'a step-by-step guide would be amazing', sourceSegmentId: '3-5' }],
  decisionPatterns: [{ text: 'prefers free trials', quote: 'I need to try before I buy', sourceSegmentId: '3-6' }],
  context: { role: 'Engineering Manager', industry: 'Fintech', teamSize: '100' },
  communicationStyle: 'pragmatic',
  salientQuotes: ['setup was overly complex and confusing'],
};

function buildPersona(index: number): Persona {
  return {
    id: `persona-${index}`,
    name: `Persona ${index}`,
    age: 30 + index,
    occupation: 'Engineer',
    educationLevel: "Bachelor's",
    interests: ['technology'],
    goals: ['improve efficiency'],
    conscientiousness: 70,
    neuroticism: 50,
    openness: 60,
    extraversion: 45,
    agreeableness: 55,
    values: ['efficiency'],
    fears: ['waste'],
    communicationStyle: 'direct',
    decisionStyle: 'data-driven',
    pricingSensitivity: 50,
    typicalBudget: '100-200',
    backstory: 'Persona has always valued efficiency and simple solutions. Growing up in a tech-focused family, they learned that complex tools slow everyone down. In their career, they have seen how poor onboarding, expensive tools, and complicated setup can waste time and money. They now advocate for streamlined processes that just work.',
  };
}

function createMockLlmService() {
  return {
    // ---- Interview extraction (called once per transcript) ----
    extractInterviewSignals: vi.fn().mockImplementation(
      async (_transcript: string, interviewId: string): Promise<ExtractedInterviewSignals> => {
        if (interviewId === 'interview-0') return interview0Signals;
        if (interviewId === 'interview-1') return interview1Signals;
        if (interviewId === 'interview-2') return interview2Signals;
        throw new Error(`Unknown interview ID: ${interviewId}`);
      },
    ),

    // ---- Coherence validation (called by samplePersonas via validateCoherence) ----
    createChatCompletion: vi.fn().mockResolvedValue(
      JSON.stringify({ contradictoryIndices: [] }),
    ),

    // ---- Persona generation (dual-mode research generation) ----
    generateResearchPersonas: vi.fn().mockImplementation(
      async (config: { count?: number }): Promise<Persona[]> => {
        const n = config.count ?? 3;
        return Array.from({ length: n }, (_, i) => buildPersona(i));
      },
    ),

    // ---- Streaming no-ops required by LlmServicePort ----
    generateInitialPersonasStream: vi.fn(),
    generatePersonaBackstory: vi.fn(),
    generatePersonaBackstoryStream: vi.fn(),
    generateAbbreviatedBackstory: vi.fn(),
    generateAbbreviatedBackstoryStream: vi.fn(),
    decideNextStep: vi.fn(),
    chatWithPersona: vi.fn(),
    chatWithPersonaStream: vi.fn(),
    validatePromptDomain: vi.fn(),
    summarizeHtml: vi.fn(),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ---- Test Suite ----

describe('GeneratePersonasFromInterviewsUseCase Integration', () => {
  let mockLlmService: ReturnType<typeof createMockLlmService>;
  let idRagStore: IdRagStore;
  let generateUseCase: GeneratePersonasUseCase;
  let useCase: GeneratePersonasFromInterviewsUseCase;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockLlmService = createMockLlmService();
    idRagStore = new IdRagStore();
    generateUseCase = new GeneratePersonasUseCase(mockLlmService);
    useCase = new GeneratePersonasFromInterviewsUseCase(
      mockLlmService,
      idRagStore,
      generateUseCase,
    );
  });

  // ------------------------------------------------------------------
  // 1. Full pipeline produces targetCount personas from 3 transcripts
  // ------------------------------------------------------------------
  it('full pipeline produces targetCount personas from 3 transcripts', async () => {
    const personas = await useCase.execute(mockTranscripts);

    // targetCount = default count (5), passed straight through to research mode
    expect(personas).toHaveLength(5);

    // Every persona must have an id and backstory
    for (const p of personas) {
      expect(p.id).toBeTruthy();
      expect(p.backstory).toBeTruthy();
    }

    // Verify each stage of the LLM pipeline was invoked
    expect(mockLlmService.extractInterviewSignals).toHaveBeenCalledTimes(3);
    expect(mockLlmService.createChatCompletion).toHaveBeenCalledTimes(1); // coherence validation
    expect(mockLlmService.generateResearchPersonas).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // 2. Interview chunks ingested into IdRagStore
  // ------------------------------------------------------------------
  it('interview chunks ingested into IdRagStore', async () => {
    await useCase.execute(mockTranscripts);

    // Each persona should have retrievable chunks that include both
    // backstory and interview chunk types.
    for (let i = 0; i < 5; i++) {
      const pid = `persona-${i}`;
      // Use a broad query relevant to both backstory and interview text
      const results = idRagStore.retrieve(pid, 'onboarding setup efficiency', 50);
      expect(results.length).toBeGreaterThan(0);

      const chunkTypes = new Set(results.map((r) => r.chunk.chunkType));
      expect(chunkTypes.has('backstory')).toBe(true);
      expect(chunkTypes.has('interview')).toBe(true);
    }
  });

  // ------------------------------------------------------------------
  // 3. Retrieval returns both backstory and interview chunks
  // ------------------------------------------------------------------
  it('retrieval returns both backstory and interview chunks for a relevant query', async () => {
    await useCase.execute(mockTranscripts);

    // Query terms that appear in both mock backstories and interview quotes
    const results = idRagStore.retrieve('persona-0', 'slow onboarding setup', 20);

    const chunkTypes = results.map((r) => r.chunk.chunkType);
    expect(chunkTypes).toContain('backstory');
    expect(chunkTypes).toContain('interview');
  });

  // ------------------------------------------------------------------
  // 4. formatRetrievedContext shows correct metadata for interview chunks
  // ------------------------------------------------------------------
  it('formatRetrievedContext shows correct metadata for interview chunks', async () => {
    await useCase.execute(mockTranscripts);

    const results = idRagStore.retrieve('persona-0', 'onboarding setup', 20);
    const formatted = idRagStore.formatRetrievedContext(results);

    // Backstory chunks include Topic: and Tone:
    expect(formatted).toContain('Topic:');
    expect(formatted).toContain('Tone:');

    // Interview chunks reference a source interview ID
    const interviewChunks = results.filter((r) => r.chunk.chunkType === 'interview');
    if (interviewChunks.length > 0) {
      const sourceId = interviewChunks[0].chunk.metadata['sourceInterviewId'];
      expect(sourceId).toBeTruthy();
      expect(typeof sourceId).toBe('string');
      // Verify it's one of our known interview IDs
      expect(['interview-0', 'interview-1', 'interview-2']).toContain(sourceId);

      // The formatted output should include the source
      expect(formatted).toContain('Source:');
    }
  });
});
