# Pricing Analysis Pipeline — Architecture & Flow

> **Audience:** Developers debugging or extending the pricing analysis feature.
> **Last updated:** 2026-06-06

---

## 1. HIGH-LEVEL OVERVIEW

```
User clicks "Run Analysis"
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  UI Layer (useAnalysisFlow.ts)                      │
│  - Creates analysis entry                           │
│  - Calls analyzePricingPageAction (server action)   │
│  - Reads streamed results via readStreamableValue   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Server Action (analyzePricingPage.ts)              │
│  - Rate limiting                                    │
│  - Initializes AnalysisLogger (per-run log file)    │
│  - Creates BrowserService + LlmService              │
│  - Delegates to ParsePricingPageUseCase             │
│  - Streams results back via createStreamableValue   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  ParsePricingPageUseCase.execute()                  │
│                                                     │
│  ┌────────── PHASE 1: SCOUTING ──────────┐          │
│  │  A. Navigate to URL via Playwright      │         │
│  │  B. Capture initial viewport           │         │
│  │  C. Get cleaned HTML                   │         │
│  │  D. Parallel: isPricingVisibleInHtml   │         │
│  │            + summarizeHtml             │         │
│  │  E. STRATEGY A: Guided Strike          │         │
│  │     - getElementLocation → scroll      │         │
│  │     - Vision verification              │         │
│  │  F. STRATEGY B: Linear Scan (fallback) │         │
│  │     - Scroll + check x8               │         │
│  │  G. Resolve compacted HTML             │         │
│  └────────────────────────────────────────┘         │
│                                                     │
│  ┌────────── PHASE 2: ANALYSIS ──────────┐          │
│  │  Parallel (p-limit, concurrency=5):   │          │
│  │  For EACH persona:                    │          │
│  │    1. analyzePricingPageStream()      │          │
│  │    2. Iterate partialObjectStream     │          │
│  │    3. Emergency break checks          │          │
│  │    4. Resolve full object             │          │
│  │    5. Validate + add metadata         │          │
│  └────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

---

## 2. ENTRY POINTS

### 2a. UI Entry — `useAnalysisFlow` hook

| Location | `src/ui/hooks/useAnalysisFlow.ts` |
|----------|-----------------------------------|

- **`handleAnalyzePricing(personas)`** (line 49) — the main trigger
  - Creates an analysis entry in `useAnalysisStore`
  - Calls `analyzePricingPageAction()` inside `startTransition`
  - Reads the streamable value in a `for await` loop (line 84)
  - Handles `DONE`, `ERROR`, `CANCELLED` step transitions
  - Accumulates `analysisToken` per persona (line 139)
  - Throttles React state updates to 150ms (line 81, `THROTTLE_MS`)

- **`handleCancel()`** (line 36) — cancellation via `cancelRequestAction`

- **Progress type** `AnalysisProgress` (line 12) — step, screenshot, personaName, streamingTexts

### 2b. API Entry — `/api/report`

| Location | `src/app/api/report/route.ts` |
|----------|------------------------------|

- **`POST /api/report`** (line 7)
  - Accepts `{ url, personas, requestId, imageBase64 }` JSON body
  - Validates input (lines 11-45)
  - Instantiates the same use case pipeline
  - Returns all analyses as a single JSON response (non-streaming)
  - Uses `runId` for AnalysisLogger

### 2c. Server Action — `analyzePricingPageAction`

| Location | `src/actions/analyzePricingPage.ts` |
|----------|------------------------------------|

- **`analyzePricingPageAction()`** (line 26)
  - Parameters: `url`, `personas`, `requestId?`, `imageBase64?`
  - Rate limiting via `rate-limiter-flexible` (5 req/min, lines 12-19)
  - Creates `RemotePlaywrightAdapter` + `LlmServiceImpl` (lines 65-66)
  - Wraps all async work in an IIFE to return the streamable immediately (line 56)
  - Passes `runId: id` to the use case options (line 84)
  - Logging: initializes `AnalysisLogger.forRun(id)`, calls `log.close()` in `finally`

- **Key lines:**
  - `stream = createStreamableValue<any>(...)` (line 35) — the AI SDK stream
  - `cancellationManager.createRequest(id)` (line 32) — abort controller
  - `await log.init()` (line 38) — creates the per-run log file
  - `stream.done({ step: "DONE", analyses })` (line 87) — finalizes stream

---

## 3. CORE ORCHESTRATOR — `ParsePricingPageUseCase`

| Location | `src/application/usecases/ParsePricingPageUseCase.ts` |
|----------|-------------------------------------------------------|

### `execute()` method (line 43)

Options:
```typescript
{
  imageBase64?: string;             // skip browser, use uploaded image
  tokenLimit?: number;              // max tokens per persona (default: 2000)
  runId?: string;                   // for AnalysisLogger
}
```

> **Note:** Analysis always runs in completion mode (single LLM call per persona). The "streaming" in the client UX refers to **progress updates** via `createStreamableValue` (local) or polling (VPS), not token-by-token LLM streaming.

### Phase 1: Scouting (lines 57-276)

**Step A — Navigate** (line 82): `browserService.navigateTo(url, onProgress, onLiveScreenshot)`
- Progress: `SETTING_UP` → `LOADING_WEBSITE`
- Live screenshots captured every 500ms

**Step B — Initial viewport** (line 108): `browserService.captureViewport()`

**Step C — Get cleaned HTML** (line 112): `browserService.getCleanedHtml()`
- Uses `page.evaluateHandle()` to run a DOM cleaner in the browser
- Returns text-only representation with meaningful tags preserved

**Step D — Parallel LLM calls** (lines 117-118):
- `llmService.isPricingVisibleInHtml(pageHtml)` — finds pricing content in cleaned HTML
- `llmService.summarizeHtml(pageHtml)` — extracts product info, tiers, prices, features

**Step E — Strategy A: Guided Strike** (lines 123-168):
- If HTML analysis finds a selector/anchor, scroll to it
  - Buffer jump: 1000px above target (line 133)
  - Stroll: 2 x 500px to trigger lazy loads (lines 139-140)
  - Center offset: 160px (line 143)
- Vision verification via `llmService.isPricingVisible()` (line 163)
- **Optimization:** Skips vision check on high-confidence selectors (line 159, `SKIP_VISION_VERIFY_ON_HIGH_CONFIDENCE`)

**Step F — Strategy B: Linear Scan** (lines 174-206):
- Fallback: scroll + check x 8 (800px each)
- Each step: capture → `isPricingVisible()` → scroll
- Final center offset if found (line 196)

**Step G — Resolve HTML** (lines 209-215): Await the concurrent `summarizeHtml` result

### Phase 2: Persona Analysis (lines 282-464)

**Concurrency control** (lines 237-238):
```typescript
const limit = pLimit(5);  // 5 concurrent personas
```

For each persona:

1. **`analyzePricingPageStream()`** (line 316) — calls VisionAnalysisAdapter
2. **Iterate `partialObjectStream`** (line 337)
   - Streams partial JSON objects as they arrive from the LLM
   - Extracts `thoughts` field for live streaming to the UI (line 359-370)
   - Emergency break: >5000 chunks or >tokenLimit*10 chars (lines 348-352)
3. **Race vs 3-minute timeout** (lines 323-395)
4. **Resolve full object** (line 381): `await result.object`
5. **Validate** (line 442): `validatePricingAnalysis(fullAnalysis)`
6. **Fallback** on validation failure (lines 443-459)

**Two code paths:**
- `nonStreamingAuditMode=true` → `analyzePricingPageCompletion()` (line 283)
- `nonStreamingAuditMode=false` (default) → `analyzePricingPageStream()` (line 316)

---

## 4. VISION ANALYSIS ADAPTER

| Location | `src/infrastructure/adapters/VisionAnalysisAdapter.ts` |
|----------|-------------------------------------------------------|

### `analyzePricingPageStream()` (line 38)

The main streaming analysis method. What it does:

1. **ID-RAG ingestion** (line 45): `ensureIngested(persona)` — stores backstory chunks
2. **RAG retrieval** (line 49): `ragService.retrieveContext(persona, query, 3)` — top-3 relevant chunks
3. **Prompt compilation** (line 54): `promptCompiler.compileSystemPrompt(persona)` — 4 compartments
4. **System prompt construction** (lines 59-120):
   - Compartmentalized persona identity
   - ID-RAG context injection
   - Openness priming with persona anchor
   - Strict JSON output rules
   - Intent funnel scoring (Exploration → Analysis → Buy)
   - Hybrid grounding rules (screenshot for visuals, HTML for data)
5. **`streamObject()` call** (lines 126-146):
   - Model: `llmService.visionModel` (default: `qwen/qwen3-vl-30b-a3b-instruct`)
   - Schema: `PricingAnalysisSchema` (Zod)
   - Temperature: 0.4
   - Messages: text prompt + screenshot image
   - Returns an object with `partialObjectStream` and `object` properties

### `analyzePricingPageCompletion()` (line 234)

Non-streaming audit version. Same approach but uses:
- `createChatCompletion()` instead of `streamObject()`
- Temperature: 0.1
- `response_format: { type: "json_object" }`
- Zod schema validation on the result
- Fallback error object on failure

### `isPricingVisible()` (line 155)

- Sends screenshot to `scoutVisionModel` (default: same Qwen model)
- Returns `boolean`
- Uses `withRetry()` for resilience

### `isPricingVisibleInHtml()` (line 191)

- Sends cleaned HTML to `smallTextModel` (default: `deepseek/deepseek-v4-flash`)
- Returns `PricingLocation { found, selector?, anchorText?, reasoning? }`
- Temperature: 0, `response_format: "json_object"`

---

## 5. LLM SERVICE INFRASTRUCTURE

| Location | `src/infrastructure/adapters/LlmServiceImpl.ts` |
|----------|------------------------------------------------|

### Models (OpenRouter defaults, lines 36-41):
| Model Variable | Default | Purpose |
|---|---|---|
| `textModel` | `deepseek/deepseek-v4-flash` | General text generation |
| `smallTextModel` | `deepseek/deepseek-v4-flash` | Simple tasks, HTML analysis |
| `visionModel` | `qwen/qwen3-vl-30b-a3b-instruct` | Vision analysis (streaming + completion) |
| `scoutVisionModel` | `qwen/qwen3-vl-30b-a3b-instruct` | Quick pricing visibility checks |
| `extractionModel` | `deepseek/deepseek-v4-flash` | HTML summarization |

### `createChatCompletion()` (line 159)
- Rate-limited via `LlmServiceImpl.limiter` (p-limit, concurrency 20)
- Auto-retries with exponential backoff (5 retries)
- Captures and logs reasoning tokens (DeepSeek V4 Flash)
- Now accepts optional `runId` for logger

### `withRetry()` (line 76)
- 5 retries max
- Retryable: 429 (rate limit) and 5xx (server error)
- Wait: `2^retry * 2000 + random(1000)` ms

### `createChatCompletionStream()` (line 208)
- Yields `<<REASONING>>...<</REASONING>>` tags before content

---

## 6. SUPPORTING FILES

### `HtmlSummarizer` — `src/infrastructure/adapters/HtmlSummarizer.ts`
- **`summarizeHtml(html, runId?)`** (line 6)
- Model: `extractionModel`
- Extracts: product topic, navigation links, pricing tiers, features, fine print
- Returns markdown summary

### `PersonaPromptCompiler` — `src/infrastructure/adapters/PersonaPromptCompiler.ts`
- **`compileSystemPrompt(persona, context?, runId?)`** (line 25)
- 4 compartments:
  - `PERSONA IDENTITY` — demographics, backstory (line 37)
  - `PSYCHOGRAPHIC PROFILE` — Big Five, values, fears (line 57)
  - `EPISTEMIC BOUNDARIES` — what they know/don't know (line 89)
  - `BEHAVIORAL GUARDRAILS` — response rules, refusal patterns (line 110)
- **`generateAnchor(persona)`** (line 152) — short persona anchor string from archetype detection

### `IdRagService` — `src/infrastructure/adapters/IdRagService.ts`
- **`retrieveContext(persona, query, k, runId?)`** (line 29)
  - Calls `store.retrieve(persona.id, query, k)` — n-gram similarity search
  - Returns `RagContext { contextString, chunkCount }`

### `IdRagStore` — `src/infrastructure/adapters/IdRagStore.ts`
- In-memory vector store using character n-gram fingerprinting
- Backstory split into chunks with topic tags, emotional tone
- Retrieval via `cosineSimilarity(ngramFingerprint(query), ngramFingerprint(chunk))`

### `RemotePlaywrightAdapter` — `src/infrastructure/adapters/RemotePlaywrightAdapter.ts`
- Connects to remote browser via `PLAYWRIGHT_WS_ENDPOINT`
- Stealth configuration (user agent, headers, cookies)
- Key methods: `navigateTo`, `scrollDown`, `scrollTo`, `getElementLocation`, `captureViewport`, `getCleanedHtml`

### `OpenRouterCriticAdapter` — `src/infrastructure/adapters/OpenRouterCriticAdapter.ts`
- **`evaluateConsistency(persona, analysis, runId?)`** (line 42)
- Evaluates "Deep Binding" — whether the persona's analysis is consistent with their backstory
- Returns `CriticEvaluation { coherenceScore, isHallucinating, critique, suggestedFix }`

---

## 7. DATA ENTITIES

### `PricingAnalysis` — `src/domain/entities/PricingAnalysis.ts`

```typescript
interface PricingAnalysis {
  id: string;
  url: string;
  screenshotBase64: string;
  thoughts: string;                    // 2-paragraph narrative
  scores: {                           // 6 dimensions, each 1-10 + reason
    clarity, valuePerception, trust,
    explorationIntent, analysisIntent, buyIntent
  };
  risks: string[];                    // max 3
  recommendations: string[];          // 2-3 specific items
  aiSuggestion: string;               // persona-specific actionable insight
  gazePoints?: GazePoint[];
  gutReaction?: string;
  rawAnalysis?: string;               // accumulated streaming thoughts
}
```

**Validation** (`validatePricingAnalysis()`, line 59):
- Checks all required fields exist with correct types
- URL validation (must be valid URL or "Manual Upload")
- Score ranges: 1-10, finite
- All string arrays non-empty where required

### `PricingLocation` — `src/domain/ports/LlmServicePort.ts`

```typescript
interface PricingLocation {
  found: boolean;
  selector?: string;     // CSS selector for pricing section
  anchorText?: string;   // text anchor near pricing
  reasoning?: string;    // LLM's reasoning
}
```

### Progress types — `ParsePricingPageUseCase.ts`

```typescript
type ProgressStep = 'STARTING' | 'OPENING_PAGE' | 'FINDING_PRICING' | 'THINKING';

interface Progress {
  step: ProgressStep;
  screenshot?: string;
  personaName?: string;
  completedCount?: number;
  totalCount?: number;
  analysisToken?: string;  // streamed thought tokens
}
```

---

## 8. LOGGING INFRASTRUCTURE (NEW)

| Location | `src/infrastructure/AnalysisLogger.ts` |
|----------|--------------------------------------|

### Architecture

- **Singleton per run**: `AnalysisLogger.forRun(runId)` — creates/retrieves a logger instance
- **Per-run log files**: `{project}/logs/analysis/analysis-{runId}-{timestamp}.log`
- **JSONL format**: One JSON object per line with `timestamp`, `level`, `module`, `message`, `data`

### Key Methods

| Method | Description |
|---|---|
| `init()` | Creates log directory + opens file handle |
| `log(level, module, message, data?)` | Core method — console.log + file write |
| `trace/debug/info/warn/error()` | Convenience wrappers |
| `recordPersonaLatency(name, ms)` | Track per-persona timing |
| `logPersonaSummary()` | Output aggregated latency report |
| `flush()` | Write buffered entries to disk |
| `close()` | Final flush + close file handle |

### Files instrumented with tracing:

| File | Key trace points |
|---|---|
| `analyzePricingPage.ts` | Action entry/exit, rate limit, deps instantiation, progress callbacks, analysis summaries |
| `ParsePricingPageUseCase.ts` | Every scouting step, navigation timing, HTML analysis, persona analysis lifecycle, chunk progress, validation results, latency per persona |
| `VisionAnalysisAdapter.ts` | RAG retrieval, prompt compilation, streamObject call, completion results, isPricingVisible calls |
| `HtmlSummarizer.ts` | Input/output sizes, LLM call duration |
| `LlmServiceImpl.ts` | Every LLM request with request ID, model, duration, response sizes, reasoning tokens |
| `PersonaPromptCompiler.ts` | Prompt length, sections count |
| `IdRagService.ts` | Query, chunk count, scores, retrieved topics |
| `RemotePlaywrightAdapter.ts` | Scroll operations, viewport capture timing, HTML extraction |
| `useAnalysisFlow.ts` | Stream lifecycle, step transitions, analysis result summaries |
| `OpenRouterCriticAdapter.ts` | API call duration, result scores |
| `report/route.ts` | Request/response, validation, execution timing |

### To find log files after a run:

```bash
ls -la logs/analysis/
# Each file: analysis-{requestId}-{timestamp}.log
```
