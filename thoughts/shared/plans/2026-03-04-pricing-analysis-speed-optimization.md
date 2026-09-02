# Pricing Analysis Speed Optimization Implementation Plan

## Overview

Modernize the pricing analysis pipeline to achieve **end-to-end completion in < 20 seconds**. The current implementation is heavily sequential with artificial bottlenecks and static delays. This plan focuses on increasing concurrency, eliminating dead time, and parallelizing LLM-heavy scouting steps.

## Current State Analysis

- **Sequential Scouting**: Scouting involves 3-4 separate LLM/Vision calls (HTML check, Target Strike, Vision Verify, Compacting) before analysis starts.
- **Fixed IO Delays**: `RemotePlaywrightAdapter` inserts `1000ms` waits after almost every interaction.
- **Low Concurrency**: Analysis is capped at `pLimit(2)`, forcing 6 personas into 3 sequential batches.
- **Artificial Staggering**: A manual `setTimeout` delay is added between persona starts.

## Desired End State

- **End-to-End Speed**: Complete a full 6-persona audit in < 20 seconds (measured from URL submission to final JSON completion).
- **Elastic Concurrency**: Scale analysis to a limit of **5** concurrent threads.
- **Intelligent Bypasses**: Skip Vision Verification for high-confidence HTML targets.

### Key Discoveries:

- `RemotePlaywrightAdapter.ts:131, 144, 356` — Hardcoded `1000ms` delays.
- `ParsePricingPageUseCase.ts:225` — `pLimit(2)` restriction.
- `ParsePricingPageUseCase.ts:246` — Artificial staggered delay.
- `VisionAnalysisAdapter.ts:88` — Vision-based scouting confirmation is slow and duplicative for clear HTML targets.

## What We're NOT Doing

- Upgrading LLM models (sticking with current Qwen/Gemma models).
- Refactoring the UI/Frontend beyond necessary progress reporting changes.
- Modifying the core domain entities (`PricingAnalysis`).

## Implementation Approach

1.  **Reduce Dead Time**: Replace static 1s waits with 200ms pulses or DOM-stability checks.
2.  **Concurrency Lift**: Set persona analysis concurrency to 5.
3.  **High-Confidence Bypass**: If HTML scouting finds a definitive selector (e.g., `#pricing-table`), skip the Vision Confirmation step.
4.  **Pipeline Parallelization**: Final HTML compacting (summarization) will run concurrently with the browser's final scouting steps.

---

## Phase 1: Browser & IO Latency Reduction

### Overview

Eliminate the cumulative "dead time" caused by hardcoded sleeps in the browser adapter.

### Changes Required:

#### 1. Browser Adapter Tweaks
**File**: `src/infrastructure/adapters/RemotePlaywrightAdapter.ts`
**Changes**: Reduce all `waitForTimeout(1000)` calls to `250ms`. Optimize `waitPageCompletely` to accept an optional selector to wait for.

```typescript
// Replace instances of 1000ms with shorter durations
await this.page.waitForTimeout(250); // From 1000ms
```

### Success Criteria:

#### Automated Verification:
- [x] Browser tests pass: `npm run test` (if available) or manual node scripts.
- [ ] Navigation remains stable on complex sites (e.g., Stripe, Shopify).

#### Manual Verification:
- [ ] Observe live feed: Browser interactions feel snappy and immediate.

---

## Phase 2: Scouting Optimization & Bypasses

### Overview

Implement a logic bridge that allows the scraper to skip slow vision checks if it's "confident" in the HTML structure.

### Changes Required:

#### 1. Add Bypass Logic to Use Case
**File**: `src/application/usecases/ParsePricingPageUseCase.ts`
**Changes**: 
- Add a heuristic check: if `pricingLocation.selector` starts with `#` or is a common pricing indicator, set `skipVisionVerification = true`.
- Implement a `USE_VISION_SCOUT` boolean flag (defaulting to true for fallback).

#### 2. Pipeline Parallelization
**File**: `src/application/usecases/ParsePricingPageUseCase.ts`
**Changes**: Trigger the `summarizeHtml` call immediately after Strategy A/B completes, without waiting for any trailing animations.

### Success Criteria:

#### Automated Verification:
- [x] Scraping bench: Verify that for a known site like `stripe.com`, `isPricingVisible` LLM call is skipped.

---

## Phase 3: Scaling Concurrency

### Overview

Unlock the LLM engine to run more personas in parallel.

### Changes Required:

#### 1. Increase P-Limit
**File**: `src/application/usecases/ParsePricingPageUseCase.ts` and `src/application/usecases/GeneratePersonasUseCase.ts`
**Changes**: Change `pLimit(2)` to `pLimit(5)`.

#### 2. Remove Staggering
**File**: `src/application/usecases/ParsePricingPageUseCase.ts`
**Changes**: Remove the manual `setTimeout` stagger at line 246.

### Success Criteria:

#### Automated Verification:
- [x] Stress test: Run 5 personas concurrently via OpenRouter with no 429 errors.

---

## Phase 4: Verification & Benchmarking

### Overview

Final end-to-end validation.

### Testing Strategy

1.  **Benchmarking URLs**:
    *   `https://www.stripe.com/pricing` (Clean HTML, simple)
    *   `https://www.intercom.com/pricing` (Complex SPA)
    *   `https://www.notion.so/pricing` (Deep scrolling)
2.  **Target**: All 3 should complete in **< 18 seconds average**.

### Manual Testing Steps:

1.  Open the App.
2.  Submit `https://stripe.com/pricing`.
3.  Start a timer.
4.  Verify all 6 personas finish JSON generation before 20s.

## Performance Considerations

- **Rate Limits**: OpenRouter/Qwen rate limits might hit at concurrency 5. We will monitor the `LlmServiceImpl` retry logs.
- **Browser Context**: Single browser context is fine, but parallelizing *browsers* is out of scope for < 20s (overhead of connection is ~2s).

## References

- Research: `thoughts/shared/research/2026-03-04-pricing-analysis-speed-optimizations.md`
- Original Scouting Logic: `ParsePricingPageUseCase.ts`
