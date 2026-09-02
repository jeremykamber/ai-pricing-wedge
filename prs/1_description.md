# Benchmark Script for Persona Generation and Pricing Analysis

## Summary

Add a headless benchmarking script to measure execution time for persona generation and pricing page analysis. The script supports multiple modes via CLI flags and outputs precise timing results.

## Research Findings

- **Persona generation**: `GeneratePersonasUseCase` takes `LlmServicePort` and can run headlessly
- **Pricing analysis**: `ParsePricingPageUseCase` takes `BrowserServicePort` and `LlmServicePort`
- Use cases can be instantiated headlessly via `LlmServiceImpl.createFromEnv("openrouter")`
- No existing benchmark patterns in codebase

## Implementation Approach

1. Add `tsx` as dev dependency for running TypeScript directly
2. Create `scripts/benchmark.ts` with CLI flag parsing and timing logic
3. Create unit tests for `formatTime()` and `parseArgs()`

## Key Changes

- **scripts/benchmark.ts**: Main benchmark orchestrator with:
  - CLI flags: `--personas-only`, `--use-mock-personas`, `--url=<url>`
  - Timing output in X.XXXs format (e.g., 12.345s)
  - Mock personas for testing
  - Headless execution via RemotePlaywrightAdapter
- **scripts/__tests__/benchmark.test.ts**: 8 unit tests for timing and flag parsing
- **package.json**: Added `tsx` dependency and `benchmark` npm script

## Testing Performed

- All 8 unit tests pass
- TypeScript compiles without new errors
- Flag parsing verified manually

## Usage

```bash
# Default: personas + report
npm run benchmark

# Just persona generation
npm run benchmark -- --personas-only

# Mock personas + report only
npm run benchmark -- --use-mock-personas

# Custom URL
npm run benchmark -- --url=https://example.com
```

## Example Output

```
=== DeepBound Benchmark ===
Mode: personas+report
URL: https://pricing.example.com

[1/2] Generating personas...
      Done: 12.345s

[2/2] Analyzing pricing page...
      Done: 8.123s

=== Results ===
Persona Generation: 12.345s
Pricing Analysis:   8.123s
Total:               20.468s
```

## Links

- Research: thoughts/research/2026-03-27-2131-benchmark-script-persona-report.md
- Plan: thoughts/plans/2026-03-27-2200-benchmark-script-persona-report.md
