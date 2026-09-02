# Benchmark Script for Persona Generation and Pricing Page Analysis

## Overview

Create a headless benchmarking script that measures execution time for persona generation and pricing page analysis. The script will support multiple modes via CLI flags and output precise timing results.

## Current State Analysis

- **Persona generation**: `GeneratePersonasUseCase` in `src/application/usecases/GeneratePersonasUseCase.ts` takes `LlmServicePort` and can run headlessly
- **Pricing analysis**: `ParsePricingPageUseCase` in `src/application/usecases/ParsePricingPageUseCase.ts` takes `BrowserServicePort` and `LlmServicePort`
- **Testing**: Vitest configured in `vitest.config.ts` with jsdom environment
- **No existing benchmark patterns** - script will be a new addition

## Desired End State

A runnable benchmark script (`scripts/benchmark.ts`) that:
- Accepts CLI flags: `--personas-only`, `--use-mock-personas`, `--url`
- Outputs timing in `X.XXXs` format (seconds with 3 decimal places)
- Exits cleanly with proper error handling
- Works without UI (headless browser automation)

### Key Discoveries:
- `GeneratePersonasUseCase.execute(description)` returns `Promise<Persona[]>` - `src/application/usecases/GeneratePersonasUseCase.ts:28`
- `ParsePricingPageUseCase.execute(url, personas)` returns `Promise<PricingAnalysis[]>` - `src/application/usecases/ParsePricingPageUseCase.ts:43`
- Use cases can be instantiated headlessly via `LlmServiceImpl.createFromEnv("openrouter")` - `src/actions/generatePersonas.ts:44`
- Mock personas can be created from `Persona` interface - `src/domain/entities/Persona.ts:3-28`

## What We're NOT Doing

- **No UI integration** - pure headless script
- **No persistent result storage** - only console output
- **No multi-URL benchmarking** - single URL at a time
- **No custom persona descriptions** - uses hardcoded sample

## Implementation Approach

Create a standalone benchmark script using the existing use cases. Use Node.js with tsx for execution (following project patterns).

### SOLID Analysis:
- **S**: BenchmarkOrchestrator handles timing and orchestration only; use cases remain separate
- **O**: Extendable with new modes via CLI flag handler pattern
- **L**: MockPersonaProvider implements same interface as real personas
- **I**: Small interfaces for timing and output
- **D**: Script depends on use case abstractions, not action files

## Phase 1: Project Setup

### Overview

Add benchmark script entry point and necessary dependencies.

### Changes Required:

#### 1. Add tsx for running TypeScript directly

**File**: `package.json`
**Changes**: Add tsx as dev dependency

```json
"devDependencies": {
  "tsx": "^4.19.0"
}
```

Run: `npm install tsx --save-dev`

#### 2. Add npm script for running benchmark

**File**: `package.json`
**Changes**: Add benchmark script

```json
"scripts": {
  "benchmark": "tsx scripts/benchmark.ts"
}
```

---

## Phase 2: Create Benchmark Script

### Overview

Implement the main benchmark orchestrator with CLI flag parsing and timing logic.

### Changes Required:

#### 1. Create scripts directory and benchmark entry point

**File**: `scripts/benchmark.ts`
**Changes**: Create benchmark orchestrator

```typescript
#!/usr/bin/env tsx

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { ParsePricingPageUseCase } from "@/application/usecases/ParsePricingPageUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";

const DEFAULT_URL = "https://pricing.example.com";
const DEFAULT_PERSONA_DESCRIPTION = "B2B SaaS pricing page users";

interface BenchmarkFlags {
  personasOnly: boolean;
  useMockPersonas: boolean;
  url: string;
}

function parseArgs(): BenchmarkFlags {
  const args = process.argv.slice(2);
  return {
    personasOnly: args.includes("--personas-only"),
    useMockPersonas: args.includes("--use-mock-personas"),
    url: args.find(a => a.startsWith("--url="))?.split("=")[1] || DEFAULT_URL,
  };
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`;
}

function createMockPersonas(): Persona[] {
  return [
    {
      id: "mock-1",
      name: "Alice Chen",
      age: 32,
      occupation: "Product Manager",
      educationLevel: "MBA",
      interests: ["Productivity tools", "Data analysis"],
      goals: ["Scale team efficiency", "Reduce costs"],
      personalityTraits: ["Analytical", "Pragmatic"],
      conscientiousness: 80,
      neuroticism: 30,
      openness: 65,
      extraversion: 55,
      agreeableness: 70,
      cognitiveReflex: 75,
      technicalFluency: 70,
      economicSensitivity: 85,
      designStyle: "Minimalist",
      livingEnvironment: "Urban apartment",
      backstory: "10 years in tech, focused on B2B tools",
      aiInsight: "Alice prioritizes ROI and data-driven decisions.",
    },
    {
      id: "mock-2", 
      name: "Bob Martinez",
      age: 28,
      occupation: "Startup Founder",
      educationLevel: "CS Degree",
      interests: ["AI/ML", "Growth hacking"],
      goals: ["Find product-market fit", "Scale quickly"],
      personalityTraits: ["Risk-taker", "Visionary"],
      conscientiousness: 60,
      neuroticism: 45,
      openness: 90,
      extraversion: 80,
      agreeableness: 55,
      cognitiveReflex: 40,
      technicalFluency: 95,
      economicSensitivity: 40,
      designStyle: "Modern",
      livingEnvironment: "Co-working space",
      backstory: "First-time founder, technical background",
      aiInsight: "Bob wants cutting-edge features over stability.",
    },
  ];
}

async function runBenchmark() {
  const flags = parseArgs();
  
  console.log("\n=== DeepBound Benchmark ===");
  console.log(`Mode: ${flags.personasOnly ? "personas-only" : flags.useMockPersonas ? "mock-personas+report" : "personas+report"}`);
  console.log(`URL: ${flags.url}\n`);

  const results: { phase: string; timeMs: number }[] = [];

  // Phase 1: Persona Generation
  if (!flags.useMockPersonas) {
    console.log("[1/2] Generating personas...");
    const startPersonas = Date.now();
    
    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const useCase = new GeneratePersonasUseCase(llmService);
    const personas = await useCase.execute(DEFAULT_PERSONA_DESCRIPTION);
    
    const personasTime = Date.now() - startPersonas;
    results.push({ phase: "persona_generation", timeMs: personasTime });
    console.log(`      Done: ${formatTime(personasTime)}\n`);

    if (flags.personasOnly) {
      console.log("=== Results ===");
      console.log(`Persona Generation: ${formatTime(personasTime)}`);
      console.log("");
      return;
    }

    // Phase 2: Pricing Analysis
    console.log("[2/2] Analyzing pricing page...");
    const startAnalysis = Date.now();
    
    const browserService = RemotePlaywrightAdapter.createFromEnv();
    const analysisUseCase = new ParsePricingPageUseCase(browserService, llmService);
    await analysisUseCase.execute(flags.url, personas);
    
    const analysisTime = Date.now() - startAnalysis;
    results.push({ phase: "pricing_analysis", timeMs: analysisTime });
    console.log(`      Done: ${formatTime(analysisTime)}\n`);

    await browserService.close();

    console.log("=== Results ===");
    console.log(`Persona Generation: ${formatTime(personasTime)}`);
    console.log(`Pricing Analysis:   ${formatTime(analysisTime)}`);
    console.log(`Total:               ${formatTime(personasTime + analysisTime)}`);
  } else {
    // Mock personas + report only
    console.log("[1/1] Analyzing pricing page with mock personas...");
    const startAnalysis = Date.now();
    
    const personas = createMockPersonas();
    const browserService = RemotePlaywrightAdapter.createFromEnv();
    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const analysisUseCase = new ParsePricingPageUseCase(browserService, llmService);
    await analysisUseCase.execute(flags.url, personas);
    
    const analysisTime = Date.now() - startAnalysis;
    results.push({ phase: "pricing_analysis_mock", timeMs: analysisTime });
    console.log(`      Done: ${formatTime(analysisTime)}\n`);

    await browserService.close();

    console.log("=== Results ===");
    console.log(`Pricing Analysis (mock): ${formatTime(analysisTime)}`);
  }

  console.log("");
}

runBenchmark().catch(console.error);
```

---

## Phase 3: Add Tests

### Overview

Add unit tests for timing formatting and flag parsing.

### Changes Required:

#### 1. Create benchmark tests

**File**: `scripts/__tests__/benchmark.test.ts`
**Changes**: Add unit tests

```typescript
import { describe, it, expect, vi } from "vitest";
import { formatTime, parseArgs } from "../benchmark";

describe("formatTime", () => {
  it("formats milliseconds to seconds with 3 decimals", () => {
    expect(formatTime(100)).toBe("0.100s");
    expect(formatTime(1500)).toBe("1.500s");
    expect(formatTime(10000)).toBe("10.000s");
  });
});

describe("parseArgs", () => {
  it("defaults to personas+report mode", () => {
    const original = process.argv;
    process.argv = ["node", "benchmark"];
    expect(parseArgs().personasOnly).toBe(false);
    expect(parseArgs().useMockPersonas).toBe(false);
    process.argv = original;
  });

  it("parses --personas-only flag", () => {
    const original = process.argv;
    process.argv = ["node", "benchmark", "--personas-only"];
    expect(parseArgs().personasOnly).toBe(true);
    process.argv = original;
  });

  it("parses --use-mock-personas flag", () => {
    const original = process.argv;
    process.argv = ["node", "benchmark", "--use-mock-personas"];
    expect(parseArgs().useMockPersonas).toBe(true);
    process.argv = original;
  });

  it("parses --url flag", () => {
    const original = process.argv;
    process.argv = ["node", "benchmark", "--url=https://test.com"];
    expect(parseArgs().url).toBe("https://test.com");
    process.argv = original;
  });
});
```

#### 2. Export testable functions

**File**: `scripts/benchmark.ts`
**Changes**: Extract functions for testing

```typescript
// At bottom of file, add:
export { formatTime, parseArgs, createMockPersonas };
```

---

## Testing Strategy

### Unit Tests:
- `formatTime()` returns correct `X.XXXs` format
- `parseArgs()` correctly parses all flags
- `createMockPersonas()` returns valid Persona objects

### Integration Tests:
- Full benchmark runs with `--personas-only` flag
- Full benchmark runs with `--use-mock-personas` flag
- Default mode (personas + report) completes without error

### Test Commands:
```bash
# Run tests
npm run benchmark -- --help

# Run unit tests
npx vitest run scripts/__tests__/

# Run benchmark
npm run benchmark -- --personas-only
npm run benchmark -- --use-mock-personas
npm run benchmark -- --url=https://example.com
```

---

## Success Criteria

### Automated Verification:
- [ ] `npm run benchmark -- --personas-only` executes and outputs timing
- [ ] `npm run benchmark -- --use-mock-personas` executes and outputs timing
- [ ] `npm run benchmark` (default) executes both phases and outputs timing
- [ ] Timing output format: `X.XXXs` (e.g., `12.345s`)
- [ ] Tests pass: `npx vitest run scripts/__tests__/`
- [ ] Type checking passes: `npx tsc --noEmit`

### Manual Verification:
- [ ] Script runs headlessly (no browser window opens)
- [ ] Error handling works gracefully on failure

---

## File Structure

```
deepbound/
├── package.json                    # Added benchmark script + tsx dependency
├── scripts/
│   ├── benchmark.ts               # Main benchmark orchestrator
│   └── __tests__/
│       └── benchmark.test.ts      # Unit tests for timing/flags
```
