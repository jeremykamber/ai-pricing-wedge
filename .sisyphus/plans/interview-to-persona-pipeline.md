# Interview-to-Persona Pipeline

## TL;DR

> **Quick Summary**: Implement a pipeline that ingests interview transcripts, extracts observable signals via LLM, pools them into frequency distributions, samples N coherent synthetic personas from the distribution, passes them through the existing persona generation flow, and ingests interview chunks into ID-RAG for traceable grounding at chat time.
>
> **Deliverables**:
> - `GeneratePersonasFromInterviewsUseCase` orchestrating the full pipeline
> - `InterviewSignalExtractor` (port implementor, Pattern A)
> - Pooling function (trigram-similarity based dedup + frequency normalization)
> - Sampling function (weighted random draw + inline coherence validation)
> - `HtmlSummarizer` (rename + port conversion of `ExtractionAdapter`)
> - `PsychographicRationalizer` (rename + port conversion of `PbjScaffoldEnhancer`)
> - `GeneratePersonasUseCase` modified for variable persona count
> - `IdRagStore` generalized to generic `Chunk` type with `chunkType` discrimination
> - Server action for interview upload + pipeline trigger
>
> **Estimated Effort**: Medium (3-4 weeks of work, ~25 tasks)
> **Parallel Execution**: YES — 3 waves + 1 final verification wave
> **Critical Path**: Types/Ports → Adapter Implementations → Orchestration → Action + Integration

---

## Context

### Original Request
Full interview-to-persona pipeline specification in `docs/INTERVIEW_TO_PERSONA_PIPELINE.md`. User requested implementation of this pipeline grounded in the existing Kynd codebase.

### Interview Summary
Extensive grilling session using Elon Musk's Algorithm. Key resolutions:

- **Interview entity**: Minimal — ID, filename, raw text, optional metadata. Persists for traceability.
- **ExtractedInterviewSignals**: Application-layer type (not domain entity). Lives alongside pooling/sampling code.
- **Adapter renames**: `ExtractionAdapter` → `HtmlSummarizer`, `PbjScaffoldEnhancer` → `PsychographicRationalizer`. Both converted to Pattern A (port + delegation).
- **IdRagStore**: Generalized to generic `Chunk` with `chunkType: "backstory" | "interview"` and `metadata: Record<string, unknown>`. Chunking functions separated (`chunkBackstory`, `chunkInterviewSignals`).
- **Pipeline orchestration**: Single `GeneratePersonasFromInterviewsUseCase`. Action is thin.
- **Persona generation**: No hardcoded 3-persona limit — variable count based on input.
- **Psychographic tweaking**: Separate `rerationalizePersona` path, not threaded through generate.
- **Cohort**: Not a domain concept — use `PersonaSet` for pipeline output, simple array predicates for filtering.

### Metis Review
No blocking gaps identified. All decisions captured in `CONTEXT.md` and in this conversation.

---

## Work Objectives

### Core Objective
Ingest interview transcripts and produce N interview-grounded synthetic personas (N > interview count) with full traceability to source quotes.

### Concrete Deliverables
- `src/domain/ports/LlmServicePort.ts` — extended with `extractInterviewSignals`, `rationalizePersonas` (renamed from `enhancePersonasWithPbj`)
- `src/infrastructure/adapters/HtmlSummarizer.ts` — renamed from ExtractionAdapter, same interface
- `src/infrastructure/adapters/PsychographicRationalizer.ts` — renamed from PbjScaffoldEnhancer, proper port implementor
- `src/infrastructure/adapters/InterviewSignalExtractor.ts` — new port implementor for single-shot extraction
- `src/infrastructure/adapters/IdRagStore.ts` — generalized to generic Chunk type
- `src/application/usecases/GeneratePersonasUseCase.ts` — variable persona count
- `src/application/usecases/GeneratePersonasFromInterviewsUseCase.ts` — new orchestrator
- `src/actions/generatePersonasFromInterviews.ts` — new server action
- `src/infrastructure/adapters/__tests__/` — tests for all new components
- Pooling + sampling pure functions (location TBD in application layer)

### Definition of Done
- `bunx --bun vitest run` passes (all existing + new tests)
- `bunx --bun tsc --noEmit` passes
- Pipeline produces N personas from M interview transcripts (verified via unit test with mock transcripts)
- Each persona's chat response can reference interview quotes via ID-RAG
- PsychographicRationalizer generates rationales on-demand (not via dynamic import)
- HtmlSummarizer works identically to old ExtractionAdapter

### Must Have
- [ ] ExtractionAdapter → HtmlSummarizer rename + port conversion (all imports updated, existing callers work)
- [ ] PbjScaffoldEnhancer → PsychographicRationalizer rename + port conversion (dynamic import eliminated, proper delegation)
- [ ] IdRagStore generalized to generic Chunk type with chunkType discrimination
- [ ] InterviewSignalExtractor: Pattern A port implementor on LlmServicePort
- [ ] Pooling: trigram-similarity based dedup with frequency normalization
- [ ] Sampling: weighted random draw + inline coherence validation (1 LLM call)
- [ ] GeneratePersonasUseCase: accepts variable persona count (no hardcoded 3)
- [ ] GeneratePersonasFromInterviewsUseCase: orchestrates extract → pool → sample → generate → ingest
- [ ] Server action: handles file I/O, passes `{filename, content}[]` to use case, streams progress
- [ ] Interview chunks ingested alongside backstory chunks in IdRagStore
- [ ] All existing tests continue to pass without modification
- [ ] TDD: tests written before/alongside implementation for new components

### Must NOT Have (Guardrails)
- [ ] NO UI for interview upload (server action only — UI is separate work)
- [ ] NO cohort engine or dedicated cohort concept
- [ ] NO changes to Persona entity schema (all fields already exist)
- [ ] NO changes to PersonaPromptCompiler
- [ ] NO changes to ChatAdapter (interview chunks flow through existing ID-RAG retrieval)
- [ ] NO changes to InCharacterEvaluator or PiconEvaluator
- [ ] NO new domain entities in `src/domain/entities/`
- [ ] NO changes to VisionAnalysisAdapter, GazePredictionAdapter, or other unrelated adapters
- [ ] NO audio/video transcription (text input only)
- [ ] NO multi-pass extraction with agent loops (single-shot only for MVP)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: TDD (tests before/w alongside implementation)
- **Framework**: vitest + bun

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Pure functions** (pooling, sampling): Use Bash (bun test) — import, call with test data, assert output
- **LLM adapters** (InterviewSignalExtractor, PsychographicRationalizer): Mock LlmServiceImpl, verify prompt structure and response parsing
- **Use cases**: Unit test with mocked adapters, verify orchestration flow
- **Server action**: Test with mock file data, verify it calls use case with correct params
- **IdRagStore**: Unit test chunking, retrieval, format with both backstory and interview chunks

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — parallel, no dependencies):
├── 1. Add extraction/sampling types to application layer
├── 2. Extend LlmServicePort with new methods
├── 3. Convert ExtractionAdapter → HtmlSummarizer (rename + port)
├── 4. Convert PbjScaffoldEnhancer → PsychographicRationalizer (rename + port)
├── 5. Generalize IdRagStore to generic Chunk type
└── 6. Git commit: Wave 1

Wave 2 (Core components — parallel after types/ports set):
├── 7. Implement InterviewSignalExtractor (port + adapter)
├── 8. Implement pooling function (trigram dedup + frequency)
├── 9. Implement sampling function (weighted draw + validate)
├── 10. Modify GeneratePersonasUseCase for variable count
├── 11. Implement chunkInterviewSignals function
└── 12. Git commit: Wave 2

Wave 3 (Integration — sequential dependency chain):
├── 13. Implement GeneratePersonasFromInterviewsUseCase (orchestrator)
├── 14. Implement server action (file I/O + pipeline trigger)
├── 15. Wire interview chunk retrieval into IdRagService
└── 16. Git commit: Wave 3

Wave 4 (Tests — parallel, after each component):
├── 17. Tests for pooling + sampling functions
├── 18. Tests for InterviewSignalExtractor
├── 19. Tests for GeneratePersonasFromInterviewsUseCase (mocked)
├── 20. Tests for IdRagStore generalization + interview chunk retrieval
├── 21. Tests for PsychographicRationalizer port conversion
├── 22. Integration test: full pipeline with mock transcripts
└── 23. Git commit: Wave 4

Wave FINAL (ALWAYS present — 4 parallel reviews):
├── F1. Plan compliance audit (oracle)
├── F2. Code quality review (unspecified-high)
├── F3. Real manual QA (unspecified-high + playwright if UI)
└── F4. Scope fidelity check (deep)
    → Present results → Get explicit user okay

Critical Path: 1→2→7→13→14→F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix
- **1-6**: — (Wave 1, all parallel)
- **7**: 1, 2 — 13
- **8**: 1 — 13
- **9**: 1 — 13
- **10**: 2 — 13
- **11**: 5 — 15
- **12**: — (git commit)
- **13**: 7, 8, 9, 10 — 14
- **14**: 13 — F1-F4
- **15**: 5, 11 — F1-F4
- **16**: — (git commit)
- **17-22**: respective components — F1-F4
- **23**: — (git commit)

---

## TODOs

- [x] 1. Define application-layer types for extraction, pooling, and sampling

  **What to do**:
  - Create a new file (e.g., `src/application/interviewPipeline/types.ts`) with the following types:
    - `ExtractedSignal { text: string, quote: string, sourceSegmentId: string }`
    - `ExtractedInterviewSignals { interviewId: string, painPoints: ExtractedSignal[], goals: ExtractedSignal[], values: ExtractedSignal[], featureDesires: ExtractedSignal[], decisionPatterns: ExtractedSignal[], context: { role?: string, industry?: string, teamSize?: string }, communicationStyle: string, salientQuotes: string[] }`
    - `WeightedItem { text: string, weight: number, sourceExamples: string[] }`
    - `PooledDistributionSummary { painPoints: WeightedItem[], goals: WeightedItem[], values: WeightedItem[], featureDesires: WeightedItem[], decisionPatterns: WeightedItem[], contextDistribution: { roles: WeightedItem[], industries: WeightedItem[] }, communicationStyles: WeightedItem[], allSalientQuotes: string[], totalInterviews: number }`
    - `SampledPersonaSignal { id: string, painPoints: ExtractedSignal[], goals: ExtractedSignal[], values: ExtractedSignal[], featureDesires: ExtractedSignal[], decisionPattern: ExtractedSignal, context: { role: WeightedItem, industry: WeightedItem }, communicationStyle: WeightedItem }`
  - These are pure type definitions — no behavior, no imports from infrastructure layers
  - NOT in `src/domain/entities/` — these are application-layer pipeline types
  - Export all types for use by adapters and use cases

  **Must NOT do**:
  - Do NOT put these in `src/domain/entities/` (they're not domain entities)
  - Do NOT add methods/behavior to these types
  - Do NOT create a separate file per type (keep as a single types file)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions, straightforward TypeScript
  - **Skills**: `[]`
    - No domain-specific skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 7, 8, 9, 13
  - **Blocked By**: None (can start immediately)

  **References**:
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:209-283` — Full type definitions for ExtractedInterviewSignals, InterviewChunk, PooledDistributionSummary
  - `src/domain/entities/Persona.ts` — Existing entity pattern for reference (follow the interface style, not class style)
  - `src/domain/dtos/UserDTO.ts` — Existing DTO pattern for application-layer types

  **Acceptance Criteria**:
  - [ ] All types defined and exported from the application layer
  - [ ] `bunx --bun tsc --noEmit` passes with no errors
  - [ ] No types violate hexagonal architecture (no infrastructure references in application types)

  **QA Scenarios**:
  ```
  Scenario: Types are valid TypeScript
    Tool: Bash (bun)
    Steps:
      1. Run `bunx --bun tsc --noEmit --strict src/application/interviewPipeline/types.ts`
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-1-types-compile.txt

  Scenario: Types export correctly
    Tool: Bash (bun)
    Steps:
      1. Run `bun -e "const t = require('./src/application/interviewPipeline/types'); console.log(Object.keys(t).join(','))"`
    Expected Result: All type names exported (may need to use dynamic import with ts)
    Evidence: .sisyphus/evidence/task-1-types-export.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add application-layer types for interview pipeline`
  - Files: `src/application/interviewPipeline/types.ts`
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 2. Extend LlmServicePort with new methods

  **What to do**:
  - Add to `src/domain/ports/LlmServicePort.ts`:
    - `extractInterviewSignals(transcript: string, interviewId: string): Promise<ExtractedInterviewSignals>` — single-shot extraction
    - `rationalizePersonas(personas: Persona[]): Promise<Persona[]>` — replaces `enhancePersonasWithPbj`
  - `summarizeHtml` already exists on the port (line 192) — mark the existing `ExtractionAdapter` usage as pending rename
  - Add the delegation methods to `src/infrastructure/adapters/LlmServiceImpl.ts`:
    - `extractInterviewSignals` → delegates to new `InterviewSignalExtractor` instance
    - `rationalizePersonas` → delegates to new `PsychographicRationalizer` instance (replaces dynamic import)
  - Remove the old `enhancePersonasWithPbj` dynamic import from `LlmServiceImpl.ts`

  **Must NOT do**:
  - Do NOT implement the actual extraction/rationalization logic here — just the port interface + delegation
  - Do NOT modify unrelated port methods
  - Do NOT break existing callers of `summarizeHtml`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Interface extension + delegation wiring
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Tasks 7, 10, 13
  - **Blocked By**: None

  **References**:
  - `src/domain/ports/LlmServicePort.ts` — Existing port interface to extend
  - `src/infrastructure/adapters/LlmServiceImpl.ts:274-322` — Existing delegation pattern (PersonaAdapter, VisionAnalysisAdapter, ChatAdapter)
  - `src/infrastructure/adapters/LlmServiceImpl.ts:329-342` — Current `enhancePersonasWithPbj` dynamic import (to remove)

  **Acceptance Criteria**:
  - [ ] `extractInterviewSignals` added to `LlmServicePort`
  - [ ] `rationalizePersonas` added to `LlmServicePort` (replaces `enhancePersonasWithPbj`)
  - [ ] Both methods delegated through `LlmServiceImpl` to new adapter instances
  - [ ] Old `enhancePersonasWithPbj` dynamic import removed from `LlmServiceImpl`
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Port methods are callable
    Tool: Bash (bun)
    Steps:
      1. Run `bunx --bun tsc --noEmit`
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-2-port-compile.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(pipeline): extend LlmServicePort with extraction and rationalization methods`
  - Files: `src/domain/ports/LlmServicePort.ts`, `src/infrastructure/adapters/LlmServiceImpl.ts`
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 3. Rename ExtractionAdapter → HtmlSummarizer with port conversion

  **What to do**:
  - Rename file: `src/infrastructure/adapters/ExtractionAdapter.ts` → `src/infrastructure/adapters/HtmlSummarizer.ts`
  - Rename class: `ExtractionAdapter` → `HtmlSummarizer`
  - Ensure the class takes `LlmServiceImpl` in constructor (already does — Pattern A)
  - The method `summarizeHtml(html: string): Promise<string>` is already on `LlmServicePort` (line 192)
  - Update `LlmServiceImpl.ts`:
    - Change `this.extractionAdapter = new ExtractionAdapter(this)` → `this.htmlSummarizer = new HtmlSummarizer(this)`
    - Update `summarizeHtml` delegation to use `this.htmlSummarizer`
  - Update all imports referencing `ExtractionAdapter`:
    - `LlmServiceImpl.ts`
    - Any test files
  - Keep the same prompt and logic — this is a rename + port alignment, not a behavior change

  **Must NOT do**:
  - Do NOT change the `summarizeHtml` method signature, prompt, or behavior
  - Do NOT create a new port just for HtmlSummarizer (it stays on LlmServicePort)
  - Do NOT forget to update test imports

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward file rename + class rename + import updates
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Task 13 (indirectly — needs to be complete before integration tests)
  - **Blocked By**: None

  **References**:
  - `src/infrastructure/adapters/ExtractionAdapter.ts` — File to rename
  - `src/infrastructure/adapters/LlmServiceImpl.ts:30,64,387-389` — Current usage of ExtractionAdapter
  - `src/domain/ports/LlmServicePort.ts:192` — `summarizeHtml` method (already exists)

  **Acceptance Criteria**:
  - [ ] File renamed to `HtmlSummarizer.ts`
  - [ ] Class renamed to `HtmlSummarizer`
  - [ ] All imports updated across the codebase
  - [ ] `LlmServiceImpl` references `HtmlSummarizer` not `ExtractionAdapter`
  - [ ] `bunx --bun run test` passes (existing tests still work)
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: HtmlSummarizer compiles and is importable
    Tool: Bash (bun)
    Steps:
      1. Run `bunx --bun tsc --noEmit`
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-3-rename-compile.txt

  Scenario: Old ExtractionAdapter no longer referenced
    Tool: Bash (grep)
    Steps:
      1. Run `grep -r "ExtractionAdapter" src/ --include="*.ts" -l`
    Expected Result: No files reference ExtractionAdapter (only ExtractionAdapter.ts itself if it still exists as a remnant, or zero files)
    Evidence: .sisyphus/evidence/task-3-no-old-refs.txt
  ```

  **Commit**: YES (group with Task 1, 2, 4, 5, 6)
  - Message: `refactor(pipeline): rename ExtractionAdapter to HtmlSummarizer with port alignment`
  - Files: `src/infrastructure/adapters/HtmlSummarizer.ts` (new), `src/infrastructure/adapters/ExtractionAdapter.ts` (deleted), `src/infrastructure/adapters/LlmServiceImpl.ts`
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 4. Convert PbjScaffoldEnhancer → PsychographicRationalizer with port conversion

  **What to do**:
  - Rename file: `src/infrastructure/adapters/PbjScaffoldEnhancer.ts` → `src/infrastructure/adapters/PsychographicRationalizer.ts`

  **Must NOT do**:
  - Do NOT change the scaffold prompts or rationale generation logic
  - Do NOT forget to update the test file references
  - Do NOT leave the dynamic import in place

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Rename + port wiring. Straightforward but touches multiple files.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Task 13, 21
  - **Blocked By**: None

  **References**:
  - `src/infrastructure/adapters/PbjScaffoldEnhancer.ts` — File to rename
  - `src/infrastructure/adapters/LlmServiceImpl.ts:329-342` — Current dynamic import usage
  - `src/application/usecases/GeneratePersonasUseCase.ts:102` — Current call with `as any` cast
  - `src/infrastructure/adapters/__tests__/PbjScaffoldEnhancer.test.ts` — Test file to update

  **Acceptance Criteria**:
  - [ ] File renamed to `PsychographicRationalizer.ts`
  - [ ] Class renamed to `PsychographicRationalizer`
  - [ ] Dynamic import removed from `LlmServiceImpl.ts`
  - [ ] `rationalizePersonas` method on `LlmServicePort` delegates correctly
  - [ ] `GeneratePersonasUseCase` calls `llmService.rationalizePersonas()` without `as any` cast
  - [ ] All existing test imports updated
  - [ ] `bunx --bun run test` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: No dynamic import for PsychographicRationalizer
    Tool: Bash (grep)
    Steps:
      1. Run `grep -r "PsychographicRationalizer" src/infrastructure/adapters/LlmServiceImpl.ts`
    Expected Result: Found as instance creation `new PsychographicRationalizer(this)`, NOT as `import()`
    Evidence: .sisyphus/evidence/task-4-no-dynamic-import.txt

  Scenario: No as any cast for rationalizePersonas
    Tool: Bash (grep)
    Steps:
      1. Run `grep -r "enhancePersonasWithPbj" src/ --include="*.ts"`
    Expected Result: Only references to old method in git history, or none in src/
    Evidence: .sisyphus/evidence/task-4-no-cast.txt

  Scenario: All tests pass
    Tool: Bash (bun)
    Steps:
      1. Run `bunx --bun vitest run src/infrastructure/adapters/__tests__/`
    Expected Result: All tests pass (including renamed PbjScaffoldEnhancer tests)
    Evidence: .sisyphus/evidence/task-4-tests-pass.txt
  ```

  **Commit**: YES (group with Tasks 1, 2, 3, 5, 6)
  - Message: `refactor(pipeline): rename PbjScaffoldEnhancer to PsychographicRationalizer with port conversion`
  - Files: `src/infrastructure/adapters/PsychographicRationalizer.ts` (new), `src/infrastructure/adapters/PbjScaffoldEnhancer.ts` (deleted), `src/infrastructure/adapters/LlmServiceImpl.ts`, `src/application/usecases/GeneratePersonasUseCase.ts`, test files
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 5. Generalize IdRagStore to generic Chunk type

  **What to do**:
  - Refactor `src/infrastructure/adapters/IdRagStore.ts`:
    - Define a generic `Chunk` interface replacing `BackstoryChunk`:
      ```typescript
      interface Chunk {
        id: string;
        personaId: string;
        text: string;
        chunkType: "backstory" | "interview";
        metadata: Record<string, unknown>;  // emotionalTone, topic for backstory; signalTypes, sourceInterviewId for interview
      }
      ```
    - Keep the existing `BackstoryChunk` shape but map it to `Chunk` with `chunkType: "backstory"` and metadata
    - `ingestPersona(persona)` stays as a convenience method that calls `chunkBackstory()` → stores as backstory chunks
    - Add `ingestChunks(personaId: string, chunks: Chunk[])` for adding interview-derived chunks to the same persona
    - `retrieve(personaId, query, k)` stays unchanged (it only looks at `chunk.text` — type-agnostic)
    - `formatRetrievedContext(results)` — update to display chunk type info:
      - For backstory chunks: show existing topic/emotionalTone metadata
      - For interview chunks: show sourceInterviewId and signalTypes
    - Export `chunkBackstory()` as a standalone function (extract the logic currently in `IdRagStore.chunkBackstory()`)
  - Update `src/infrastructure/adapters/IdRagService.ts`:
    - `retrieveContext(persona, query, k)` stays unchanged — already persona-scoped
    - All chunks (backstory + interview) for the same persona are in the same store
  - Update `src/infrastructure/adapters/ChatAdapter.ts`:
    - `ingestedPersonas` tracking stays — ingestion now includes both backstory and interview chunks
  - Update any test that imports `BackstoryChunk`

  **Must NOT do**:
  - Do NOT change the retrieval algorithm (trigram fingerprint + cosine similarity stays)
  - Do NOT change `IngestPersona(persona)` signature (it still works, just stores chunks as `chunkType: "backstory"`)
  - Do NOT break existing callers of `retrieve()` or `formatRetrievedContext()`
  - Do NOT create a separate store for interview chunks (one store, generic Chunk)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Well-scoped refactor of existing code
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Tasks 11, 15, 20
  - **Blocked By**: None

  **References**:
  - `src/infrastructure/adapters/IdRagStore.ts` — Full file to refactor (191 lines)
  - `src/infrastructure/adapters/IdRagService.ts` — Consumer that needs no change
  - `src/infrastructure/adapters/ChatAdapter.ts:38-42` — Current ingest persona call
  - `src/infrastructure/adapters/__tests__/IdRagStore.test.ts` — Tests to update
  - `src/infrastructure/adapters/__tests__/PersonaSystemIntegration.test.ts` — Tests that may reference BackstoryChunk

  **Acceptance Criteria**:
  - [ ] `Chunk` type replaces `BackstoryChunk` with `chunkType` and `metadata`
  - [ ] `chunkBackstory()` extracted as standalone exportable function
  - [ ] `ingestChunks(personaId, chunks)` added to IdRagStore
  - [ ] `retrieve()` behavior unchanged for existing callers
  - [ ] `formatRetrievedContext()` displays chunk-type-aware metadata
  - [ ] All existing tests pass without modification
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Existing chunking + retrieval still works
    Tool: Bash (bun)
    Steps:
      1. Run `bunx --bun vitest run src/infrastructure/adapters/__tests__/IdRagStore.test.ts`
    Expected Result: All existing tests pass
    Evidence: .sisyphus/evidence/task-5-idrag-tests-pass.txt

  Scenario: Interview chunks can be ingested and retrieved
    Tool: Bash (bun test or node)
    Preconditions: IdRagStore created with some backstory chunks and interview chunks for same persona
    Steps:
      1. Ingest interview chunk with chunkType "interview"
      2. Retrieve with relevant query
      3. Assert interview chunk appears in results
    Expected Result: Interview chunks retrieved alongside backstory chunks
    Evidence: .sisyphus/evidence/task-5-interview-chunks.txt
  ```

  **Commit**: YES (group with Tasks 1, 2, 3, 4, 6)
  - Message: `refactor(pipeline): generalize IdRagStore to support interview chunks alongside backstory chunks`
  - Files: `src/infrastructure/adapters/IdRagStore.ts`, `src/infrastructure/adapters/IdRagService.ts`, test files
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 6. Git commit: Wave 1 foundation

  **What to do**:
  - Stage all files from Tasks 1-5
  - Verify `bunx --bun tsc --noEmit` and `bunx --bun vitest run` both pass
  - Create a single comprehensive commit message covering all Wave 1 changes

  **Must NOT do**:
  - Do NOT include any Wave 2 or Wave 3 changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Tasks 1-5)
  - **Blocks**: Wave 2 tasks
  - **Blocked By**: Tasks 1, 2, 3, 4, 5

  **Acceptance Criteria**:
  - [ ] Clean commit with all Wave 1 changes
  - [ ] `bunx --bun vitest run` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **Commit**: YES
  - Message: `feat(pipeline): wave 1 foundation — types, ports, adapter renames, IdRag generalization`
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 7. Implement InterviewSignalExtractor (port implementor)

  **What to do**:
  - Create `src/infrastructure/adapters/InterviewSignalExtractor.ts`:
    - Constructor takes `LlmServiceImpl` (Pattern A — like PersonaAdapter, VisionAnalysisAdapter)
    - Implement `extractInterviewSignals(transcript: string, interviewId: string): Promise<ExtractedInterviewSignals>`
    - Build the single-shot extraction prompt (from the pipeline spec Section 7.1):
      - System prompt: "You are analyzing a user interview transcript. Extract observable signals..."
      - Instruct LLM to return structured JSON matching `ExtractedInterviewSignals` schema
      - Use `response_format: { type: "json_object" }`
      - Each signal must have: normalized text, exact verbatim quote, segment reference
    - Validate the LLM response with a safe-parse wrapper (handle malformed JSON gracefully)
    - Log extraction result for debugging/traceability
  - No streaming version needed for MVP (single-shot per interview, all parallel)

  **Must NOT do**:
  - Do NOT infer personality traits or psychometrics (pipeline spec is explicit: only extract observable signals)
  - Do NOT create a separate port file — use `LlmServicePort.extractInterviewSignals()`
  - Do NOT add agent loops or multi-pass extraction (single-shot only for MVP)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: LLM adapter with structured output parsing. Needs careful prompt engineering and error handling.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 parallel group)
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:298-307` — Extraction step description
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:375-442` — Full extraction prompt and output schema
  - `src/infrastructure/adapters/PersonaAdapter.ts:16-78` — Pattern A example (constructor, createChatCompletion, JSON parse)
  - `src/infrastructure/adapters/LlmServiceImpl.ts:154-201` — `createChatCompletion` with `response_format` example
  - `src/application/interviewPipeline/types.ts` — `ExtractedInterviewSignals` type

  **Acceptance Criteria**:
  - [ ] `InterviewSignalExtractor` created in `src/infrastructure/adapters/`
  - [ ] `extractInterviewSignals(transcript, interviewId)` method implemented
  - [ ] Returns valid `ExtractedInterviewSignals` for a realistic transcript
  - [ ] Graceful error handling for malformed LLM responses
  - [ ] `bunx --bun tsc --noEmit` passes
  - [ ] Existing tests still pass

  **QA Scenarios**:
  ```
  Scenario: Extract valid signals from realistic transcript
    Tool: Bash (bun test with mocked LlmServiceImpl)
    Preconditions: Mock transcript text with clear pain points, goals, values
    Steps:
      1. Create InterviewSignalExtractor with mock LlmService that returns valid JSON
      2. Call extract()
      3. Assert result interviewId matches input
      4. Assert painPoints, goals, values arrays are populated
    Expected Result: Structured ExtractedInterviewSignals with all fields
    Evidence: .sisyphus/evidence/task-7-extract.txt

  Scenario: Handle malformed LLM response gracefully
    Tool: Bash (bun test)
    Preconditions: Mock LlmService returns non-JSON string or missing fields
    Steps:
      1. Call extract() with bad LLM response
      2. Assert error is thrown with descriptive message
    Expected Result: Graceful error with LLM response included in error message
    Evidence: .sisyphus/evidence/task-7-extract-error.txt
  ```

  **Commit**: YES (will group with Wave 2 commit)
  - Message: included in Wave 2 commit
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 8. Implement pooling function (trigram-similarity based dedup + frequency normalization)

  **What to do**:
  - Create a pooling module (e.g., `src/application/interviewPipeline/pooling.ts`):
    - `poolSignals(allExtractions: ExtractedInterviewSignals[]): PooledDistributionSummary`
    - For each signal type (pain points, goals, values, feature desires, decision patterns):
      1. Collect all items from all interviews
      2. Deduplicate via trigram similarity (reuse the `ngramFingerprint` + `cosineSimilarity` pattern from `IdRagStore`)
      3. Use a similarity threshold (start at 0.7, parameterize for tuning)
      4. Count frequency of each unique item across interviews
      5. Normalize to weights (0-1): `weight = count / totalInterviews`
      6. Attach 1-3 representative source quotes per WeightedItem
    - For context fields:
      - Aggregate role, industry frequencies into WeightedItem[]
    - Build a pool of all salient quotes for ID-RAG
    - Return `PooledDistributionSummary`
  - Extract the trigram primitives from `IdRagStore` into a shared utility (e.g., `src/infrastructure/adapters/llmUtils.ts` or a new `src/application/interviewPipeline/ngramUtils.ts`)
    - `ngramFingerprint(text: string, n?: number): Map<string, number>`
    - `cosineSimilarity(a: NGramVector, b: NGramVector): number`
    - Update `IdRagStore` to use the shared utility

  **Must NOT do**:
  - Do NOT use LLM for pooling (trigram is faster, cheaper, and good enough for MVP)
  - Do NOT make LLM calls inside the pooling function

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Pure math function. Reuses existing pattern from IdRagStore.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 9, 10, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 1

  **References**:
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:451-459` — Pooling algorithm
  - `src/infrastructure/adapters/IdRagStore.ts:33-60` — Existing ngram fingerprint + cosine similarity
  - `src/application/interviewPipeline/types.ts` — `PooledDistributionSummary`, `WeightedItem` types

  **Acceptance Criteria**:
  - [ ] `poolSignals()` implemented as pure function
  - [ ] Deduplication via trigram similarity at configurable threshold
  - [ ] Frequency weights correctly normalized (0-1 range)
  - [ ] No LLM calls made during pooling
  - [ ] Trigram primitives extracted to shared utility
  - [ ] `IdRagStore` updated to use shared primitives
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Pooling correctly merges similar signals
    Tool: Bash (bun test)
    Preconditions: 3 ExtractedInterviewSignals, 2 with similar pain points ("onboarding slow" and "setup takes too long")
    Steps:
      1. Call poolSignals(extractions)
      2. Assert similar pain points are merged into one WeightedItem
      3. Assert weight reflects frequency (2/3 = 0.67)
    Expected Result: Similar signals merged, weights correct
    Evidence: .sisyphus/evidence/task-8-pool-merge.txt

  Scenario: Different signals remain separate
    Tool: Bash (bun test)
    Preconditions: 2 extractions with unrelated pain points
    Steps:
      1. Call poolSignals(extractions)
      2. Assert pain points remain as separate WeightedItems
    Expected Result: Dissimilar signals not merged
    Evidence: .sisyphus/evidence/task-8-pool-different.txt
  ```

  **Commit**: YES (will group with Wave 2 commit)
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 9. Implement sampling function (weighted random draw + inline coherence validation)

  **What to do**:
  - Create a sampling module (e.g., `src/application/interviewPipeline/sampling.ts`):
    - `samplePersonas(distribution: PooledDistributionSummary, personaCount: number, onValidate?: (personas: SampledPersonaSignal[]) => Promise<number[]>): Promise<SampledPersonaSignal[]>`
    - Implement `weightedDraw(items: WeightedItem[], min: number, max: number): WeightedItem[]`:
      - Weighted random selection with replacement
      - Returns between min and max items
    - For each of N personas:
      - Draw pain points (2-4), goals (1-3), values (2-4), feature desires (1-3), decision pattern (1), context role+industry (1 each), communication style (1)
      - Assemble as `SampledPersonaSignal`
    - After all N samples drawn, run coherence validation:
      - Build prompt listing all N sampled signal sets
      - Ask LLM: "For each persona, flag any internal contradictions"
      - Resample flagged contradictions (<10% expected)
    - Target: ~5-10% resample rate

  **Must NOT do**:
  - Do NOT use MCMC, rejection sampling loops, or other complex sampling (simple weighted draw + one validation call)
  - Do NOT run coherence validation per-persona (one batch call for all N)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Algorithmic implementation with one LLM call for validation. Math-heavy but well-scoped.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 1

  **References**:
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:462-505` — Sampling algorithm and coherence validation
  - `src/application/interviewPipeline/types.ts` — `SampledPersonaSignal`, `PooledDistributionSummary` types

  **Acceptance Criteria**:
  - [ ] `samplePersonas()` implemented
  - [ ] Weighted random draw with correct distribution (common items drawn more often)
  - [ ] Coherence validation runs as one batch LLM call
  - [ ] Contradictions detected and resampled
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Weighted draw produces correct distribution
    Tool: Bash (bun test)
    Preconditions: Distribution with one item at 0.9 weight, another at 0.1
    Steps:
      1. Run samplePersonas 1000 times
      2. Count frequency of each item drawn
    Expected Result: High-weight item drawn ~90% of the time
    Evidence: .sisyphus/evidence/task-9-weighted-draw.txt

  Scenario: Coherence validation catches contradictions
    Tool: Bash (bun test with mocked LLM)
    Preconditions: M mock returns a flag for a deliberately contradictory persona
    Steps:
      1. Call samplePersonas with mocked coherence validator
      2. Assert contradictory persona is resampled
    Expected Result: Contradictions detected and resampled
    Evidence: .sisyphus/evidence/task-9-coherence.txt
  ```

  **Commit**: YES (will group with Wave 2 commit)
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 10. Modify GeneratePersonasUseCase for variable count

  **What to do**:
  - Update `src/application/usecases/GeneratePersonasUseCase.ts`:
    - Modify `execute(personaDescription, onProgress?)` to accept an optional `count` parameter:
      ```typescript
      async execute(
        personaDescription: string,
        onProgress?: (progress) => void,
        count?: number  // NEW: default undefined = use existing behavior (backward compat)
      ): Promise<Persona[]>
      ```
    - Pass `count` through to `LlmServicePort.generateInitialPersonas(description, count)`
  - Update `src/infrastructure/adapters/PersonaAdapter.ts`:
    - `generateInitialPersonas(description: string, count?: number): Promise<Persona[]>`
    - When `count` is provided, update the system prompt: "Generate a JSON array of N DISTINCT personas" instead of "Generate a JSON array of 3 DISTINCT personas"
    - When `count` is undefined, default to 3 (backward compatible)
    - Keep the same seeding logic for name assignment (GENDERLESS_NAMES)
  - Update `LlmServicePort.ts`:
    - `generateInitialPersonas(personaDescription: string, count?: number): Promise<Persona[]>`
    - `generateInitialPersonasStream(personaDescription: string, count?: number): AsyncIterable<Partial<Persona>[]>`
  - Update `LlmServiceImpl.ts` delegation to pass count through

  **Must NOT do**:
  - Do NOT change the prompt structure, only the count number
  - Do NOT break existing callers that don't pass count (default to 3)
  - Do NOT change the persona generation logic itself (same Big Five generation, same psychographics)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Well-scoped parameterization of existing code
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 2

  **References**:
  - `src/application/usecases/GeneratePersonasUseCase.ts` — Use case to modify
  - `src/infrastructure/adapters/PersonaAdapter.ts:16-25` — Current hardcoded "3 personas" in system prompt
  - `src/domain/ports/LlmServicePort.ts:16-22` — Port interface to update

  **Acceptance Criteria**:
  - [ ] `count` parameter added to `generateInitialPersonas` in port, use case, and adapter
  - [ ] Default count = 3 for backward compatibility
  - [ ] When count != 3, prompt says N instead of 3
  - [ ] `bunx --bun vitest run` passes (existing tests unchanged)
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Default count = 3 for backward compat
    Tool: Bash (bun test)
    Preconditions: Mock LlmService
    Steps:
      1. Call generateInitialPersonas("test description") without count
      2. Assert prompt string contains "3 personas"
    Expected Result: Generates 3 personas (backward compatible)
    Evidence: .sisyphus/evidence/task-10-default-count.txt

  Scenario: Custom count changes prompt
    Tool: Bash (bun test)
    Preconditions: Mock LlmService
    Steps:
      1. Call generateInitialPersonas("test description", undefined, 10)
      2. Assert prompt string contains "10 personas"
    Expected Result: Generates 10 personas
    Evidence: .sisyphus/evidence/task-10-custom-count.txt
  ```

  **Commit**: YES (will group with Wave 2 commit)
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 11. Implement chunkInterviewSignals function

  **What to do**:
  - Create `chunkInterviewSignals` function (exported from a module, e.g., alongside pooling/sampling or in `src/infrastructure/adapters/IdRagStore.ts`):
    ```typescript
    function chunkInterviewSignals(
      signals: ExtractedInterviewSignals,
      personaId: string
    ): Chunk[]
    ```
  - For each signal category in `ExtractedInterviewSignals`:
    - One chunk per signal item (pain point, goal, value, etc.)
    - Chunk text = the verbatim quote (not the normalized description)
    - Metadata includes: `sourceInterviewId`, `sourceSegmentId`, `signalType` (e.g., "pain_point", "goal"), `topic` (derived from category)
    - Set `chunkType: "interview"`
  - For salient quotes without signal categories:
    - Create one chunk per quote with `signalType: "salient_quote"`
  - Also add a summary chunk per interview that contains the structured context and communication style
  - This function is used by `GeneratePersonasFromInterviewsUseCase` to ingest interview data into ID-RAG

  **Must NOT do**:
  - Do NOT chunk by paragraph (interview chunks are signal-aligned, not paragraph-aligned)
  - Do NOT store the normalized signal text as the chunk text (use verbatim quotes for retrieval relevance)
  - Do NOT modify the existing `chunkBackstory()` function — this is additive

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward data transformation function
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10)
  - **Blocks**: Tasks 15
  - **Blocked By**: Tasks 1, 5

  **References**:
  - `src/infrastructure/adapters/IdRagStore.ts:63-104` — Existing `chunkBackstory()` as pattern reference
  - `src/application/interviewPipeline/types.ts` — `ExtractedInterviewSignals`, `Chunk` types
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:244-256` — InterviewChunk spec (now represented as generic Chunk with chunkType)

  **Acceptance Criteria**:
  - [ ] `chunkInterviewSignals(signals, personaId)` returns `Chunk[]`
  - [ ] Each chunk has verbatim quote as text
  - [ ] Metadata includes signal type, source interview ID, source segment ID
  - [ ] One chunk per signal item + summary chunk per interview
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Interview signals chunked correctly
    Tool: Bash (bun test)
    Preconditions: ExtractedInterviewSignals with 3 pain points, 2 goals, 1 value
    Steps:
      1. Call chunkInterviewSignals(signals, "persona_42")
      2. Assert chunks length = 6 (3 + 2 + 1) + 1 summary = 7
      3. Assert each chunk has chunkType "interview"
      4. Assert each chunk has sourceInterviewId in metadata
    Expected Result: Correct number of chunks with proper metadata
    Evidence: .sisyphus/evidence/task-11-chunking.txt
  ```

  **Commit**: YES (will group with Wave 2 commit)
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 12. Git commit: Wave 2 core components

  **What to do**:
  - Stage all files from Tasks 7-11
  - Verify `bunx --bun tsc --noEmit` and `bunx --bun vitest run` both pass
  - Create comprehensive commit message covering all Wave 2 changes

  **Must NOT do**:
  - Do NOT include Wave 3 changes
  - Do NOT skip test run

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Tasks 7-11)
  - **Blocks**: Wave 3 tasks
  - **Blocked By**: Tasks 7, 8, 9, 10, 11

  **Acceptance Criteria**:
  - [ ] Clean commit with all Wave 2 changes
  - [ ] `bunx --bun vitest run` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **Commit**: YES
  - Message: `feat(pipeline): wave 2 core components — extraction, pooling, sampling, persona count parameterization`
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 13. Implement GeneratePersonasFromInterviewsUseCase (orchestrator)

  **What to do**:
  - Create `src/application/usecases/GeneratePersonasFromInterviewsUseCase.ts`:
    - Constructor takes:
      - `LlmServicePort` (for extraction via InterviewSignalExtractor, generation via GeneratePersonasUseCase)
      - `IdRagStore` (for interview chunk ingestion)
    - `execute(transcripts: { filename: string, content: string }[], onProgress?): Promise<Persona[]>`
    - Orchestrates the full pipeline:
      1. **Extract phase**: Call `llmService.extractInterviewSignals(transcript, interviewId)` for each transcript in parallel (Promise.all)
         - Broadcast progress: "Extracting signals from interview N of M..."
      2. **Pool phase**: Call `poolSignals(allExtractions)` (pure function)
      3. **Sample phase**: Call `samplePersonas(distribution, targetCount)` where targetCount = max(totalInterviews * 2, 10)
         - Inline coherence validation call
         - Broadcast progress: "Sampling personas..."
      4. **Format phase**: Convert each `SampledPersonaSignal` to a formatted `personaDescription` string with source citations
      5. **Generate phase**: Call `GeneratePersonasUseCase.execute(combinedDescription, onProgress, personaCount)`
         - All sampled signals formatted into one description (batched)
         - Broadcast progress: "Generating personas..." through existing GeneratePersonasUseCase progress
      6. **Ingest phase**: For each generated persona, call `chunkInterviewSignals()` and `idRagStore.ingestChunks(personaId, chunks)`
         - Only ingest interview chunks that correspond to this persona's sampled signals
         - Also ingest persona backstory (existing behavior, now through generalized IdRagStore)
      7. **Return phase**: Return PersonaSet (Persona[])
    - Error handling: if extraction fails for some interviews, proceed with successful ones (graceful degradation)
    - Minimum viable: if fewer than 2 interviews succeed, throw error

  **Must NOT do**:
  - Do NOT put file I/O in the use case (action handles that)
  - Do NOT create a separate "cohort engine" or cohort concept
  - Do NOT modify the existing `GeneratePersonasUseCase` signature (use the `count` parameter added in Task 10)
  - Do NOT skip error handling for individual interview extraction failures

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Orchestration logic connecting multiple components. Needs careful error handling and progress streaming.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Wave 2)
  - **Blocks**: Tasks 14
  - **Blocked By**: Tasks 7, 8, 9, 10

  **References**:
  - `src/application/usecases/GeneratePersonasUseCase.ts` — Existing use case pattern (constructor, execute, progress)
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:120-132` — Key integration points table
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:507-543` — Persona generation with interview-derived input
  - `src/application/interviewPipeline/pooling.ts` — `poolSignals` function
  - `src/application/interviewPipeline/sampling.ts` — `samplePersonas` function

  **Acceptance Criteria**:
  - [ ] Use case created and compiles
  - [ ] Orchestrates extract → pool → sample → generate → ingest in order
  - [ ] Parallel extraction: all interviews extracted concurrently
  - [ ] Progress callbacks fired at each phase
  - [ ] Chunk ingestion into IdRagStore for each persona
  - [ ] Handles partial extraction failure (skips failed interviews, continues)
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Full pipeline with mock components
    Tool: Bash (bun test)
    Preconditions: Mock LlmServicePort and IdRagStore. 3 mock transcripts.
    Steps:
      1. Create GeneratePersonasFromInterviewsUseCase with mocks
      2. Call execute(transcripts)
      3. Assert extraction called 3 times
      4. Assert pooling called with 3 extractions
      5. Assert generation called with sampled signals
      6. Assert IdRagStore.ingestChunks called for each persona
    Expected Result: All pipeline steps executed in order
    Evidence: .sisyphus/evidence/task-13-pipeline-flow.txt

  Scenario: Partial extraction failure
    Tool: Bash (bun test)
    Preconditions: Mock that fails extraction for 1 of 3 transcripts
    Steps:
      1. Call execute(transcripts)
      2. Assert no error thrown
      3. Assert pooling receives only 2 successful extractions
    Expected Result: Pipeline continues with successful extractions
    Evidence: .sisyphus/evidence/task-13-partial-failure.txt
  ```

  **Commit**: YES (will group with Wave 3 commit)
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 14. Implement server action for interview upload + pipeline trigger

  **What to do**:
  - Create `src/actions/generatePersonasFromInterviews.ts`:
    - `"use server"` directive
    - Accept `FormData` with uploaded transcript files (or pre-read `{filename, content}[]` for direct API usage)
    - Rate limiting: reuse existing rate limiter from `generatePersonas.ts` or create dedicated limiter
    - File I/O: read each file's content from the FormData
    - Instantiate `LlmServiceImpl` and `IdRagStore` (or receive via DI container — follow existing pattern)
    - Create `GeneratePersonasFromInterviewsUseCase`
    - Call use case with `{filename, content}[]` and progress callbacks
    - Use `createStreamableValue` for progress streaming (follow `generatePersonas.ts` pattern)
    - Return `{ streamData: stream.value }`
    - Broadcast progress phases:
      - `{ step: "UPLOADING" }`
      - `{ step: "EXTRACTING", current: N, total: M }`
      - `{ step: "POOLING" }`
      - `{ step: "SAMPLING" }`
      - `{ step: "GENERATING", ... }` — reuses existing GeneratePersonasUseCase progress
      - `{ step: "DONE", personas: Persona[] }`
      - `{ step: "ERROR", error: string }`

  **Must NOT do**:
  - Do NOT put business logic in the action (thin wrapper only)
  - Do NOT handle audio/video files (text input only for MVP)
  - Do NOT build a UI component (action only, UI is separate work)
  - Do NOT implement file storage/persistence (in-memory pipeline only for MVP)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Server action with file handling, rate limiting, and streaming progress
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 13)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 13

  **References**:
  - `src/actions/generatePersonas.ts` — Existing action pattern (rate limiting, stream, error handling)
  - `src/actions/analyzePricingPage.ts` — FormData/file handling pattern
  - `src/actions/chatWithPersona.ts` — Streaming progress pattern
  - `src/application/usecases/GeneratePersonasFromInterviewsUseCase.ts` — Use case to invoke

  **Acceptance Criteria**:
  - [ ] Server action created in `src/actions/generatePersonasFromInterviews.ts`
  - [ ] Accepts FormData with multiple transcript files
  - [ ] Rate limiting applied
  - [ ] Streaming progress at each pipeline phase
  - [ ] Returns `Persona[]` on success
  - [ ] Returns error message on failure
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Server action streams progress
    Tool: Bash (bun test with mocked use case)
    Preconditions: Mock FormData with 2 text files
    Steps:
      1. Call generatePersonasFromInterviewsAction(formData)
      2. Assert stream receives UPLOADING, EXTRACTING, POOLING, SAMPLING, GENERATING, DONE steps
    Expected Result: Full progress stream
    Evidence: .sisyphus/evidence/task-14-action-stream.txt
  ```

  **Commit**: YES (will group with Wave 3 commit)
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 15. Wire interview chunk retrieval into IdRagService

  **What to do**:
  - Update `src/infrastructure/adapters/IdRagService.ts`:
    - `retrieveContext(persona, query, k)` already works with the generic IdRagStore
    - Add source metadata injection: when returning context for interview chunks, annotate with `sourceInterviewId` and `signalType`
    - Update `formatRetrievedContext()` if needed to show interview source metadata
  - This task may be a no-op if Tasks 5 and 11 already handle everything correctly
  - Verify that `ChatAdapter.ts` picks up interview chunks in its existing ID-RAG retrieval without changes
    - `chatWithPersonaStream()` calls `ragService.retrieveContext(persona, message, 3)` — this should now return both backstory and interview chunks
    - The `<<RETRIEVED MEMORY>>` section of the system prompt should contain both types
  - Verify traceability: interview chunks carry `sourceInterviewId` in metadata, which the prompt compiler can use for citation display

  **Must NOT do**:
  - Do NOT modify ChatAdapter.ts (it should work automatically through IdRagService)
  - Do NOT modify PersonaPromptCompiler.ts (compartmentalized prompts unchanged)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification task — minimal code changes expected
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Tasks 5, 11)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 11

  **References**:
  - `src/infrastructure/adapters/IdRagService.ts` — Service layer to verify/update
  - `src/infrastructure/adapters/ChatAdapter.ts:52-56` — Current retrieveContext call
  - `src/infrastructure/adapters/PersonaPromptCompiler.ts:199-201` — <<RETRIEVED MEMORY>> section

  **Acceptance Criteria**:
  - [ ] IdRagService.retrieveContext returns both backstory and interview chunks
  - [ ] Interview chunks carry sourceInterviewId in metadata
  - [ ] ChatAdapter doesn't need changes — interview chunks flow through existing retrieval
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: ChatAdapter retrieves interview chunks
    Tool: Bash (bun test)
    Preconditions: IdRagStore with both backstory and interview chunks for a persona
    Steps:
      1. Call IdRagService.retrieveContext(persona, "onboarding experience")
      2. Assert results include both backstory and interview chunks
      3. Assert interview chunks have sourceInterviewId in metadata
    Expected Result: Merged retrieval with proper metadata
    Evidence: .sisyphus/evidence/task-15-merged-retrieval.txt
  ```

  **Commit**: YES (will group with Wave 3 commit)
  - Pre-commit: `bunx --bun tsc --noEmit`

- [x] 16. Git commit: Wave 3 integration

  **What to do**:
  - Stage all files from Tasks 13-15
  - Verify `bunx --bun tsc --noEmit` and `bunx --bun vitest run` both pass
  - Create comprehensive commit message

  **Must NOT do**:
  - Do NOT include Wave 4 changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Tasks 13-15)
  - **Blocks**: Wave 4 tasks
  - **Blocked By**: Tasks 13, 14, 15

  **Acceptance Criteria**:
  - [ ] Clean commit with all Wave 3 changes
  - [ ] `bunx --bun vitest run` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **Commit**: YES
  - Message: `feat(pipeline): wave 3 integration — orchestrator, server action, ID-RAG wiring`
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 17. Tests for pooling + sampling functions

  **What to do**:
  - Write tests for pooling:
    - `src/application/interviewPipeline/__tests__/pooling.test.ts`
    - Test: merges similar signals via trigram similarity
    - Test: different signals remain separate
    - Test: correct frequency normalization (2/3 = 0.67 weight)
    - Test: empty extraction array returns empty PooledDistributionSummary
    - Test: single interview returns single-item weights (1.0)
    - Test: source examples correctly attached to WeightedItems
  - Write tests for sampling:
    - `src/application/interviewPipeline/__tests__/sampling.test.ts`
    - Test: weighted draw returns items with correct distribution (statistical test)
    - Test: sampled persona has correct structure (all signal types present)
    - Test: coherence validation resamples contradictions
    - Test: empty distribution returns empty array
    - Test: handle case where personaCount > available signal variety

  **Must NOT do**:
  - Do NOT test LLM adapter behavior here (separate test file for InterviewSignalExtractor)
  - Do NOT make real LLM calls in unit tests (mock where needed)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Pure function unit tests with statistical assertions
  - **Skills**: `["test-driven-development"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 18, 19, 20, 21, 22)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 8, 9

  **References**:
  - `src/domain/entities/__tests__/Persona.test.ts` — Existing test pattern
  - `src/infrastructure/adapters/__tests__/IdRagStore.test.ts` — Existing test pattern for retrieval functions
  - `src/application/interviewPipeline/pooling.ts` — Function to test
  - `src/application/interviewPipeline/sampling.ts` — Function to test

  **Acceptance Criteria**:
  - [ ] All pooling tests pass
  - [ ] All sampling tests pass
  - [ ] Trigram dedup tested with realistic text
  - [ ] Weighted draw distribution statistically verified
  - [ ] `bunx --bun vitest run` passes

  **QA Scenarios**:
  ```
  Scenario: Test suite runs successfully
    Tool: Bash (bun)
    Steps:
      1. Run `bunx --bun vitest run src/application/interviewPipeline/__tests__/`
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-17-test-results.txt
  ```

  **Commit**: YES (will group with Wave 4 commit)
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 18. Tests for InterviewSignalExtractor

  **What to do**:
  - Write tests in `src/infrastructure/adapters/__tests__/InterviewSignalExtractor.test.ts`:
    - Test: extracts all signal types from realistic transcript (mocked LLM response)
    - Test: handles malformed LLM JSON response gracefully (falls back with error)
    - Test: handles empty transcript (returns empty arrays)
    - Test: handles very long transcript (verifies truncation or chunking — decide based on max tokens)
    - Test: verifies each extracted signal carries a verbatim quote (not paraphrased)
  - Mock `LlmServiceImpl.createChatCompletion()` to return controlled JSON
  - Verify prompt structure matches spec (system + user message, response_format: json_object)

  **Must NOT do**:
  - Do NOT make real LLM calls in tests (mock the LLM)
  - Do NOT test end-to-end pipeline here (that's Task 22)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Adapter tests with mocked LLM responses
  - **Skills**: `["test-driven-development"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 17, 19, 20, 21, 22)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:
  - `src/infrastructure/adapters/__tests__/PbjScaffoldEnhancer.test.ts` — Existing adapter test pattern
  - `src/infrastructure/adapters/InterviewSignalExtractor.ts` — Adapter to test
  - `docs/INTERVIEW_TO_PERSONA_PIPELINE.md:375-442` — Extraction prompt and output schema

  **Acceptance Criteria**:
  - [ ] Extract returns correct signal types from mocked LLM response
  - [ ] Malformed JSON handled gracefully
  - [ ] Empty transcript returns empty arrays
  - [ ] Verbatim quotes verified in output
  - [ ] `bunx --bun vitest run` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **Commit**: YES (will group with Wave 4 commit)
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 19. Tests for GeneratePersonasFromInterviewsUseCase

  **What to do**:
  - Write tests in `src/application/usecases/__tests__/GeneratePersonasFromInterviewsUseCase.test.ts`:
    - Test: full pipeline orchestration with mocked LlmServicePort and IdRagStore
    - Test: extraction phase runs all interviews in parallel (verify all called)
    - Test: pooling receives correct extraction results
    - Test: sampling produces correct number of personas
    - Test: generation receives correctly formatted persona descriptions
    - Test: ingestion into IdRagStore happens for each persona
    - Test: progress callbacks fired at each phase
    - Test: handles partial extraction failure (1 of 3 fails, 2 succeed)
    - Test: handles all extractions failing (throws error)
    - Test: handles empty transcript array (throws error)

  **Must NOT do**:
  - Do NOT make real LLM calls or test real adapters
  - Do NOT duplicate tests from Tasks 17-18 (focus on orchestration)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive use case orchestration tests
  - **Skills**: `["test-driven-development"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 17, 18, 20, 21, 22)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 13

  **References**:
  - `src/application/usecases/__tests__/GeneratePersonasUseCase.test.ts` — Existing use case test pattern
  - `src/application/usecases/GeneratePersonasFromInterviewsUseCase.ts` — Use case to test

  **Acceptance Criteria**:
  - [ ] All orchestration paths tested
  - [ ] Error handling tested (partial failure, all failure, empty input)
  - [ ] Progress callbacks verified at each phase
  - [ ] `bunx --bun vitest run` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **Commit**: YES (will group with Wave 4 commit)
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 20. Tests for IdRagStore generalization + interview chunk retrieval

  **What to do**:
  - Write tests in `src/infrastructure/adapters/__tests__/IdRagStore.test.ts` (add to existing file):
    - Test: backstory chunks stored with chunkType "backstory"
    - Test: interview chunks stored with chunkType "interview"
    - Test: both chunk types retrieved together in retrieve()
    - Test: formatRetrievedContext shows correct metadata per chunk type
    - Test: ingestChunks adds chunks to existing persona (alongside backstory chunks)
    - Test: clearing a persona removes all chunks (both types)
  - Update existing tests if they reference `BackstoryChunk` type (now `Chunk`)
  - Ensure all existing tests still pass unchanged

  **Must NOT do**:
  - Do NOT remove or modify existing tests (add new tests alongside)
  - Do NOT delete the existing test file and rewrite it

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Adding tests to existing test file
  - **Skills**: `["test-driven-development"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 17, 18, 19, 21, 22)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 11, 15

  **References**:
  - `src/infrastructure/adapters/__tests__/IdRagStore.test.ts` — Existing test file to extend
  - `src/infrastructure/adapters/IdRagStore.ts` — Store implementation
  - `src/application/interviewPipeline/types.ts` — Chunk type

  **Acceptance Criteria**:
  - [ ] New tests pass for interview chunk storage + retrieval
  - [ ] Existing tests still pass unchanged
  - [ ] Both chunk types returned from single retrieve() call
  - [ ] Format correctly distinguishes chunk types
  - [ ] `bunx --bun vitest run` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **Commit**: YES (will group with Wave 4 commit)
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 21. Tests for PsychographicRationalizer port conversion

  **What to do**:
  - Update existing test file after rename: `src/infrastructure/adapters/__tests__/PsychographicRationalizer.test.ts` (was `PbjScaffoldEnhancer.test.ts`):
    - Update all imports from `PbjScaffoldEnhancer` to `PsychographicRationalizer`
    - Update test descriptions to use new name
    - Ensure all existing test logic passes unchanged
  - Add new tests for `rationalizePersonas`:
    - Test: calls createChatCompletion for each scaffold type
    - Test: handles partial scaffold failures gracefully (Promise.allSettled)
    - Test: rationales appended to persona backstory correctly
    - Test: empty persona returns empty rationales
  - Verify `LlmServicePort.rationalizePersonas()` is called from `GeneratePersonasUseCase`

  **Must NOT do**:
  - Do NOT change scaffold prompts or rationale generation logic
  - Do NOT delete existing tests — update and extend

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Test updates + port conversion verification
  - **Skills**: `["test-driven-development"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 17, 18, 19, 20, 22)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **References**:
  - `src/infrastructure/adapters/__tests__/PbjScaffoldEnhancer.test.ts` — Existing tests to update
  - `src/infrastructure/adapters/PsychographicRationalizer.ts` — Adapter to test
  - `src/domain/ports/LlmServicePort.ts` — Port interface verification

  **Acceptance Criteria**:
  - [ ] All test imports updated to PsychographicRationalizer
  - [ ] Existing tests pass unchanged
  - [ ] New tests added for rationalizePersonas method
  - [ ] `bunx --bun vitest run` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Tests pass after rename
    Tool: Bash (bun)
    Steps:
      1. Run `bunx --bun vitest run src/infrastructure/adapters/__tests__/PsychographicRationalizer.test.ts`
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-21-test-pass.txt
  ```

  **Commit**: YES (will group with Wave 4 commit)
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 22. Integration test: full pipeline with mock transcripts

  **What to do**:
  - Create `src/application/usecases/__tests__/GeneratePersonasFromInterviewsUseCase.integration.test.ts`:
    - Use real `InterviewSignalExtractor` with mocked `LlmService` for controlled extraction
    - Use real pooling and sampling functions
    - Use real `GeneratePersonasUseCase` with mocked `LlmService` for controlled persona generation
    - Use real `IdRagStore`
    - Provide 3 mock interview transcripts with known signal distribution
    - Verify:
      - N personas produced (N > 3, e.g., 6-8)
      - Each persona has complete fields
      - Interview chunks ingested into IdRagStore
      - Retrieval returns both backstory and interview chunks
      - FormatRetrievedContext shows correct chunk-type metadata

  **Must NOT do**:
  - Do NOT make real LLM calls (mock all LLM interactions)
  - Do NOT test the server action

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: End-to-end integration test with orchestrated mocks
  - **Skills**: `["test-driven-development"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 17, 18, 19, 20, 21)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 13, 15

  **References**:
  - `test/persona-system-e2e.test.ts` — Existing E2E test pattern
  - `src/infrastructure/adapters/__tests__/PersonaSystemIntegration.test.ts` — Existing integration test pattern
  - `src/application/usecases/GeneratePersonasFromInterviewsUseCase.ts` — Use case under test

  **Acceptance Criteria**:
  - [ ] Integration test passes with all mocked components
  - [ ] N personas produced
  - [ ] Complete persona fields verified
  - [ ] Interview chunk retrieval works end-to-end
  - [ ] `bunx --bun vitest run` passes

  **QA Scenarios**:
  ```
  Scenario: Integration test runs
    Tool: Bash (bun)
    Steps:
      1. Run `bunx --bun vitest run src/application/usecases/__tests__/GeneratePersonasFromInterviewsUseCase.integration.test.ts`
    Expected Result: All integration tests pass
    Evidence: .sisyphus/evidence/task-22-integration-pass.txt
  ```

  **Commit**: YES (will group with Wave 4 commit)
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

- [x] 23. Git commit: Wave 4 tests

  **What to do**:
  - Stage all files from Tasks 17-22
  - Verify `bunx --bun tsc --noEmit` and `bunx --bun vitest run` both pass
  - Create comprehensive commit message

  **Must NOT do**:
  - Do NOT skip test run

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Tasks 17-22)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 17, 18, 19, 20, 21, 22

  **Acceptance Criteria**:
  - [ ] Clean commit with all Wave 4 changes
  - [ ] `bunx --bun vitest run` passes
  - [ ] `bunx --bun tsc --noEmit` passes

  **Commit**: YES
  - Message: `test(pipeline): wave 4 tests — unit + integration tests for all pipeline components`
  - Pre-commit: `bunx --bun tsc --noEmit && bunx --bun vitest run`

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Pre-commit |
|------|---------------|------------|
| Wave 1 | `feat(pipeline): wave 1 — types, ports, adapter renames, IdRag generalization` | `tsc --noEmit && vitest run` |
| Wave 2 | `feat(pipeline): wave 2 — extraction, pooling, sampling, persona count param` | `tsc --noEmit && vitest run` |
| Wave 3 | `feat(pipeline): wave 3 — orchestrator, server action, ID-RAG wiring` | `tsc --noEmit && vitest run` |
| Wave 4 | `test(pipeline): wave 4 — unit + integration tests` | `tsc --noEmit && vitest run` |

---

## Success Criteria

### Verification Commands
```bash
bunx --bun tsc --noEmit          # No type errors
bunx --bun vitest run             # All tests pass
bunx --bun vitest run src/application/interviewPipeline/__tests__/  # New pipeline unit tests
bunx --bun vitest run src/application/usecases/__tests__/GeneratePersonasFromInterviewsUseCase.integration.test.ts  # Integration test
```

### Final Checklist
- [ ] All "Must Have" present and verified
- [ ] All "Must NOT Have" absent (no scope creep)
- [ ] `bunx --bun vitest run` passes
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Interview pipeline produces N personas from M transcripts (verified via integration test)
- [ ] ID-RAG retrieval includes both backstory and interview chunks
- [ ] PsychographicRationalizer generates rationales on-demand (no dynamic import)
- [ ] HtmlSummarizer works identically to old ExtractionAdapter
