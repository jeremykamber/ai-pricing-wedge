# Pricing Page Analysis — 4-issue Fix Bundle

## TL;DR

> **Quick Summary**: Fix 4 issues with the pricing page analysis generation: persona-to-output mapping ("p1 bug"), flat scores → comparative benchmarking + executive dashboard, LLM echo chamber in persona critiques, and text walls → scannable structured sub-sections.
>
> **Deliverables**:
> - Enriched `PricingAnalysis` entity carrying persona identity + Big Five snapshot
> - Fixed analysis ID format (real names, not "p1")
> - Executive summary dashboard table at top of report
> - Comparative benchmark deltas on scores
> - Stronger personality-divergent prompts for LLM critiques
> - Structured sub-sections (The Good / The Bad / The Dealbreaker) via prompt markers
> - Production-grade console.log tracing throughout the generation flow
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Domain Entity Changes → Prompt Divergence → UI Rework → Final Verification

---

## Context

### Original Request
The user identified 4 specific issues with the pricing page analysis generation feature:
1. Placeholder IDs (`p1`, `p3`) appearing instead of real persona names; Big Five traits invisible
2. Flat scores (`clarity: 7/10`) lack comparative context; no aggregate overview
3. All 11 personas converge on the same 2-3 critiques (echo chamber)
4. Text blocks are walls of prose — need structured sub-sections

### Interview Summary
**Key Decisions**:
- **Benchmarking**: Built-in SaaS baseline (run average) — compute deltas at render time
- **Executive summary**: UI-only — computed from analyses array in CompletedView
- **Structured sub-sections**: Prompt-level markers — add `[The Good]` / `[The Bad]` / `[The Dealbreaker]` markers to the system prompt, parse in UI
- **Persona count**: 8-11 (large sets via variation system)
- **Persistence**: Acceptable to enrich PricingAnalysis with personaProfile data

### Metis Review
**Identified Gaps** (addressed):
- Old localStorage backward compat: CompletedView must fallback to "Persona N" when `personaProfile` is missing
- Persona name slugification: Use `persona.name.replace(/[\s-]+/g, '_')` in analysis IDs
- Fix 4 extraction algorithm: Prompt-level markers, not heuristic NLP
- 1-persona edge case: Hide benchmark deltas when count ≤ 2
- Divergence metric: Target ≥7/11 unique primary frictions

---

## Work Objectives

### Core Objective
Fix 4 issues in the pricing page analysis generation to produce trustworthy, scannable, differentiated persona critiques with visible Big Five alignment and comparative context.

### Concrete Deliverables
- `src/domain/entities/PersonaProfile.ts` — New interface for persona identity snapshot
- `src/domain/entities/PricingAnalysis.ts` — Add optional `personaProfile` field
- `src/application/usecases/ParsePricingPageUseCase.ts` — Enrich analyses with personaProfile, fix ID format
- `src/infrastructure/adapters/VisionAnalysisAdapter.ts` — Strengthened divergence language + structured markers
- `src/infrastructure/adapters/PersonaPromptCompiler.ts` — Role-specific Big Five bias injection
- `src/app/(app)/dashboard/simulations/[id]/page.tsx` — Executive summary table, persona identity display, comparative scores, structured sub-sections
- `src/ui/dashboard/components/views/ResultsView.tsx` — Fix mapping, Big Five display
- Console.log tracing at 4 defined points

### Definition of Done
- [ ] Analysis card headers show real persona names, not "p1"
- [ ] Big Five traits visible in each analysis card
- [ ] Executive summary table renders at top of detail page with columns: Persona, Segment, Clarity, Trust, Buy Intent, Primary Friction
- [ ] Scores show comparative deltas: "5/10 (+1.5 vs Run Avg)"
- [ ] Structured sub-sections render: The Good / The Bad / The Dealbreaker
- [ ] At least 7/11 personas have unique primary frictions (risks[0])
- [ ] Old localStorage data renders without crash (fallback: "Persona N")
- [ ] `[TRACE]` logs at 4 defined checkpoints
- [ ] All existing tests pass (`bun test`)

### Must Have
- Fix the analysis ID to carry real persona name
- Add `PersonaProfile` interface and enrich analyses
- Fix CompletedView rendering to use `personaProfile.name`
- Executive summary table computed from analyses array
- Benchmark deltas on each score
- Stronger prompt divergence (Big Five + role-specific)
- Structured sub-sections via prompt markers
- Old-data fallback in CompletedView
- console.log tracing at prompt construction, analysis completion, score computation, and divergence computation
- All existing tests pass

### Must NOT Have (Guardrails)
- ❌ No changes to `PricingAnalysisSchema` (Zod) for production fields
- ❌ No NLP/sentiment/charting library dependencies
- ❌ No changes to `PersonaAdapter` internal ID logic
- ❌ No changes to `src/data/genderless_names.ts`
- ❌ No migration script for old localStorage data
- ❌ No backend/store changes for benchmarks or exec summary
- ❌ No heuristic NLP for The Good/Bad extraction — must use prompt markers

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest + Playwright support)
- **Automated tests**: Tests-after (existing tests must pass; new unit tests for benchmark utility)
- **Framework**: Vitest
- **QA**: Playwright for UI verification + curl for API verification + bun test for unit tests

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Bash (curl) — POST to `/api/report`, assert JSON structure
- **UI**: Playwright — Navigate to simulation detail page, assert DOM
- **Library/Module**: Bun test — run unit tests
- **Logs**: Grep for `[TRACE]` patterns

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — entities, interfaces, data model):
├── Task 1: Create PersonaProfile interface + enrich PricingAnalysis
├── Task 2: Fix analysis ID construction in ParsePricingPageUseCase
├── Task 3: Add console.log tracing at 4 checkpoints
└── Task 4: Add benchmark utility (computeScoresWithBenchmarks)

Wave 2 (Prompt engineering — divergence + structured output):
├── Task 5: Strengthen prompt divergence in PersonaPromptCompiler
├── Task 6: Add structured markers + role bias in VisionAnalysisAdapter
└── Task 7: Log divergence computation

Wave 3 (UI rework — the big one):
├── Task 9: Fix CompletedView — persona identity + Big Five display
├── Task 10: Add executive summary table to CompletedView
├── Task 11: Add benchmark deltas to score display
├── Task 12: Add structured sub-sections (The Good / The Bad / The Dealbreaker)
└── Task 13: Fix ResultsView persona mapping + Big Five display

Wave 4 (E2E test + Final Verification):
├── Task 8: Playwright E2E test (blocked by all implementation tasks — runs last)
└── Task F1-F4: Final verification wave

Critical Path: Task 1 → Task 2 → Task 5 → Task 6 → Task 9 → Task 10 → F1-F4
Parallel Speedup: ~60% faster than sequential

> Note: Task 3 (console.log tracing) is independent and runs parallel with Wave 1.
> Task 8 (Playwright E2E test) is blocked by ALL implementation tasks (needs the full
> working system), so it's in Wave 4 as the final validation task before F1-F4.
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 4, 9, 13 |
| 2 | 1 | 9, 13 |
| 3 | — | (independent) |
| 4 | 1 | 10, 11 |
| 5 | — | 6 |
| 6 | 5 | 12 |
| 7 | 6 | — (independent dep) |
| 8 | 1, 2, 4, 9, 10, 11, 12, 13 | F1-F4 |
| 9 | 1, 2 | 10, 11, 12, 8 |
| 10 | 4, 9 | 8 |
| 11 | 4, 9 | 8 |
| 12 | 6, 9 | 8 |
| 13 | 1, 2 | 8 |
| F1-F4 | 3, 7, 8 | Final |

### Agent Dispatch Summary

- **Wave 1**: Tasks 1-4 → `deep` (entity), `unspecified-high` (logic), `unspecified-low` (tracing)
- **Wave 2**: Tasks 5-7 → `deep` (prompt engineering), `unspecified-low` (logging)
- **Wave 3**: Tasks 9-13 → `visual-engineering` (UI), `unspecified-high` (logic)
- **Wave 4**: Task 8 → `unspecified-high` (E2E test)
- **FINAL**: 4 agents in parallel

---

## TODOs

- [x] 1. Create PersonaProfile interface + enrich PricingAnalysis entity

  **What to do**:
  - Create `src/domain/entities/PersonaProfile.ts` with interface:
    ```typescript
    export interface PersonaProfile {
      name: string;
      occupation: string;
      bigFive: {
        conscientiousness: number;
        neuroticism: number;
        openness: number;
        extraversion: number;
        agreeableness: number;
      };
      values: string[];
      fears: string[];
      communicationStyle: string;
      pricingSensitivity: number;
      typicalBudget: string;
    }
    ```
  - Add `personaProfile?: PersonaProfile` to `PricingAnalysis` interface in `src/domain/entities/PricingAnalysis.ts` (NOT to the Zod schema)
  - Add `personaId?: string` to `PricingAnalysis` for robust matching
  - In `ParsePricingPageUseCase.ts` around line 538, enrich the `fullAnalysis` object with `personaProfile` data from the `persona` parameter
  - The enrichment happens AFTER the LLM returns its structured analysis, so it's a presentation-only addition

  **Must NOT do**:
  - ❌ Do NOT add `personaProfile` to `PricingAnalysisSchema` (Zod) — this would break the LLM output contract
  - ❌ Do NOT modify the validate function for personaProfile — it's optional
  - ❌ Do NOT change PersonaAdapter's ID logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`
  - **Reason**: Needs careful entity boundary decisions — must not contaminate the Zod schema

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 4)
  - **Blocks**: 2, 8, 12
  - **Blocked By**: None (foundation)

  **References**:
  - `src/domain/entities/PricingAnalysis.ts:9-34` — Existing PricingAnalysis interface — add personaProfile here
  - `src/domain/entities/PricingAnalysis.ts:36-56` — PricingAnalysisSchema — DO NOT touch this
  - `src/application/usecases/ParsePricingPageUseCase.ts:538-544` — Where fullAnalysis is constructed — this is where to add personaProfile enrichment
  - `src/domain/entities/Persona.ts:21-61` — Persona interface — source of Big Five and psychographic fields

  **Acceptance Criteria**:
  - [ ] `PersonaProfile` interface exists in `src/domain/entities/PersonaProfile.ts` with all required fields
  - [ ] `PricingAnalysis` interface has optional `personaProfile` and `personaId`
  - [ ] `PricingAnalysisSchema` Zod schema is unchanged (verify with `grep`)
  - [ ] `validatePricingAnalysis` function still passes without personaProfile
  - [ ] `ParsePricingPageUseCase` enriches each analysis with personaProfile from the persona object

  **QA Scenarios**:
  ```
  Scenario: PersonaProfile enriches analysis correctly
    Tool: Bash (curl)
    Preconditions: App running on localhost:3000
    Steps:
      1. POST to /api/report with a valid persona (name="Casey", occupation="Engineer", bigFive={conscientiousness:80,...})
      2. Parse JSON response
      3. Assert analyses[0].personaProfile.name === "Casey"
      4. Assert analyses[0].personaProfile.bigFive.conscientiousness === 80
      5. Assert analyses[0].personaProfile.occupation === "Engineer"
    Expected Result: personaProfile object present in each analysis with correct fields
    Evidence: .sisyphus/evidence/task-1-persona-profile.json

  Scenario: PricingAnalysisSchema unchanged
    Tool: Bash (grep)
    Preconditions: File exists
    Steps:
      1. Run `grep -n "z.object" src/domain/entities/PricingAnalysis.ts`
      2. Verify PricingAnalysisSchema still has exactly the same fields (gutReaction, thoughts, scores, risks, recommendations, aiSuggestion)
    Expected Result: Schema has NO personaProfile field
    Evidence: .sisyphus/evidence/task-1-schema-check.txt
  ```

  **Commit**: YES
  - Message: `feat(pricing-analysis): add PersonaProfile interface and enrich analyses`
  - Files: `src/domain/entities/PersonaProfile.ts`, `src/domain/entities/PricingAnalysis.ts`, `src/application/usecases/ParsePricingPageUseCase.ts`
  - Pre-commit: `bun test`

---

- [x] 2. Fix analysis ID construction to carry real persona name

  **What to do**:
  - In `ParsePricingPageUseCase.ts` line 538, change:
    ```typescript
    id: `${persona.id}-${Date.now()}`
    // → id: `${persona.name.replace(/[\s-]+/g, '_')}-${Date.now()}`
    ```
  - Also fix line 556 (fallback analysis ID construction)
  - The `persona.name` is guaranteed to be a single-word name from `GENDERLESS_NAMES`, but use slugification as a safety net
  - This ensures `analysis.id` = `"Casey-1712345678900"` instead of `"p1-1712345678900"`
  - Update any code that parses `analysis.id` to be more robust

  **Must NOT do**:
  - ❌ Do NOT change PersonaAdapter — the internal persona.id is still needed for identity tracking
  - ❌ Do NOT remove the `persona.id` from anywhere — it's still valid for internal use

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Small but critical change spanning one file

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on Task 1)
  - **Blocks**: 8, 12
  - **Blocked By**: 1

  **References**:
  - `src/application/usecases/ParsePricingPageUseCase.ts:538` — Primary ID construction: `${persona.id}-${Date.now()}`
  - `src/application/usecases/ParsePricingPageUseCase.ts:556` — Fallback ID construction (same pattern)
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:207` — Where CompletedView parses the ID: `analysis.id.split('-')[0]` — will be fixed in Task 8
  - `src/data/genderless_names.ts` — All single-word names — confirms slugification is belt-and-suspenders

  **Acceptance Criteria**:
  - [ ] Analysis ID format: `"Casey-1712345678900"` (name + `-` + timestamp)
  - [ ] Names with spaces replaced with `_` (safety net)
  - [ ] Both the primary (line 538) and fallback (line 556) ID constructions use the new format
  - [ ] Old stored analyses still parse gracefully (will show "Unknown Persona" — handled in Task 8)

  **QA Scenarios**:
  ```
  Scenario: Analysis ID contains persona name
    Tool: Bash (curl)
    Preconditions: App running
    Steps:
      1. POST /api/report with persona name="Casey"
      2. Parse JSON: analyses[0].id
      3. Assert analyses[0].id.startsWith("Casey-")
    Expected Result: ID starts with slugified persona name
    Evidence: .sisyphus/evidence/task-2-analysis-id.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `fix(pricing-analysis): carry real persona name in analysis ID`
  - Files: `src/application/usecases/ParsePricingPageUseCase.ts`
  - Pre-commit: `bun test`

---

- [x] 3. Add console.log tracing at 4 checkpoints

  **What to do**:
  Add `console.log([TRACE] [...])` statements at these 4 specific points:
  1. **Prompt construction** — in `PersonaPromptCompiler.compileSystemPrompt()` — after compiling all 4 sections, log the total prompt length and Big Five values for the persona
  2. **Analysis completion** — in `VisionAnalysisAdapter.analyzePricingPageStream()` — after the stream resolves, log the full analysis object (scores, risks, gutReaction)
  3. **Score computation** — in a new `computeBenchmarks()` utility (from Task 4) — log each score delta computed
  4. **Divergence computation** — in `computeBenchmarks.ts` (Task 7) — log the unique primary frictions count

  Use the existing `[TRACE]` prefix convention from `useAnalysisFlow.ts`.

  **Must NOT do**:
  - ❌ Do NOT log entire LLM responses (could be enormous) — log metadata, lengths, and key values
  - ❌ Do NOT log PII or secrets (API keys, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `[]`
  - **Reason**: Mechanical addition of log statements

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 4)
  - **Blocks**: (none — independent)
  - **Blocked By**: None

  **References**:
  - `src/infrastructure/adapters/PersonaPromptCompiler.ts:14-32` — Where compileSystemPrompt exists — add trace after compilation
  - `src/infrastructure/adapters/VisionAnalysisAdapter.ts:35-181` — analyzePricingPageStream — add trace after analysis completes (around line 174)
  - `src/ui/hooks/useAnalysisFlow.ts:36-48` — Existing [TRACE] pattern — follow the same format
  - `src/infrastructure/AnalysisLogger.ts` — Structured logger exists, but console.log is explicitly requested

  **Acceptance Criteria**:
  - [ ] 4 new `[TRACE]` log points added at specified locations
  - [ ] `grep '[TRACE]'` on changed files finds all 4 points
  - [ ] Log format matches existing conventions

  **QA Scenarios**:
  ```
  Scenario: All 4 trace points present
    Tool: Bash (grep)
    Steps:
      1. grep -n '\[TRACE\]' src/infrastructure/adapters/PersonaPromptCompiler.ts
      2. grep -n '\[TRACE\]' src/infrastructure/adapters/VisionAnalysisAdapter.ts
      3. grep -n '\[TRACE\]' (benchmark utility)
      4. grep -n '\[TRACE\]' (CompletedView)
    Expected Result: At least 1 match per file
    Evidence: .sisyphus/evidence/task-3-trace-points.txt
  ```

  **Commit**: YES (independent)
  - Message: `chore(pricing-analysis): add trace logging at 4 checkpoints`
  - Files: Multiple
  - Pre-commit: `bun test`

---

- [x] 4. Add benchmark utility: computeScoresWithBenchmarks

  **What to do**:
  - Create `src/ui/dashboard/utils/computeBenchmarks.ts` with exported functions:
    - `computeRunAverages(analyses)` — returns average of each score dimension across all analyses
    - `computeScoresWithBenchmarks(analyses)` — for each analysis, compute delta for each score vs run average
    - Handle edge case: 1-2 personas → hide deltas (return null for deltas)
    - Handle edge case: missing score fields → default to 0
  - Export types: `ScoreWithBenchmark` (value, delta, benchmarkAvg)
  - Write a unit test file: `src/ui/dashboard/utils/__tests__/computeBenchmarks.test.ts`
  - Add trace logging for each delta computed

  **Must NOT do**:
  - ❌ Do NOT store benchmarks in state/backend — computed on render only
  - ❌ Do NOT add charting libraries

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Pure logic with test — well-defined, self-contained

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 3)
  - **Parallel Group**: Wave 1
  - **Blocks**: 9, 10
  - **Blocked By**: 1 (needs PersonaProfile types)

  **References**:
  - `src/domain/entities/PricingAnalysis.ts:13-27` — Score interface — the score shape to benchmark
  - `src/ui/stores/simulationStore.ts:41-53` — Where analyses are stored — they arrive as `PricingAnalysis[]`
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:220-228` — Where scores are currently rendered — this is where benchmarked scores will be used

  **Acceptance Criteria**:
  - [ ] `computeRunAverages([{scores:{clarity:8}}, {scores:{clarity:6}}])` → `{clarity: 7}`
  - [ ] `computeScoresWithBenchmarks` returns scores with delta fields
  - [ ] 1-persona input → deltas are null (not 0)
  - [ ] Missing score field → defaults to 0
  - [ ] Unit test passes: `bun test computeBenchmarks`
  - [ ] Trace logging present for each delta computation

  **QA Scenarios**:
  ```
  Scenario: Benchmark computation with 3 analyses
    Tool: Bash (bun test)
    Preconditions: Unit test file exists
    Steps:
      1. bun test src/ui/dashboard/utils/__tests__/computeBenchmarks.test.ts
    Expected Result: ALL tests pass
    Evidence: .sisyphus/evidence/task-4-benchmark-tests.txt

  Scenario: 1-persona edge case
    Tool: Bash (node -e)
    Steps:
      1. Import computeScoresWithBenchmarks
      2. Pass single analysis
      3. Assert deltas are null (not 0)
    Expected Result: deltas === null
    Evidence: .sisyphus/evidence/task-4-benchmark-single.txt
  ```

  **Commit**: YES
  - Message: `feat(pricing-analysis): add benchmark utility with unit tests`
  - Files: `src/ui/dashboard/utils/computeBenchmarks.ts`, `src/ui/dashboard/utils/__tests__/computeBenchmarks.test.ts`
  - Pre-commit: `bun test`

---

- [x] 5. Strengthen personality divergence in PersonaPromptCompiler

  **What to do**:
  - In `PersonaPromptCompiler.ts`, expand the `compilePsychographicSection()` method's CORE RULE section to add a new `<<PERSONALITY BIAS>>` sub-section with:
    
    **A. Role-specific behavioral bias** (based on `persona.occupation`):
    - VP/Head/Director roles: evaluate at organizational level — team efficiency, scale, predictability, contract security, budget forecasting
    - Developer/Engineer roles: evaluate at craft level — API quality, local dev workflow, storage limits, docs, technical constraints
    - PM/Product roles: evaluate at UX level — team friction, notification noise, backlog management, feature gaps
    - C-level/Founder roles: evaluate at business level — growth trajectory, enterprise readiness, SAML/SCIM, procurement, TCO
    - Default (unknown): balanced evaluation across all dimensions
    
    **B. Big Five-driven critique divergence** (10 variants for high/low of each trait):
    - High Neuroticism: "You are ANXIOUS — you look for hidden traps, contract lock-in, surprise costs."
    - Low Neuroticism: "You are BOLD — minor pricing concerns don't scare you off."
    - High Conscientiousness: "You read EVERYTHING — fine print, footnotes, data limits."
    - Low Conscientiousness: "You SKIM — you go with your gut. You miss fine print."
    - High Openness: "You LOVE new tools — your enthusiasm colors your evaluation."
    - Low Openness: "You're SKEPTICAL — new tools are disruptions."
    - High Extraversion: "You seek team input — you care about what peers think."
    - Low Extraversion: "You decide independently — social proof doesn't sway you."
    - High Agreeableness: "You give benefit of the doubt — you trust claims."
    - Low Agreeableness: "You challenge everything — you demand proof."
    
  - Keep the existing CORE RULE section intact

  **Must NOT do**:
  - ❌ Do NOT remove the existing CORE RULE section
  - ❌ Do NOT force specific score values

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`
  - **Reason**: Prompt engineering needs careful language tuning

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: 6
  - **Blocked By**: None (independent of Wave 1)

  **References**:
  - `src/infrastructure/adapters/PersonaPromptCompiler.ts:53-82` — Current CORE RULE section — add <<PERSONALITY BIAS>> after line 81
  - `src/domain/entities/Persona.ts:25` — `occupation` field for role-based bias
  - `src/domain/entities/Persona.ts:31-35` — Big Five fields

  **Acceptance Criteria**:
  - [ ] `<<PERSONALITY BIAS>>` section added after CORE RULE
  - [ ] 4 role archetypes mapped (VP, Dev, PM, C-level)
  - [ ] 5 Big Five traits with high/low variants (10 total rules)
  - [ ] Existing CORE RULE section preserved intact
  - [ ] `bun test` passes

  **QA Scenarios**:
  ```
  Scenario: Divergence language present for VP persona
    Tool: Bash (node -e)
    Steps:
      1. Create persona with occupation="VP of Engineering", neuroticism=80
      2. Import PersonaPromptCompiler, call compileSystemPrompt
      3. Assert output contains "organizational level" and "ANXIOUS"
    Expected Result: Role-specific + Big Five bias present
    Evidence: .sisyphus/evidence/task-5-vp-bias.txt
  ```

  **Commit**: YES
  - Message: `feat(pricing-analysis): add personality bias section to prompts`
  - Files: `src/infrastructure/adapters/PersonaPromptCompiler.ts`
  - Pre-commit: `bun test`

---

- [x] 6. Add structured markers + bias priming in VisionAnalysisAdapter

  **What to do**:
  - In `VisionAnalysisAdapter.ts`, enhance the system prompt with two additions:

  **A. Structured output markers** — Add to STRICT OUTPUT RULES:
  ```
  STRUCTURED THOUGHTS FORMAT:
  Inside your 'thoughts' field, structure your analysis using these markers:
  [The Good] — What works well. Specific positive observations.
  [The Bad] — What doesn't work. Specific criticisms.
  [The Dealbreaker] — The single biggest reason you would NOT buy.
  ```
  
  **B. Personality bias reinforcement** — Add before OPENNESS PRIMING:
  ```
  <<PERSONALITY BIAS APPLICATION>>
  Your personality profile drives how you evaluate. Apply it aggressively:
  - Your Neuroticism determines how many risks you flag and how severe.
  - Your Conscientiousness determines how much fine print you read.
  - Your Openness determines whether new features excite or concern you.
  - Your Extraversion determines whether you seek team validation.
  - Your Agreeableness determines whether you give benefit of doubt.
  These are WHO YOU ARE. Your scores must reflect your personality.
  ```

  **Must NOT do**:
  - ❌ Do NOT remove existing OPENNESS PRIMING section
  - ❌ Do NOT add new Zod schema fields
  - ❌ Do NOT force specific score values

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`
  - **Reason**: Critical prompt construction — wrong wording changes LLM behavior

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: 7, 11
  - **Blocked By**: 5

  **References**:
  - `src/infrastructure/adapters/VisionAnalysisAdapter.ts:79-143` — Full system prompt
  - `src/infrastructure/adapters/VisionAnalysisAdapter.ts:95-106` — STRICT OUTPUT RULES — add markers here
  - `src/infrastructure/adapters/VisionAnalysisAdapter.ts:88-92` — OPENNESS PRIMING — add bias section before this

  **Acceptance Criteria**:
  - [ ] `[The Good]`, `[The Bad]`, `[The Dealbreaker]` markers added
  - [ ] `<<PERSONALITY BIAS APPLICATION>>` section added
  - [ ] All existing sections preserved
  - [ ] `bun test` passes

  **QA Scenarios**:
  ```
  Scenario: Markers present in system prompt
    Tool: Bash (grep)
    Steps:
      1. grep -c '\[The Good\]' src/infrastructure/adapters/VisionAnalysisAdapter.ts
      2. grep -c '\[The Bad\]' src/infrastructure/adapters/VisionAnalysisAdapter.ts
      3. grep -c '\[The Dealbreaker\]' src/infrastructure/adapters/VisionAnalysisAdapter.ts
    Expected Result: Each marker found at least once
    Evidence: .sisyphus/evidence/task-6-markers.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(pricing-analysis): add structured markers and bias priming`
  - Files: `src/infrastructure/adapters/VisionAnalysisAdapter.ts`
  - Pre-commit: `bun test`

---

- [x] 7. Add divergence log metrics

  **What to do**:
  - Add `logDivergenceMetrics(analyses)` to `computeBenchmarks.ts` (Task 4)
  - For each analysis, use `risks[0]` as primary friction; count unique values; log count + top duplicates
  - Format: `[TRACE] [Divergence] analyses=11, unique_primary_frictions=7, top_frictions=["250-issue limit (3x)", "Enterprise pricing opaque (2x)"]`
  - Call from `CompletedView` after analyses are loaded

  **Must NOT do**:
  - ❌ Do NOT add any state/UI — tracing only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `[]`
  - **Reason**: Simple utility function

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: 6

  **References**:
  - `src/ui/dashboard/utils/computeBenchmarks.ts` — Add function here
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:197` — Call from CompletedView

  **Acceptance Criteria**:
  - [ ] `logDivergenceMetrics` exists and logs correct format
  - [ ] Called from CompletedView

  **QA Scenarios**:
  ```
  Scenario: Divergence function exists
    Tool: Bash (grep)
    Steps:
      1. grep -n 'logDivergenceMetrics' src/ui/dashboard/utils/computeBenchmarks.ts
    Expected Result: Function defined
    Evidence: .sisyphus/evidence/task-7-divergence.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(pricing-analysis): add divergence log metrics`
  - Files: `src/ui/dashboard/utils/computeBenchmarks.ts`, `src/app/(app)/dashboard/simulations/[id]/page.tsx`
  - Pre-commit: `bun test`

---

- [x] 8. Add Playwright E2E test for analysis flow

  **What to do**:
  - Create `test/pricing-analysis-e2e.test.ts` with Playwright-based E2E tests covering:
    - Navigate to the dashboard
    - Enter a test URL (or use manual upload)
    - Trigger pricing analysis
    - Wait for completion
    - **Verify console.log output**: Capture all console messages during the run, assert that [TRACE] statements appear at all 4 checkpoints
    - **Verify UI output**: Assert analysis cards show real persona names (not "p1"), Big Five traits visible, executive summary table renders, structured sub-sections (The Good / The Bad / The Dealbreaker) render
    - Save screenshots at each verification point
  - Use the `playwright` skill for test construction
  - Use mocked/canned data where possible to avoid real LLM dependency

  **Must NOT do**:
  - ❌ Do NOT depend on real LLM calls for the E2E test — use mock data
  - ❌ Do NOT add external API dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Complex E2E flow with multiple assertions and console capture

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after all implementation)
  - **Blocks**: F1-F4
  - **Blocked By**: 1, 2, 8, 9, 10, 11 (all UI + entity changes)

  **References**:
  - `test/persona-system-e2e.test.ts` — Existing E2E test patterns to follow
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx` — The rendering page being tested
  - Use `playwright` skill for test construction

  **Acceptance Criteria**:
  - [ ] E2E test runs successfully: `bun vitest run test/pricing-analysis-e2e.test.ts`
  - [ ] Test confirms analysis headers show real names
  - [ ] Test confirms Big Five traits are visible
  - [ ] Test confirms executive summary table renders
  - [ ] Test confirms structured sub-sections render
  - [ ] Test confirms all 4 [TRACE] console.log points are emitted
  - [ ] Test evidence screenshots saved to `.sisyphus/evidence/e2e/`

  **QA Scenarios**:
  ```
  Scenario: E2E test passes
    Tool: Bash (bun vitest run)
    Preconditions: Dev server running, test file exists
    Steps:
      1. bun vitest run test/pricing-analysis-e2e.test.ts
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-8-e2e-results.txt

  Scenario: Console logs captured during test
    Tool: Playwright
    Steps:
      1. During E2E test, capture all console.log output
      2. Filter for [TRACE] lines
      3. Assert at least 4 distinct [TRACE] lines from different checkpoints
    Expected Result: [TRACE] logs from prompt construction, analysis completion, score computation, and divergence computation are all captured
    Evidence: .sisyphus/evidence/task-8-console-logs.txt
  ```

  **Commit**: YES
  - Message: `test(pricing-analysis): add Playwright E2E test with console tracing`
  - Files: `test/pricing-analysis-e2e.test.ts`
  - Pre-commit: `bun vitest run test/pricing-analysis-e2e.test.ts`

---

- [x] 9. Fix CompletedView — persona identity + Big Five display

  **What to do**:
  - In `src/app/(app)/dashboard/simulations/[id]/page.tsx`, rewrite the `CompletedView` function:
  
  **A. Fix persona name display** (was `analysis.id.split('-')[0]`):
  - Use `analysis.personaProfile?.name ?? analysis.id.split('-')[0] ?? "Persona"` as the header text
  - For old data (no personaProfile): fall back to "Persona N" where N is the index+1
  
  **B. Add Big Five trait display** under the persona name header:
  - Show: **"Elliot · Lead PM (High Neuroticism: 80%, Values: Relevant Notifications)"**
  - Format: `{personaProfile.name} · {personaProfile.occupation} (High/Low {trait}: {value}%, ...)`
  - Show the top 2 most extreme Big Five traits (highest deviation from 50)
  - Render as a styled subtitle line
  
  **C. Add persona identity card**:
  - Show: Name, Occupation, Big Five bar indicators, Values, Fears, Communication Style, Pricing Sensitivity
  - Use compact badge-style display (not full card)
  
  **D. Handle old data fallback**:
  - If `!analysis.personaProfile`, display `analysis.id.split('-')[0]` as-is, with a subtle "Legacy data" note
  - Do NOT crash — graceful degradation

  **Must NOT do**:
  - ❌ Do NOT add new CSS libraries — use existing Tailwind + shadcn patterns
  - ❌ Do NOT remove the legacy `analysis.id.split('-')[0]` fallback

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`
  - **Reason**: UI component with data display

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (starts UI rework)
  - **Blocks**: 10, 11, 12
  - **Blocked By**: 1, 2

  **References**:
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:197-270` — Current CompletedView — the entire function gets rewritten
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:207` — Line to fix: `analysis.id.split('-')[0]`
  - `src/ui/dashboard/components/views/ResultsView.tsx:54-144` — ResultsView pattern shows Big Five in card layout
  - `src/domain/entities/PersonaProfile.ts` (Task 1) — New interface with Big Five data
  - Use `impeccable` skill for UI polish

  **Acceptance Criteria**:
  - [ ] Persona name shows real name (not "p1") for new analyses
  - [ ] Old analyses show "Persona N" fallback (not crash)
  - [ ] Big Five traits displayed: top 2 extreme traits shown in header line
  - [ ] Persona identity card shows values, fears, communication style
  - [ ] Graceful degradation when `personaProfile` is missing

  **QA Scenarios**:
  ```
  Scenario: New analysis shows proper persona identity
    Tool: Playwright
    Preconditions: Analysis with personaProfile exists in store
    Steps:
      1. Navigate to simulation detail page
      2. Check analysis card header text
      3. Assert text contains persona name (not "p1")
      4. Assert Big Five trait labels visible
    Expected Result: "Elliot · Lead PM (High Neuroticism: 80%)" format
    Evidence: .sisyphus/evidence/task-9-persona-identity.png

  Scenario: Old analysis gracefully degrades
    Tool: Playwright
    Preconditions: Old analysis WITHOUT personaProfile exists in store
    Steps:
      1. Navigate to simulation detail page
      2. Assert no crash
      3. Assert "Persona 1" or similar fallback shown
    Expected Result: Graceful fallback, not "p1"
    Evidence: .sisyphus/evidence/task-9-old-data.png
  ```

  **Commit**: YES (groups with Tasks 10, 11, 12)
  - Message: `feat(pricing-analysis): add persona identity and Big Five display to CompletedView`
  - Files: `src/app/(app)/dashboard/simulations/[id]/page.tsx`
  - Pre-commit: `bun test`

---

- [x] 10. Add executive summary table to CompletedView

  **What to do**:
  - At the TOP of the CompletedView (before individual analysis cards), add an executive summary dashboard table
  - Use `computeRunAverages` and `computeScoresWithBenchmarks` from Task 4
  - Table columns:
    | Persona | Segment | Clarity | Trust | Buy Intent | Primary Friction |
    |---------|---------|---------|-------|------------|------------------|
    | **Casey** | Lead PM | 7/10 | 4/10 | 2/10 | 250-issue limit |
    | **Riley** | VP Eng | 9/10 | 8/10 | 6/10 | Enterprise opaque |
    | **AVERAGE** | | **7.3** | **5.3** | **3.8** | |
  - "Primary Friction" column uses `risks[0]` or `personaProfile.fears[0]`
  - "Segment" column uses `personaProfile.occupation` or a simplified job title
  - AVERAGE row is computed from all analyses, rendered in bold
  - Handle 1-persona case: show average row but no delta indicators
  - Use geist mono font for numeric columns
  - Add trace logging: `[TRACE] [Benchmark] computed averages for N analyses: {clarity: 7.3, ...}`

  **Must NOT do**:
  - ❌ Do NOT add charting libraries — plain table only
  - ❌ Do NOT persist benchmark data — computed on render

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`
  - **Reason**: UI component with data rendering

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: (none — renders above personas)
  - **Blocked By**: 4, 9

  **References**:
  - `src/ui/dashboard/utils/computeBenchmarks.ts` (Task 4) — Import computeRunAverages
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:197-270` — Add table at top of CompletedView
  - `src/domain/entities/PersonaProfile.ts` — Source for segment/occupation

  **Acceptance Criteria**:
  - [ ] Executive summary table renders at BEFORE all analysis cards
  - [ ] Columns: Persona, Segment, Clarity, Trust, Buy Intent, Primary Friction
  - [ ] AVERAGE row present and bold
  - [ ] 1-persona case renders without errors
  - [ ] Tabular-nums font for numeric values
  - [ ] `[TRACE] [Benchmark]` log emitted
  - [ ] Responsive: table scrolls horizontally on narrow screens

  **QA Scenarios**:
  ```
  Scenario: Executive summary table renders
    Tool: Playwright
    Preconditions: Simulation with 3+ analyses loaded
    Steps:
      1. Navigate to simulation detail page
      2. Look for table element or grid with class containing "executive-summary"
      3. Assert "AVERAGE" row present
      4. Assert at least 3 persona rows
      5. Assert numeric values in cells
    Expected Result: Table visible, contains all required columns, AVERAGE row present
    Evidence: .sisyphus/evidence/task-10-exec-summary.png
  ```

  **Commit**: YES (groups with Tasks 9, 11, 12)
  - Message: `feat(pricing-analysis): add executive summary table`
  - Files: `src/app/(app)/dashboard/simulations/[id]/page.tsx`
  - Pre-commit: `bun test`

---

- [x] 11. Add benchmark deltas to score display

  **What to do**:
  - In the CompletedView, for each score display, add a comparative delta label:
  - Format: "Buy Intent: 5/10 (**+1.5 vs Run Avg**)"
  - Colors: green for positive delta, red for negative, muted for zero
  - Deltas are computed from `computeScoresWithBenchmarks` (Task 4)
  - Hide deltas when only 1-2 personas (too small for meaningful comparison)
  - Use the score display already in the CompletedView's grid (currently line 220-228)

  **Must NOT do**:
  - ❌ Do NOT hide the base score — delta is supplementary
  - ❌ Do NOT show deltas for 1-persona runs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Small UI enhancement with logic

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: (none)
  - **Blocked By**: 4, 9

  **References**:
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:220-228` — Current score grid — add deltas here
  - `src/ui/dashboard/utils/computeBenchmarks.ts` — computeScoresWithBenchmarks

  **Acceptance Criteria**:
  - [ ] Each score shows delta: "7/10 (+0.5 vs Run Avg)"
  - [ ] Green for positive, red for negative, muted for zero
  - [ ] Deltas hidden for 1-2 persona runs
  - [ ] `[TRACE] [Benchmark]` log emitted for each delta

  **QA Scenarios**:
  ```
  Scenario: Score deltas visible
    Tool: Playwright
    Preconditions: Simulation with 3+ analyses loaded
    Steps:
      1. Navigate to simulation detail page
      2. Look for score text containing "/10 (+" or "/10 (-"
      3. Assert at least one delta shown
    Expected Result: Score deltas visible with color coding
    Evidence: .sisyphus/evidence/task-11-score-deltas.png
  ```

  **Commit**: YES (groups with Task 9, 10, 12)
  - Message: `feat(pricing-analysis): add benchmark deltas to scores`
  - Files: `src/app/(app)/dashboard/simulations/[id]/page.tsx`
  - Pre-commit: `bun test`

---

- [x] 12. Add structured sub-sections (The Good / The Bad / The Dealbreaker)

  **What to do**:
  - In the CompletedView's analysis card, add a new section between "Detailed Thoughts" and "Perceived Risks"
  - Parse the `analysis.thoughts` field for `[The Good]`, `[The Bad]`, `[The Dealbreaker]` markers
  - Split the `thoughts` text on these markers and render as structured sub-sections:
    - **The Good** — rendered in a green-tinted card
    - **The Bad** — rendered in a red-tinted card  
    - **The Dealbreaker** — rendered in a highlighted card with warning icon
    - **Full Thoughts** — the remaining/unstructured text section (fallback)
  - If markers are NOT present (e.g., old data or LLM didn't follow instructions), fall back to showing the full `thoughts` text in a single block (current behavior)
  - Use distinctive visual treatments (subtle border colors, icons) but stay within the existing design system

  **Must NOT do**:
  - ❌ Do NOT do heuristic NLP — rely entirely on prompt markers
  - ❌ Do NOT add new CSS framework or icons beyond what's available (use lucide-react)
  - ❌ Do NOT crash if markers are missing — fall back gracefully

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`
  - **Reason**: UI formatting with text parsing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: (none)
  - **Blocked By**: 6, 9

  **References**:
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:214-218` — Current "Detailed Thoughts" section — add sub-sections here
  - `src/app/(app)/dashboard/simulations/[id]/page.tsx:117-129` — "Perceived Risks" section — related content
  - Existing icons: `ThumbsUpIcon`, `ThumbsDownIcon`, `AlertTriangleIcon` from lucide-react
  - Use `impeccable` skill for UI formatting

  **Acceptance Criteria**:
  - [ ] `[The Good]` content renders in a green-tinted card
  - [ ] `[The Bad]` content renders in a red-tinted card
  - [ ] `[The Dealbreaker]` content renders in a highlighted card
  - [ ] Missing markers → falls back to full thoughts block (no crash)
  - [ ] Markers visually distinct but consistent with design system

  **QA Scenarios**:
  ```
  Scenario: Structured sub-sections render
    Tool: Playwright
    Preconditions: Analysis with markers in thoughts field
    Steps:
      1. Navigate to simulation detail page
      2. Look for section heading "The Good"
      3. Look for section heading "The Bad"
      4. Look for section heading "The Dealbreaker"
    Expected Result: All 3 structured sections visible with content
    Evidence: .sisyphus/evidence/task-12-structured-sections.png

  Scenario: Fallback for missing markers
    Tool: Playwright
    Preconditions: Analysis WITHOUT markers in thoughts (old data)
    Steps:
      1. Navigate to simulation detail page
      2. Assert no crash
      3. Assert full thoughts block is visible
    Expected Result: Graceful fallback, full text shown
    Evidence: .sisyphus/evidence/task-12-fallback.png
  ```

  **Commit**: YES (groups with Task 9, 10, 11)
  - Message: `feat(pricing-analysis): add structured sub-sections to analysis cards`
  - Files: `src/app/(app)/dashboard/simulations/[id]/page.tsx`
  - Pre-commit: `bun test`

---

- [x] 13. Fix ResultsView persona mapping + Big Five display

  **What to do**:
  - In `ResultsView.tsx`, fix the persona-to-analysis pairing:
  - Replace index-based pairing (`const persona = personas[index]`) with ID-based matching:
    - Match by `personaProfile?.name` or by `personaId` prefix
    - Fall back to index-based if no match found
  - Add Big Five trait display to the persona header (same format as Task 9)
  - This is the secondary rendering path (dashboard view, not simulation detail)

  **Must NOT do**:
  - ❌ Do NOT break existing index-based fallback

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`
  - **Reason**: UI component fix

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (depends on entities + ID fix)
  - **Blocks**: (none)
  - **Blocked By**: 1, 2

  **References**:
  - `src/ui/dashboard/components/views/ResultsView.tsx:48-49` — Current index-based pairing — fix here
  - `src/ui/dashboard/components/views/ResultsView.tsx:59-65` — Persona header — add Big Five display

  **Acceptance Criteria**:
  - [ ] ResultsView matches analyses to personas by personaId/name (not index)
  - [ ] Big Five traits visible in persona header
  - [ ] Index-based fallback works when no match found
  - [ ] `bun test` passes

  **QA Scenarios**:
  ```
  Scenario: ResultsView shows correct names
    Tool: Playwright
    Preconditions: ResultsView with personas and analyses
    Steps:
      1. Navigate to dashboard with completed analysis
      2. Check persona headers for real names
      3. Check Big Five display present
    Expected Result: Correct names, no "p1" visible
    Evidence: .sisyphus/evidence/task-13-results-view.png
  ```

  **Commit**: YES
  - Message: `fix(pricing-analysis): fix persona mapping and add Big Five display in ResultsView`
  - Files: `src/ui/dashboard/components/views/ResultsView.tsx`
  - Pre-commit: `bun test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  
  **Verify:**
  - [ ] All 8 "Must Have" items present and implemented
  - [ ] All 7 "Must NOT Have" items absent from codebase
  - [ ] All 13 task evidence files exist
  - [ ] Console.log [TRACE] lines present at 4 checkpoints
  - Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log (only [TRACE] allowed), commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  
  **Verify:**
  - [ ] `tsc --noEmit` passes
  - [ ] Linter passes
  - [ ] `bun test` passes
  - [ ] No `as any` or `@ts-ignore` added
  - [ ] No empty catch blocks
  - [ ] PricingAnalysisSchema unchanged
  - Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  
  **Verify:**
  - [ ] All 13 task QA scenarios pass individually
  - [ ] Executive summary table shows correct data with 3+ personas
  - [ ] Structured sub-sections render The Good / The Bad / The Dealbreaker
  - [ ] Benchmark deltas shown in green/red/muted
  - [ ] Old data fallback shows "Persona N" without crash
  - [ ] Playwright E2E test: console.log capture asserts [TRACE] lines
  - Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  
  **Verify:**
  - [ ] Tasks 1-4 implemented exactly per spec
  - [ ] Tasks 5-7 implemented exactly per spec
  - [ ] Tasks 8-13 implemented exactly per spec
  - [ ] No changes to: PricingAnalysisSchema, PersonaAdapter, genderless_names.ts
  - [ ] No new library dependencies
  - [ ] No NLP/charting libraries added
  - Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Message | Files | Pre-commit |
|------|---------|-------|------------|
| 1 | `feat(pricing-analysis): add PersonaProfile interface and enrich analyses` | `PersonaProfile.ts`, `PricingAnalysis.ts`, `ParsePricingPageUseCase.ts` | `bun test` |
| 2 | `fix(pricing-analysis): carry real persona name in analysis ID` | `ParsePricingPageUseCase.ts` | `bun test` |
| 3 | `chore(pricing-analysis): add trace logging at 4 checkpoints` | Multiple | `bun test` |
| 4 | `feat(pricing-analysis): add benchmark utility with unit tests` | `computeBenchmarks.ts`, `__tests__/computeBenchmarks.test.ts` | `bun test` |
| 5 | `feat(pricing-analysis): add personality bias section to prompts` | `PersonaPromptCompiler.ts` | `bun test` |
| 6 | `feat(pricing-analysis): add structured markers and bias priming` | `VisionAnalysisAdapter.ts` | `bun test` |
| 7 | `feat(pricing-analysis): add divergence log metrics` | `computeBenchmarks.ts`, `page.tsx` | `bun test` |
| 8 | `test(pricing-analysis): add Playwright E2E test with console tracing` | `test/pricing-analysis-e2e.test.ts` | `bun vitest run test/pricing-analysis-e2e.test.ts` |
| 9-12 | `feat(pricing-analysis): add UI components (identity, summary, deltas, sections)` | `page.tsx` | `bun test` |
| 13 | `fix(pricing-analysis): fix persona mapping and add Big Five display in ResultsView` | `ResultsView.tsx` | `bun test` |

---

## Success Criteria

### Verification Commands
```bash
bun test                                          # All unit tests pass
bun vitest run test/pricing-analysis-e2e.test.ts  # E2E test passes
tsc --noEmit                                      # TypeScript compiles clean
curl -s http://localhost:3000/api/report | jq '.analyses[0].personaProfile.name'  # != null
grep -r '\[TRACE\]' src/                          # All 4 trace points present
```

### Final Checklist
- [ ] Analysis cards show real persona names (not "p1")
- [ ] Big Five traits visible per persona
- [ ] Executive summary table at top: Persona, Segment, Clarity, Trust, Buy Intent, Primary Friction
- [ ] Scores show deltas: "5/10 (+1.5 vs Run Avg)" with green/red coloring
- [ ] Three structured sections per card: The Good, The Bad, The Dealbreaker
- [ ] Missing `personaProfile` → graceful "Persona N" fallback (no crash)
- [ ] `[TRACE]` logs at all 4 checkpoints confirm divergence
- [ ] At least 7/11 personas have unique primary frictions
- [ ] Zod `PricingAnalysisSchema` unchanged
- [ ] No new library dependencies
- [ ] No changes to `PersonaAdapter` internal ID logic
- [ ] No changes to `src/data/genderless_names.ts`
- [ ] Playwright E2E test captures console.log output and verifies [TRACE] lines
