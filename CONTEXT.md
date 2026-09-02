# Kynd — Interview-to-Persona Pipeline

Context for the interview-to-persona pipeline: ingesting user interview transcripts, extracting observable signals, pooling them across participants, and sampling coherent synthetic personas from the distribution.

## Language

**Interview**:
A single recorded conversation with one research participant. One transcript file = one Interview.
_Avoid_: Transcript file, participant session

**ExtractedInterviewSignals**:
The structured output of analyzing one Interview — pain points, goals, values, feature desires, decision patterns, context, communication style, and salient quotes, each with verbatim source attribution.

**PooledDistributionSummary**:
A frequency-weighted aggregate of signals across all interviews in a batch. Not a stored entity — computed on-the-fly.

**SampledPersonaSignal**:
A single persona's signal set drawn from the pooled distribution via weighted random sampling. Fed into `GeneratePersonasUseCase` for persona construction.

**Persona**:
A complete synthetic user with Big Five traits, psychographic spec, epistemic boundaries, behavioral guardrails, and narrative backstory. Schema is unchanged — all required fields already exist in `src/domain/entities/Persona.ts`.

**ID-RAG (Identity Retrieval-Augmented Generation)**:
A two-tier retrieval system: (1) persona backstory chunks + (2) interview-derived chunks, retrieved at chat time to ground persona responses in both identity and source evidence.

**PersonaSet**:
The set of personas generated from one pipeline run. Queryable with simple predicates. Not a separate domain entity — an array of Persona with filter helpers.
_Avoid_: Cohort (overloaded term)

## Relationships

- An **Interview** produces exactly one **ExtractedInterviewSignals**
- **ExtractedInterviewSignals** are pooled into one **PooledDistributionSummary** per batch
- A **PooledDistributionSummary** is sampled into N **SampledPersonaSignal** sets (N > interview count)
- Each **SampledPersonaSignal** is fed to `GeneratePersonasUseCase` → produces one **Persona**
- A **Persona** has backstory chunks AND interview chunks ingested into **ID-RAG**
- ID-RAG retrieval at chat time returns both backstory and interview chunks with source metadata

## Example dialogue

> **Dev:** "So an interview upload triggers the whole pipeline? Extract, pool, sample, generate — all in one action?"
> **Domain expert:** "Yes. One server action triggers `GeneratePersonasFromInterviewsUseCase` which orchestrates extraction (parallel LLM calls), pooling (pure math), sampling (weighted draw + one validation call), then feeds each sampled signal into the existing persona generation flow."

## Flagged ambiguities

- **"Cohort"** was used to mean both the output set of a pipeline run and a filtered subset — resolved: use **PersonaSet** for the output set; filtering is a simple array predicate, not a new concept
- **"ExtractionAdapter"** was used to mean two different things: the existing `ExtractionAdapter` does HTML→markdown summarization for pricing pages; the pipeline proposed a second `ExtractionAdapter` for transcript→signals — resolved: rename the existing adapter to `HtmlSummarizer`, place the new interview extraction in `InterviewSignalExtractor`
- **ExtractedInterviewSignals** was proposed as a domain entity but has no business logic — resolved: define it as an application-layer type alongside pooling/sampling logic, not in `src/domain/entities/`
- **IdRagStore extension**: initially considered two separate stores (BackstoryChunkStore + InterviewChunkStore) but that violated DRY — resolved: generalize `IdRagStore` to store a generic `Chunk` with `chunkType: "backstory" | "interview"` and `metadata: Record<string, unknown>`. Retrieve/format is type-agnostic. Chunking logic lives in separate functions (`chunkBackstory`, `chunkInterviewSignals`).
- **Psychographic tweaking**: the pipeline doc described tweaking as "modify input → repeat step 4" of GeneratePersonasUseCase, but that use case generates from scratch — resolved: add `rerationalizePersona` method to `LlmServicePort` for lightweight PB&J-only regeneration via `PsychographicRationalizer`
- **Pipeline orchestrator**: where the 7-step flow lives — resolved: single `GeneratePersonasFromInterviewsUseCase` in `src/application/usecases/`. Action stays thin. Composes `InterviewSignalExtractor`, pure pooling/sampling functions, existing `GeneratePersonasUseCase`, and `IdRagStore`.
- **Adapter renames**: `PbjScaffoldEnhancer` → `PsychographicRationalizer`; `ExtractionAdapter` → `HtmlSummarizer`. Both converted to proper port implementors (Pattern A) with constructor injection and delegation methods on `LlmServicePort`.
