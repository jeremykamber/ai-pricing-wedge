# System Call Traces: Three Use Cases

> Trace of every function, class, and entity invoked for each major flow.
> Architecture: Hexagonal — UI → Actions → Use Cases → Domain → Infrastructure.

---

## Use Case A: Interview Upload → Persona Cohort → Variants

**Goal:** Upload interview transcripts → extract behavioral signals → pool across transcripts → sample coherent personas → generate full profiles → optionally create trait-adjusted variants.

### A1: Interview → Persona Cohort (Pipeline)

```
InterviewUploadClient.tsx
  └─ useInterviewPipeline()
      ├─ Read files (.txt) via FileReader
      ├─ handleSubmit() → FormData → generatePersonasFromInterviewsAction(formData)
      │
      └─ Server Action (generatePersonasFromInterviews.ts)
          ├─ Rate limiter check (rate-limiter-flexible, IP-keyed, 5 req/min)
          ├─ LlmServiceImpl.createFromEnv("openrouter") — text, extraction, vision, scout model map
          ├─ IdRagStore — in-memory chunk store for backstory + interview chunks
          ├─ GeneratePersonasUseCase(llmService) — reusable persona generator
          ├─ GeneratePersonasFromInterviewsUseCase(llmService, idRagStore, generatePersonasUseCase)
          │
          └─ execute(transcripts[], onProgress) — 6-phase pipeline:
              │
              ├── Phase 1: EXTRACT
              │   └─ llmService.extractInterviewSignals(content, interviewId)
              │       └─ InterviewSignalExtractor.extract() → ExtractedInterviewSignals
              │           Fields: painPoints[], goals[], values[], featureDesires[],
              │                   decisionPatterns[], context{role,industry}, communicationStyle
              │
              ├── Phase 2: POOL
              │   └─ poolSignals(extractions[], threshold=0.7)
              │       ├─ Trigram n-gram fingerprinting (ngramFingerprint/text)
              │       ├─ Cosine similarity clustering (clusterSignals) — merges similar signals
              │       └─ Weighted frequency → PooledDistributionSummary (weight={freq/total})
              │
              ├── Phase 3: SAMPLE
              │   └─ samplePersonas(distribution, targetCount, validateCoherence)
              │       ├─ Weighted random draw per category (weightedDraw — Fisher-Yates without replacement):
              │       │   painPoints=2-4, goals=1-3, values=2-4, featureDesires=1-3, decisionPattern=1
              │       │   role=1, industry=1, communicationStyle=1
              │       ├─ LLM coherence validation via buildCoherenceValidationPrompt → JSON response
              │       └─ Resample contradictory ones (up to 3 retries) → SampledPersonaSignal[]
              │
              ├── Phase 4: FORMAT
              │   └─ formatPersonaDescription(signal) → structured text per SampledPersonaSignal
              │
              ├── Phase 5: GENERATE
              │   └─ GeneratePersonasUseCase.execute(combinedDescription, _, targetCount)
              │       ├── Phase 5a: llmService.generateInitialPersonas(description, count)
              │       │   └─ PersonaAdapter.generateInitialPersonas()
              │       │       ├─ LLM call: generate JSON array matching Persona interface
              │       │       ├─ Name override: seeded shuffle of GENDERLESS_NAMES (FNV-1a hash + Mulberry32)
              │       │       └─ Returns Persona[] with Big Five, psychographics, pricing calibration, domainExpertise
              │       │
              │       ├── Phase 5b: Generate abridged backstories (BATCH)
              │       │   └─ PersonaAdapter.generateAbbreviatedBackstoriesBatch(personas)
              │       │       └─ Single LLM call → JSON array of 3-5 paragraph first-person narratives
              │       │
              │       ├── Phase 5c: PB&J Rationalization
              │       │   └─ LlmServiceImpl.rationalizePersonas() → PsychographicRationalizer
              │       │       └─ LLM generates causal Big Five → psychographics rationale, appends to backstory
              │       │
              │       └── Phase 5d: AI Insights (BATCH)
              │           └─ PersonaAdapter.generatePersonaInsightsBatch(personas)
              │               └─ Single LLM call → JSON array of 2-sentence behavioral insights
              │
              └── Phase 6: INGEST
                  └─ idRagStore.ingestChunks(personaId, allChunks)
                      ├─ chunkBackstory() — split paragraphs, detect tone, tag topic, link related
                      └─ chunkInterviewSignals() — each signal item → one Chunk + summary chunk per interview
```

### A2: Persona Variants (from existing persona)

```
SimilarPersonaDialog.tsx (or generateSimilarPersonasAction)
  └─ generateSimilarPersonasAction(referencePersona, adjustments, count)
      ├─ LlmServiceImpl.createFromEnv("openrouter")
      ├─ llmService.generateVariationPersonas(referencePersona, {bigFive, variationLevel}, count)
      │   └─ PersonaAdapter.generateVariationPersonas()
      │       ├─ Receives reference Persona, adjusted Big Five targets (exact scalars)
      │       ├─ variationLevel (0-100) controls creative freedom:
      │       │   0-30: keep occupation/domain similar, new psychographics + backstory
      │       │   31-70: moderate life-context changes
      │       │   71-100: full creative freedom, only Big Five fixed
      │       ├─ LLM temp scales: 0.7 + (variationLevel/100)*0.2
      │       └─ Returns Persona[] — each with fresh backstory, aiInsight, psychographics
      │
      └─ Streams progress via createStreamableValue → usePersonaFlow reads stream
```

### Key Entities

| Entity | File | Role |
|--------|------|------|
| `Persona` | `domain/entities/Persona.ts` | Full persona with Big Five, psychographics, pricing calibration, backstory |
| `ExtractedInterviewSignals` | `interviewPipeline/types.ts` | Raw signals from one transcript |
| `PooledDistributionSummary` | `interviewPipeline/types.ts` | Weighted distribution across all transcripts |
| `SampledPersonaSignal` | `interviewPipeline/types.ts` | Sampled bundle of signals for one persona |
| `Chunk` | `IdRagStore.ts` | A chunked memory unit (backstory or interview signal) |

### Key Stores

| Store | Location | Type | Purpose |
|-------|----------|------|---------|
| `IdRagStore` | `IdRagStore.ts` | In-memory Map<personaId, Chunk[]> | N-gram cosine-similarity retrieval for backstory + interview chunks |
| `personaStore` (Zustand) | `ui/stores/personaStore.ts` | localStorage-persisted | PersonaBatch[] with metadata (source, createdAt) |

---

## Use Case B: User Chats with Persona

**Goal:** User sends a message to a specific persona (optionally grounded in a pricing analysis they just performed).

### Flow

```
PersonaChat.tsx / PersonaChatInline.tsx
  └─ chatWithPersonaAction(persona, analysis|null, message, history)
      │
      ├─ Server Action (chatWithPersona.ts)
      │   ├─ LlmServiceImpl.createFromEnv("openrouter")
      │   ├─ ChatWithPersonaUseCase(llmService)
      │   │   └─ execute(persona, analysis, message, history)
      │   │       └─ llmService.chatWithPersona(persona, analysis, message, history)
      │   │           └─ LlmServiceImpl.chatWithPersona() — wraps stream, collects full text
      │   │
      │   └─ useCase.executeStream(persona, analysis, message, history)
      │       └─ llmService.chatWithPersonaStream()
      │           └─ ChatAdapter.chatWithPersonaStream()
      │
      └── ChatAdapter (infrastructure/adapters/ChatAdapter.ts)
          ├─ On first interaction: IdRagStore.ingestPersona(persona) → chunks backstory
          ├─ Turn tracking: every 4th turn → re-grounding instruction injected
          ├─ IdRagService.retrieveContext(persona, message, k=3)
          │   └─ IdRagStore.retrieve(personaId, query, k=3)
          │       └─ ngramFingerprint + cosineSimilarity → top-k Chunks
          │
          ├─ Compartmentalized system prompt (PersonaPromptCompiler):
          │   ├─ <<PERSONA IDENTITY>> — demographics + backstory
          │   ├─ <<PSYCHOGRAPHIC PROFILE>> — Big Five with behavioral rules, values, fears
          │   ├─ Role-specific bias (CEO vs Engineer vs PM)
          │   ├─ <<EPISTEMIC BOUNDARIES>> — what persona does/doesn't know
          │   ├─ <<BEHAVIORAL GUARDRAILS>> — response constraints + refusal patterns
          │   └─ <<RETRIEVED MEMORY>> — RAG chunks from backstory
          │
          ├─ Persona anchor via detectArchetype(persona):
          │   cautious-manager | analytical-expert | enthusiastic-hobbyist | passionate-founder | skeptical-veteran | default
          │
          ├─ If analysis present: inject structured scores + raw thoughts as context
          │
          └─ Stream: createChatCompletionStream() → AsyncIterable<string> → stream.update() → client renders
```

### Key Entities

| Entity | File | Role |
|--------|------|------|
| `ChatWithPersonaUseCase` | `application/usecases/ChatWithPersonaUseCase.ts` | Thin orchestrator, delegates to LlmServicePort |
| `ChatAdapter` | `infrastructure/adapters/ChatAdapter.ts` | Provenance: prompt compilation, ID-RAG retrieval, re-grounding, streaming |
| `PersonaPromptCompiler` | `infrastructure/adapters/PersonaPromptCompiler.ts` | 4-section compartmentalized prompt builder |

---

## Use Case C: Pricing Page Analysis → Report → View

**Goal:** User provides URL (+ optional personas) → browser scouts page → each persona evaluates → report with scores, gaze, risks, recommendations.

### Flow

```
SetupView.tsx (URL input + "Run Analysis")
  └─ useAnalysisFlow()
      ├─ handleAnalyzePricing(personas) → analyzePricingPageAction(url, personas, simId)
      │
      ├─ Server Action (analyzePricingPage.ts)
      │   ├─ Rate limiter (5 req/min per IP)
      │   ├─ AnalysisLogger.forRun(id) — JSONL-per-run logging to logs/analysis/
      │   ├─ cancellationManager.createRequest(id) — AbortController for cancellations
      │   ├─ RemotePlaywrightAdapter.createFromEnv() — Playwright-on-VPS via WS endpoint
      │   ├─ LlmServiceImpl.createFromEnv("openrouter") — vision + text + scout models
      │   └─ ParsePricingPageUseCase(browser, llmService)
      │
      └─ ParsePricingPageUseCase.execute(url, personas, onProgress, abortSignal, options)
          │
          ├── Phase 1: SCOUTING (adaptive pricing location)
          │   ├─ If imageBase64 provided: skip scouting, use as-is
          │   │
          │   ├─ Else: RemotePlaywrightAdapter.navigateTo(url)
          │   │   ├─ Connect to remote Chromium (PLAYWRIGHT_WS_ENDPOINT)
          │   │   ├─ Context with realistic UA, locale, headers
          │   │   ├─ 500ms live screenshot interval during navigation (onLiveScreenshot callback)
          │   │   └─ page.goto() + waitForDOMStability()
          │   │
          │   ├─ captureViewport() → initial screenshot
          │   ├─ getCleanedHtml() → in-browser JS: remove hidden/script/style, keep meaningful tags
          │   │
          │   ├─ Parallel analysis:
          │   │   ├─ isPricingVisibleInHtml(html) — LLM on small text model → {found, selector, anchorText}
          │   │   └─ summarizeHtml(html) — LLM extracts pricing tiers, features, fine print
          │   │
          │   ├─ STRATEGY A: GUIDED STRIKE (if HTML locator found)
          │   │   ├─ getElementLocation(selector, anchorText) → target Y-coordinate
          │   │   ├─ Buffer jump: scrollTo(Y - 1000) + 2× scrollDown(500) + CENTER_OFFSET(160)
          │   │   ├─ isPricingVisible(viewport) for vision verification (Qwen VL scout model)
          │   │   └─ Skip vision verify on high-confidence selectors (#id, "pricing" in text)
          │   │
          │   ├─ STRATEGY B: LINEAR SCAN (fallback)
          │   │   ├─ scrollTo(0) → repeat up to 8×: captureViewport → isPricingVisible → scrollDown(800)
          │   │   └─ Final CENTER_OFFSET(160) when found
          │   │
          │   └─ browserService.close()
          │
          └── Phase 2: PERSONA ANALYSIS (parallel, concurrency=5)
              ├─ p-limit(5) — throttle to 5 concurrent persona evaluations
              │
              └─ Per persona:
                  ├─ VisionAnalysisAdapter.analyzePricingPageCompletion(persona, screenshot, html, {tokenLimit})
                  │   ├─ IdRagService.retrieveContext() — top-3 backstory chunks via n-gram cosine
                  │   ├─ PersonaPromptCompiler.compileSystemPrompt() — 4-section compartmented prompt
                  │   ├─ streamObject() with PricingAnalysisSchema (zod-guided JSON):
                  │   │   schema: { gutReaction, thoughts[The Good|Bad|Dealbreaker], scores{clarity,
                  │   │   valuePerception, trust, explorationIntent, analysisIntent, buyIntent + reasons},
                  │   │   risks≤3, recommendations 2-3, aiSuggestion }
                  │   ├─ UI constraints: thoughts ≤ 75% of tokenLimit, intent funnel (explore ≥ analysis ≥ buy)
                  │   ├─ 180s timeout per analysis
                  │   └─ Returns full PricingAnalysis object, enriched with personaProfile metadata
                  │
                  └─ On error → graceful degradation with default scores, "[SYSTEM]" risk tag
              │
              └─ Results merged → PricingAnalysis[] returned to action

          ├── Post-execution: analysisResultStore.save(id, analyses) — survives page reloads
          ├── storeCompleted(id) — flags progress store for polling clients
          └── stream.done({step: "DONE", analyses}) — RSC stream terminal event
      │
      ├── Client reads stream via readStreamableValue():
      │   ├─ STARTING → OPENING_PAGE → FINDING_PRICING → THINKING → DONE|ERROR|CANCELLED
      │   ├─ Screenshot polling via getScreenshotAction (2s interval) — bypasses RSC size limits
      │   ├─ Fallback: if stream drops, poll getAnalysisResultAction every 1s × 300 attempts
      │   └─ useAnalysisStore.addAnalysis() → updateAnalysis() → markComplete()
      │
      └── ResultsView.tsx / analyses/[id]/page.tsx
          └─ Renders: persona-by-persona comparison, scores radar, risk lists, recommendations,
             gaze heatmap (gazePoints via predictGazeAction → GazePredictionAdapter),
             validation via validateAnalysisAction → OpenRouterCriticAdapter.evaluateConsistency()
              → CriticEvaluation {coherenceScore, isHallucinating, critique, suggestedFix}
```

### Key Entities

| Entity | File | Role |
|--------|------|------|
| `PricingAnalysis` | `domain/entities/PricingAnalysis.ts` | 6-dimension scores + rationales, risks, recommendations, gazePoints, gutReaction |
| `ArtifactAnalysis` | `domain/entities/ArtifactAnalysis.ts` | Aggregate root tracking status, progress, analyses |
| `InteractionStep` | `domain/entities/InteractionStep.ts` | Single browser interaction (url, action, thought) |
| `CriticEvaluation` | `domain/entities/CriticEvaluation.ts` | Coherence/alignment verdict from expert LLM judge |
| `PersonaProfile` | `domain/entities/PersonaProfile.ts` | Presentation-layer snapshot of persona for report context |

### Key Adapters

| Adapter | File | Role |
|---------|------|------|
| `RemotePlaywrightAdapter` | `RunRemotePlaywrightAdapter.ts` | Remote Chromium via WS: scouting, scroll, element location, screenshot |
| `VisionAnalysisAdapter` | `VisionAnalysisAdapter.ts` | Pricing analysis per persona: ID-RAG + compartmented prompt + streamObject |
| `HtmlSummarizer` | `HtmlSummarizer.ts` | LLM compresses full HTML to feature/pricing/fine-print Markdown summary |
| `InCharacterEvaluator` | `InCharacterEvaluator.ts` | 10-question psychometric interview → Big Five trait scoring (Wang et al. 2024a) |
| `PiconEvaluator` | `PiconEvaluator.ts` | Multi-turn interrogation for internal/external/retest consistency (Kim et al. 2026) |
| `OpenRouterCriticAdapter` | `OpenRouterCriticAdapter.ts` | Expert LLM evaluates if analysis is aligned to persona backstory |
| `GazePredictionAdapter` | `GazePredictionAdapter.ts` | Predicts gaze points (x, y, focusLabel) on pricing screenshot per persona |

### Key Infrastructure

| Component | File | Role |
|-----------|------|------|
| `AnalysisLogger` | `AnalysisLogger.ts` | Per-run JSONL logging (auto-flush @ 100KB, persona latency tracking) |
| `AnalysisResultStore` | `AnalysisResultStore.ts` | In-memory cache on globalThis (survives HMR, 30-min TTL cleanup) |
| `RequestCancellationManager` | `RequestCancellationManager.ts` | Maps runId → AbortController, cancels mid-flight LLM calls |
| `ProgressStore` (/poll) | `getProgress.ts` | Side-channel progress state on globalThis for reconnection polling |

### Key Domain Ports

| Port | File | Exposes |
|------|------|---------|
| `LlmServicePort` | `domain/ports/LlmServicePort.ts` | 22 methods: persona gen, analysis, chat, signal extraction, variation, rationalization, streaming |
| `BrowserServicePort` | `domain/ports/BrowserServicePort.ts` | `captureScreenshot`, `navigateTo`, `scrollDown/To`, `getElementLocation`, `getCleanedHtml` |
| `ICriticServicePort` | `domain/ports/ICriticServicePort.ts` | `evaluateConsistency(persona, analysis) → CriticEvaluation` |
| `IChatServicePort` | `domain/ports/IChatServicePort.ts` | `getPersonaResponse(persona, message, context) → string` |
| `IDebateServicePort` | `domain/ports/IDebateServicePort.ts` | `executeDebate(proposal, participants, rounds) → AsyncIterable<DebateStreamEvent>` |
