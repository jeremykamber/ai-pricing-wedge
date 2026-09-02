---
date: 2026-03-27T21:31:42-07:00
git_commit: 1b79b170e6da90f91e1e54a7d4ac14bc06e08ffc
branch: feat/benchmark-persona-report-generation
repository: deepbound
topic: "Benchmarking script for persona generation and pricing page analysis"
tags: research, benchmarking, persona-generation, pricing-analysis
status: complete
---

# Research: Benchmarking Script for Persona Generation and Pricing Page Analysis

## Research Question

Create a benchmarking script to measure how long it takes to generate personas and generate a full report on a pricing page. Requirements:
- Precise timing (seconds and milliseconds)
- Run without UI (headless)
- Toggle options: personas only, personas + report, mock personas + report only

## Summary

The codebase follows a clean architecture pattern with use cases, ports (interfaces), and adapters. Both `GeneratePersonasUseCase` and `ParsePricingPageUseCase` can be instantiated headlessly by passing mock or real service implementations. The project uses Vitest for testing with vi.fn() mocking patterns. No existing benchmark patterns were found.

## Detailed Findings

### 1. Persona Generation - GeneratePersonasUseCase

**Location:** `src/application/usecases/GeneratePersonasUseCase.ts`

- **Class:** `GeneratePersonasUseCase` (line 23)
- **Constructor:** Takes `LlmServicePort` as dependency (line 26)
- **Execute method:** `execute(personaDescription: string, onProgress?: (progress: PersonaGenerationProgress) => void)` (line 28)
- **Flow:**
  1. Calls `generateInitialPersonasStream()` to get initial personas
  2. Generates abbreviated backstories (ABBREVIATE_BACKSTORIES = true by default, line 24)
  3. Generates AI insights for each persona
  4. All phases use parallel execution via p-limit(5)
- **Progress callback:** Returns `PersonaGenerationProgress` with step, personaName, completedCount, totalCount

**Code Reference:**
```typescript
// src/application/usecases/GeneratePersonasUseCase.ts:26-27
constructor(private llmService: LlmServicePort) { }

// src/application/usecases/GeneratePersonasUseCase.ts:28-31
async execute(
    personaDescription: string,
    onProgress?: (progress: PersonaGenerationProgress) => void
): Promise<Persona[]> {
```

### 2. Pricing Page Analysis - ParsePricingPageUseCase

**Location:** `src/application/usecases/ParsePricingPageUseCase.ts`

- **Class:** `ParsePricingPageUseCase` (line 25)
- **Constructor:** Takes `BrowserServicePort` and `LlmServicePort` (lines 29-32)
- **Execute method:** `execute(url: string, personas: Persona[], onProgress?, abortSignal?, options?)` (line 43)
- **Flow:**
  1. Captures screenshot via browser service (or accepts pre-provided imageBase64)
  2. Uses LLM to locate pricing elements in HTML
  3. Scrolls to find pricing via vision if needed
  4. Analyzes from each persona's perspective in parallel (p-limit(5))
- **Progress callback:** Returns `PricingAnalysisProgress` with step, personaName, completedCount, totalCount

**Code Reference:**
```typescript
// src/application/usecases/ParsePricingPageUseCase.ts:29-32
constructor(
    private readonly browserService: BrowserServicePort,
    private readonly llmService: LlmServicePort
) { }
```

### 3. LlmServicePort Interface

**Location:** `src/domain/ports/LlmServicePort.ts`

Key methods needed:
- `generateInitialPersonasStream(personaDescription: string): AsyncIterable<Partial<Persona>[]>` (line 28)
- `generateAbbreviatedBackstory(personaOrDescription: Persona | string): Promise<string>` (line 52)
- `generatePersonaInsight(persona: Persona): Promise<string>` (line 180)
- `analyzePricingPageStream(persona, screenshotBase64, pageHtml?, options?): Promise<any>` (line 160)
- `isPricingVisibleInHtml(html: string): Promise<PricingLocation>` (line 116)
- `isPricingVisible(screenshotBase64: string): Promise<boolean>` (line 111)
- `summarizeHtml(html: string): Promise<string>` (line 182)

### 4. Persona Entity

**Location:** `src/domain/entities/Persona.ts`

The Persona object contains:
- id, name, age, occupation, educationLevel
- interests, goals, personalityTraits
- Big Five traits: conscientiousness, neuroticism, openness, extraversion, agreeableness (0-100)
- cognitiveReflex, technicalFluency, economicSensitivity (0-100)
- designStyle, livingEnvironment
- backstory, aiInsight

### 5. Headless Instantiation Pattern

**From action files (`src/actions/generatePersonas.ts` and `src/actions/analyzePricingPage.ts`):**

```typescript
// Persona generation headless
const llmService = LlmServiceImpl.createFromEnv("openrouter");
const useCase = new GeneratePersonasUseCase(llmService);
const personas = await useCase.execute(personaDescription);

// Pricing analysis headless
const browserService = RemotePlaywrightAdapter.createFromEnv();
const llmService = LlmServiceImpl.createFromEnv("openrouter");
const useCase = new ParsePricingPageUseCase(browserService, llmService);
const analyses = await useCase.execute(url, personas, onProgress, abortSignal, options);
```

### 6. Test Mocking Patterns

**From `src/application/usecases/__tests__/GeneratePersonasUseCase.test.ts`:**

```typescript
// Mock LlmServicePort
mockLlmService = {
    generateInitialPersonasStream: vi.fn(),
    generateInitialPersonas: vi.fn(),
    generateAbbreviatedBackstory: vi.fn(),
    generatePersonaBackstory: vi.fn(),
    generatePersonaInsight: vi.fn(),
} as any;

// Async iterable mock for streaming
mockLlmService.generateInitialPersonasStream.mockImplementation(async function* () {
    yield [mockPersona];
});

// Mock resolved values
mockLlmService.generateAbbreviatedBackstory.mockResolvedValue('backstory content');
mockLlmService.generatePersonaInsight.mockResolvedValue('insight content');
```

**From `src/application/usecases/__tests__/ParsePricingPageUseCase.test.ts`:**

```typescript
// Mock BrowserServicePort
mockBrowserService = {
    navigateTo: vi.fn(),
    scrollDown: vi.fn(),
    scrollTo: vi.fn(),
    getElementLocation: vi.fn(),
    captureViewport: vi.fn(),
    captureFullPage: vi.fn(),
    getCleanedHtml: vi.fn(),
    close: vi.fn(),
} as any;

// Mock analyzePricingPageStream
mockLlmService.analyzePricingPageStream.mockResolvedValue({
    partialObjectStream: (async function* () {
        yield { thoughts: 'Analysis thoughts' };
    })(),
    object: Promise.resolve({
        gutReaction: 'Positive',
        thoughts: 'Good pricing',
        scores: { clarity: 5, valuePerception: 5, trust: 5, likelihoodToBuy: 5 },
        risks: []
    })
});
```

### 7. Project Structure & Testing

- **Testing framework:** Vitest
- **Test location:** `src/application/usecases/__tests__/`
- **No existing benchmark patterns found** - benchmark script will be a new addition
- **Scripts location:** No dedicated scripts folder; benchmarks should go in `src/scripts/` or `scripts/`

### 8. Environment Configuration

- Uses `LlmServiceImpl.createFromEnv("openrouter")` or `createFromEnv("ollama")`
- Requires `.env.local` with OpenRouter API key
- Browser service uses `RemotePlaywrightAdapter.createFromEnv()`

## Code References

- `src/application/usecases/GeneratePersonasUseCase.ts:23-138` - Persona generation use case
- `src/application/usecases/ParsePricingPageUseCase.ts:25-401` - Pricing analysis use case
- `src/domain/ports/LlmServicePort.ts:1-184` - LLM service interface
- `src/domain/ports/BrowserServicePort.ts:1-20` - Browser service interface
- `src/infrastructure/adapters/LlmServiceImpl.ts:16-354` - LLM service implementation
- `src/actions/generatePersonas.ts:1-59` - Headless persona generation example
- `src/actions/analyzePricingPage.ts:1-105` - Headless pricing analysis example
- `src/application/usecases/__tests__/GeneratePersonasUseCase.test.ts:1-77` - Test mock patterns
- `src/application/usecases/__tests__/ParsePricingPageUseCase.test.ts:1-188` - Test mock patterns

## SOLID Notes

- **S:** Each use case has single responsibility (GeneratePersonasUseCase, ParsePricingPageUseCase)
- **O:** Ports (interfaces) allow extending with new adapters without modifying use cases
- **L:** LlmServicePort implementations are substitutable via the interface
- **I:** LlmServicePort is a large interface; could be split into smaller focused ports
- **D:** Use cases depend on abstractions (ports), not concrete implementations

## Open Questions

1. Should the benchmark script be placed in `scripts/benchmark.ts` or `src/scripts/benchmark.ts`?
2. What sample URL should be used for pricing page benchmark? (need a stable test URL)
3. Should timing include cold start (first LLM call) or just the generation phase?
4. How to handle mock personas for the "mock personas + report only" mode - should they be hardcoded or generated deterministically?

## Recommended Tests to Drive (for TDD phase)

- Unit test: Benchmark script returns timing in seconds.milliseconds format
- Unit test: Toggle "personas only" runs only GeneratePersonasUseCase
- Unit test: Toggle "personas + report" runs both use cases sequentially
- Unit test: Toggle "mock personas + report only" uses pre-generated personas
- Integration test: Full benchmark with real LLM completes within expected timeout
