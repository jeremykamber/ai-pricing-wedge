---
date: 2026-03-04T17:55:00-08:00
researcher: Antigravity
git_commit: 2af3f0c1cf1283d8545d766d5f56ddf61f85dd35
branch: perf/pricing-page-analysis-speed-optimizations
repository: jeremykamber/deepbound
topic: "Pricing Page Analysis: Performance and Bottleneck Research"
tags: [research, codebase, pricing-analysis, performance, bottlenecks, llm, vision, playwright]
status: complete
last_updated: 2026-03-04
last_updated_by: Antigravity
---

# Research: Pricing Page Analysis: Performance and Bottleneck Research

**Date**: 2026-03-04T17:55:00-08:00
**Researcher**: Antigravity
**Git Commit**: 2af3f0c1cf1283d8545d766d5f56**d766d5f56ddf61f85dd35
**Branch**: perf/pricing-page-analysis-speed-optimizations
**Repository**: jeremykamber/deepbound

## Research Question

How does the pricing page analysis/report get generated? Where are the bottlenecks? What are the processes that likely take the longest to run? We're trying to improve speed and efficiency so end-to-end generation completes in < 20 seconds.

## Summary

The pricing page analysis is a multi-stage pipeline involving browser automation (Playwright), hierarchical scouting (HTML-based search + Vision-based confirmation), and parallelized persona-based analysis.

The process is currently **highly sequential** and contains numerous **static delays**, making it rarely complete in under 30-40 seconds. The most significant bottlenecks are:
1.  **Sequential Scouting Strategy**: Browser navigation, HTML parsing, targeted scrolling, and vision confirmation happen one after another.
2.  **Aggressive Sleep Delays**: The `RemotePlaywrightAdapter` inserts `1000ms` delays after almost every interaction (navigation, scroll, jump).
3.  **Limited LLM Parallelism**: Persona analysis is constrained by `pLimit(2)`, meaning even modest persona counts (e.g., 6) result in significant queuing delays.
4.  **Multiple Sequential LLM Calls**: Scouting involves at least 3-4 separate LLM calls (HTML check, Visibility check, HTML Summarization) before persona analysis even begins.

## Detailed Findings

### 1. Scouting and Interaction Flow

The flow is orchestrated by `ParsePricingPageUseCase.execute`.

- **Navigation**: Waits for `networkidle` plus a hard `1s` "breather" ([RemotePlaywrightAdapter.ts:356](https://github.com/jeremykamber/deepbound/blob/2af3f0c1cf1283d8545d766d5f56ddf61f85dd35/src/infrastructure/adapters/RemotePlaywrightAdapter.ts#L356)).
- **HTML Check**: Uses `google/gemma-3-12b-it` to find pricing selectors or anchor text ([ParsePricingPageUseCase.ts:112](https://github.com/jeremykamber/deepbound/blob/2af3f0c1cf1283d8545d766d5f56ddf61f85dd35/src/application/usecases/ParsePricingPageUseCase.ts#L112)).
- **Targeted Strike (Strategy A)**:
    - Jumps to a "Buffer Y" (1000px above target).
    - Performs two `scrollDown(500)` calls to trigger lazy loads.
    - Centering scroll.
    - **Vision Confirmation**: Calls `qwen/qwen3-vl-8b-instruct` to verify pricing is visible ([ParsePricingPageUseCase.ts:146](https://github.com/jeremykamber/deepbound/blob/2af3f0c1cf1283d8545d766d5f56ddf61f85dd35/src/application/usecases/ParsePricingPageUseCase.ts#L146)).
- **Linear Scan (Strategy B - Fallback)**: If Strategy A fails, it scrolls up to 15 times, taking a screenshot and calling the Vision LLM at *every* step ([ParsePricingPageUseCase.ts:156-188](https://github.com/jeremykamber/deepbound/blob/2af3f0c1cf1283d8545d766d5f56ddf61f85dd35/src/application/usecases/ParsePricingPageUseCase.ts#L156-L188)).
- **HTML Compacting**: After finding the spot, it extracts cleaned HTML and calls `summarizeHtml` ([ParsePricingPageUseCase.ts:197](https://github.com/jeremykamber/deepbound/blob/2af3f0c1cf1283d8545d766d5f56ddf61f85dd35/src/application/usecases/ParsePricingPageUseCase.ts#L197)).

**Bottleneck**: Each `1s` delay and LLM call (avg 1-2s) adds up. A successful Strategy A takes ~10s. Strategy B can take 30s+.

### 2. Persona Analysis Engine

Once scouting is complete, the `execute` method proceeds to analyze from individual persona perspectives.

- **Queue Management**: Uses `pLimit(2)` ([ParsePricingPageUseCase.ts:225](https://github.com/jeremykamber/deepbound/blob/2af3f0c1cf1283d8545d766d5f56ddf61f85dd35/src/application/usecases/ParsePricingPageUseCase.ts#L225)).
- **Model**: `qwen/qwen3-vl-30b-a3b-instruct` ([LlmServiceImpl.ts:35](https://github.com/jeremykamber/deepbound/blob/2af3f0c1cf1283d8545d766d5f56ddf61f85dd35/src/infrastructure/adapters/LlmServiceImpl.ts#L35)).
- **Mode**: Hybrid Grounding (Screenshot + HTML Summary) ([VisionAnalysisAdapter.ts:42](https://github.com/jeremykamber/deepbound/blob/2af3f0c1cf1283d8545d766d5f56ddf61f85dd35/src/infrastructure/adapters/VisionAnalysisAdapter.ts#L42)).

**Bottleneck**: Streaming a full structured JSON object through a 30B Vision model takes 5-15 seconds per persona. With only 2 running in parallel, 6 personas will take 15-45 seconds *after* scouting is finished.

### 3. Key Latency Factors

| Area | Factor | Estimated Time | Improvement Potential |
| :--- | :--- | :--- | :--- |
| **Browser** | Remote WebSocket Latency | ~100-200ms/op | Batch actions |
| **Browser** | Hard Delays (Wait for settle) | 1-5s total | Use mutation observers or shorter waits |
| **LLM** | HTML Scouting Call | 1-3s | Combine with navigation |
| **LLM** | Vision Conf (Scraping) | 2-4s | Optional if HTML confidence is high |
| **LLM** | HTML Compacting | 2-4s | Parallelize with Persona 1 analysis |
| **Analysis** | Persona Parallelism | Personas / 2 * AnalysisTime | Increase `pLimit` |

## Code References

- `src/application/usecases/ParsePricingPageUseCase.ts:112` — Start of sequential LLM/Scouting calls.
- `src/infrastructure/adapters/RemotePlaywrightAdapter.ts:131, 144, 356` — Hard-coded `1000ms` delays.
- `src/application/usecases/ParsePricingPageUseCase.ts:225` — `pLimit(2)` restriction.
- `src/infrastructure/adapters/VisionAnalysisAdapter.ts:88` — `isPricingVisible` vision confirmation.

## Architecture Documentation

- **Adaptive Scouting**: Instead of taking a huge screenshot, the system "hunts" for the pricing block to ensure it has the best visual context (correct currency, activated lazy-loaders).
- **Hybrid Grounding**: The system combines visual layout (screenshot) with factual data (summarized HTML) to prevent LLM hallucinations on pricing numbers.
- **Service-Port Pattern**: The business logic (`ParsePricingPageUseCase`) is decoupled from the implementation (`RemotePlaywrightAdapter`, `LlmServiceImpl`) via domain ports.

## Historical Context (from thoughts/)

- `thoughts/research/2026-02-19-1152-adaptive-pricing-scouting.md`: Documented the original requirement for vision-based scouting to handle complex single-page apps (SPAs).
- `thoughts/research/2026-02-19-1928-pricing-analysis-refactor.md`: Introduced HTML compacting to save on token costs and improve grounded accuracy by replacing raw HTML with summaries.

## Open Questions

- **Rate Limits**: What is the actual token/request limit on OpenRouter for the Qwen VL models? Increasing `pLimit` is the easiest win if the infrastructure allows.
- **Confidence Heuristics**: Can we define a confidence score for `isPricingVisibleInHtml`? If it finds exactly `#pricing-table`, can we skip all vision-based scouting and jump directly to capturing the viewport?
- **Streaming UI**: Could the UI start displaying "Gut Reactions" faster if we prioritized the first fields of the JSON object more aggressively?
