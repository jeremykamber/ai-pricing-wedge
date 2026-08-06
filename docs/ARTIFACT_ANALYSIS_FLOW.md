# Artifact Analysis Pipeline

## What It Does

Takes any artifact (URL, screenshot) + personas + a business goal and research question → produces a structured report of how simulated target customers experienced the artifact through five cognitive stages.

---

## End-to-End Flow

```
User Input
├── Artifact (URL or screenshot)
├── Persona batch (generated from audience description)
├── Business Goal (what the artifact tries to accomplish)
└── Research Question (what the user wants to learn)

    ↓

1. ARTIFACT INTAKE
   └── Captures the artifact as ArtifactContext
       ├── URL → BrowserServicePort navigates, takes screenshot, summarizes HTML
       └── Screenshot → Direct pass-through

    ↓

2. PERSONA ANALYSIS (concurrent, max 5 at a time)
   └── For each persona:
       ├── Stage 1: generateCognitiveStream()
       │   └── LLM (vision model) sees screenshot + persona identity
       │   └── Persona thinks aloud through all 5 cognitive stages
       │
       └── Stage 2 (parallel):
           ├── formatPersonaResponse()
           │   └── LLM (text model) extracts structured PersonaResponse from stream
           └── deriveResponseSignals()
               └── LLM extracts highest stage reached + final action

    ↓

3. SYNTHESIS (LLM calls across all responses)
   ├── Phase 1a: generateTopFindings()
   │   └── LLM identifies 3-5 cross-persona patterns
   ├── Phase 1b: generateDisagreements()
   │   └── LLM finds where personas had opposing reactions
   ├── Phase 1c: generateFrictions()
   │   └── LLM lists 2-3 friction points affecting multiple personas
   └── Phase 2: generateSynthesisOverview()
       └── LLM produces overview + research question answer
       └── Informed by findings, disagreements, and frictions from Phase 1

    ↓

4. OUTPUT
   ├── Executive Synthesis (first, always visible)
   │   ├── Completed/failed persona counts
   │   ├── Research Question Answer
   │   ├── Top Findings (with observed X/Y counts)
   │   ├── Disagreements (where personas split)
   │   └── Biggest Friction Points
   └── Individual Persona Reports (collapsible drill-down)
       ├── Overview
       ├── Customer Journey (5 stages)
       ├── Research Question Answer
       ├── Findings
       ├── Friction Points
       └── Unanswered Questions
```

---

## File Map

### Domain Entities (`src/domain/entities/`)

| File | Purpose |
|------|---------|
| `PersonaResponse.ts` | One persona's complete output — journey, findings, friction, questions |
| `CognitiveStage.ts` | The 5-stage enum + labels + question text |
| `StageJourney.ts` | One stage's result: description, sentiment, outcome, transition |
| `MajorFinding.ts` | Per-persona finding: observation, evidence, impact (no confidence — derived at synthesis) |
| `ArtifactIntake.ts` | Normalized artifact input: screenshot, HTML, summary |
| `ArtifactAnalysis.ts` | Container entity for a run (was Simulation) |
| `ArtifactSynthesis.ts` | Cross-persona synthesis: top findings, disagreements, frictions |
| `GazePoint.ts` | Visual attention prediction (legacy) |
| `PricingAnalysis.ts` | @deprecated Legacy pricing-specific entity |

### Ports (`src/domain/ports/`)

| File | Key Methods |
|------|-------------|
| `LlmServicePort.ts` | `generateCognitiveStream`, `formatPersonaResponse`, `deriveResponseSignals`, `generateTopFindings`, `generateDisagreements`, `generateFrictions`, `generateSynthesisOverview` |
| `BrowserServicePort.ts` | `navigateTo`, `captureViewport`, `getCleanedHtml`, `close` |

### Use Cases (`src/application/usecases/`)

| File | Purpose |
|------|---------|
| `AnalyzeArtifactUseCase.ts` | Orchestrates intake → persona analysis → response assembly |

### Actions (`src/actions/`)

| File | Purpose |
|------|---------|
| `analyzeArtifactAction.ts` | Server action: instantiates deps, calls use case, runs synthesis, streams progress + DONE event |
| `getProgress.ts` | Side-channel progress store for VPS polling |
| `getSimulationResult.ts` | Polls completed results after reconnect |

### Adapters (`src/infrastructure/adapters/`)

| File | Purpose |
|------|---------|
| `ArtifactIntakeAdapter.ts` | Strategy-based intake: URL → browser, screenshot → pass-through |
| `VisionAnalysisAdapter.ts` | All LLM prompts: cognitive stream, formatter, signal derive, synthesis |
| `PersonaPromptCompiler.ts` | Builds the 4-compartment persona identity prompt |
| `IdRagStore.ts` / `IdRagService.ts` | Backstory chunking + retrieval for persona context |
| `HtmlSummarizer.ts` | LLM-based HTML → markdown compaction |
| `RemotePlaywrightAdapter.ts` | Browser automation via Playwright WebSocket |
| `LlmServiceImpl.ts` | Delegates all LlmServicePort methods to above adapters |

### UI (`src/app/(app)/dashboard/simulations/`)

| File | Purpose |
|------|---------|
| `page.tsx` | Simulations list + New Analysis form (Business Goal + Research Question inputs) |
| `[id]/page.tsx` | Detail page: InProgressView + CompletedView with synthesis + per-persona reports |

### Hook (`src/ui/hooks/`)

| File | Purpose |
|------|---------|
| `useAnalysisFlow.ts` | Manages state, calls action, handles streaming DONE/ERROR/CANCELLED, captures synthesis |

### Store (`src/ui/stores/`)

| File | Purpose |
|------|---------|
| `simulationStore.ts` | Zustand + IndexedDB persistence for analyses (version 2, wipes old data) |

### Utility

| File | Purpose |
|------|---------|
| `src/ui/dashboard/utils/computeSynthesis.ts` | Fallback synthesis when LLM call fails — groups findings by word overlap |

### VPS (`src/app/api/vps/`)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/vps/analyze` | Fire-and-forget: returns runId immediately |
| `GET /api/vps/analyze-progress?runId=` | Poll progress during analysis |
| `GET /api/vps/analyze-result?runId=` | Poll final results after completion |
| `GET /api/vps/analyze-screenshot?runId=` | Poll live screenshot during intake |

---

## The Five Cognitive Stages

Every persona progresses through the same five stages in order. Each stage answers a specific cognitive question — not a browsing question.

| # | Stage | Core Question |
|---|-------|--------------|
| 1 | interpretation | What did I initially believe this was? |
| 2 | understanding | What became clear? What remained confusing? |
| 3 | belief | Which claims, signals, or details increased or decreased trust? |
| 4 | motivation | Did this become valuable enough for me to continue? Why or why not? |
| 5 | action | What exact next step would I take? |

Each stage has:
- `description` — what the persona thought/felt at this stage (NOT what they saw)
- `sentiment` — positive, neutral, or negative
- `outcome` — succeeded (passed through), blocked (couldn't progress), or stopped (abandoned)
- `transition` — what caused progression to the next stage (optional)

Invariant: every `PersonaResponse` has exactly 5 stages, in order. The validator (`validatePersonaResponse`) enforces this.

---

## Synthesis Pipeline

Synthesis is split into focused LLM calls to improve quality:

```
Phase 1 (runs in parallel):
├── generateTopFindings     — identifies 3-5 cross-persona patterns
├── generateDisagreements   — where personas had opposing reactions
└── generateFrictions       — friction points affecting multiple personas

Phase 2 (runs after Phase 1 completes):
└── generateSynthesisOverview — produces overview + research answer
    └── Informed by Phase 1 results
```

### Confidence Derivation

Confidence is **never generated by the LLM**. It is computed from agreement:

```
ratio = affectedPersonaCount / totalPersonaCount
ratio >= 0.6 → High
ratio >= 0.3 → Medium
else         → Low
```

`affectedPersonaCount` is computed by matching each finding's observation text against each persona's `majorFindings` using substring overlap.

### Prompt Rules

Every synthesis prompt enforces:
1. No individual persona names — use "Most personas", "Several personas"
2. No recommendations — describe what was observed, not what to do
3. No trait causality — persona attributes may contextualize but not explain behavior
4. No confidence assignment — computed externally from agreement

---

## Key Invariants

- `PersonaResponse` is one persona's output, never aggregate
- `ArtifactAnalysis` is the container for a run, never per-persona
- All prompts are artifact-agnostic — no mention of pricing, conversion, or page type
- Stage order is enforced by `validatePersonaResponse` (5 stages, in `COGNITIVE_STAGES` order)
- Failed personas get 5 placeholder stages (all `stopped`) so they pass validation
- Confidence is derived from observed agreement, never generated by the LLM
- Intake strategies are decoupled from analysis pipeline (new artifact types = new strategies)
- Old IndexedDB data is wiped on schema version change

---

## Extending

### Adding a new artifact type (e.g., PDF)

1. Create a strategy in `ArtifactIntakeAdapter` — it just needs to return `ArtifactContext` (screenshot + optional text)
2. No changes needed in the analysis pipeline

### Adding a new cognitive stage

1. Add it to `CognitiveStage.ts` (`COGNITIVE_STAGES` array)
2. Update all prompts in `VisionAnalysisAdapter.ts`
3. Update `validatePersonaResponse()` expected length
4. Update UI rendering in `simulations/[id]/page.tsx`

### Adding a new finding type

1. Add to `MajorFinding.ts` (per-persona) or `ArtifactSynthesis.ts` (cross-persona)
2. Add it to the relevant prompt
3. Add it to the schema if used with `streamObject`

---

## Deployment

The VPS runs two PM2 processes:
- `kynd-backend-engine` — Next.js standalone on port 8080
- `kynd-browser-server` — Playwright browser server on port 8081

Build and deploy:
```bash
git pull origin main
npm run build
npx pm2 restart kynd-backend-engine
```

If Playwright version changes, run `npx playwright install` after the build.

See `docs/VPS_DEPLOYMENT.md` for full deployment details.
