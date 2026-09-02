# Kynd Persona Inference-Time Construction System

> **Overhaul based on:** Literature Review — *Inference-Time Methods for High-Fidelity LLM Persona Construction* (Section 9: Applications of the Literature)

## Overview

This document describes the inference-time persona construction system implemented for Kynd. Each technique is grounded in peer-reviewed research and implemented as a modular, testable component following the hexagonal architecture.

### Files Created/Modified

| File | Technique | Description |
|------|-----------|-------------|
| `src/infrastructure/adapters/PersonaPromptCompiler.ts` | T1+T3 | Compartmentalized prompt builder + persona anchors |
| `src/infrastructure/adapters/PbjScaffoldEnhancer.ts` | T2 | PB&J psychological scaffold rationalization |
| `src/infrastructure/adapters/IdRagStore.ts` | T4 | In-memory vector store for ID-RAG |
| `src/infrastructure/adapters/IdRagService.ts` | T4 | ID-RAG service (ingestion + retrieval) |
| `src/infrastructure/adapters/InCharacterEvaluator.ts` | T5 | Psychometric interview evaluation |
| `src/infrastructure/adapters/PiconEvaluator.ts` | T6 | Multi-turn consistency interrogation |
| `src/infrastructure/adapters/ChatAdapter.ts` | T1+T3 | Updated to use compartmentalized prompts |
| `src/domain/entities/Persona.ts` | T1 | Added epistemic boundaries, guardrails fields |
| `src/infrastructure/adapters/__tests__/PersonaPromptCompiler.test.ts` | Tests | 7 unit tests |
| `src/infrastructure/adapters/__tests__/PbjScaffoldEnhancer.test.ts` | Tests | 4 unit tests |
| `src/infrastructure/adapters/__tests__/IdRagStore.test.ts` | Tests | 8 unit tests |
| `src/infrastructure/adapters/__tests__/InCharacterEvaluator.test.ts` | Tests | 5 unit tests |
| `src/infrastructure/adapters/__tests__/PiconEvaluator.test.ts` | Tests | 4 unit tests |
| `src/infrastructure/adapters/__tests__/PersonaSystemIntegration.test.ts` | Tests | 6 integration tests |
| `test/persona-system-e2e.test.ts` | Tests | 10 E2E verification tests |

**Total: 44 new tests, all passing.**

---

## Technique 1: Synthetic Persona Generation via Backstories (Enhanced)

**Research Basis:** Moon et al. (2024) — *Virtual Personas for Language Models via an Anthology of Backstories* (EMNLP 2024), Joshi et al. (2025) — *Improving LLM Personas via Rationalization with Psychological Scaffolds* (Findings of EMNLP 2025)

**What changed:** The existing backstory generation was enhanced with PB&J-style psychological scaffold rationalization. Backstories are now automatically chunked with metadata tags for ID-RAG retrieval.

**PB&J Scaffolds** (`PbjScaffoldEnhancer.ts`):
1. **Big Five Personality Roots** — Explains why the persona has each trait level based on plausible life experiences
2. **Cognitive-Reflex Decision Style** — Describes System 1 vs System 2 thinking manifestations
3. **Core Values & Risk Worldview** — Articulates values around money, risk, efficiency, trust

Each scaffold generates a post-hoc rationale in parallel, with graceful degradation if individual scaffolds fail. Rationales are formatted as a `<<PSYCHOLOGICAL RATIONALES (PB&J)>>` appendix that can augment the backstory.

**Test verification:**
- `PbjScaffoldEnhancer.test.ts` — 4 tests (generation, formatting, partial failures, empty results)

---

## Technique 2: Compartmentalized Persona Prompts

**Research Basis:** Wang et al. (2024b) — *From Persona to Personalization: A Survey on Role-Playing Language Agents* (TMLR 2024)

**What changed:** Created `PersonaPromptCompiler` that builds prompts using a four-component architecture with clear delimiters. The `ChatAdapter` now uses the compiler instead of flat `stringifyPersona()`.

**Architecture (each section is delimited to prevent attention dilution):**

```
<<PERSONA IDENTITY>>
Name, age, occupation, education, interests, goals, traits
Design style, living environment, life story

<<PSYCHOGRAPHIC PROFILE>>
Big Five (OCEAN) scores 0-100 with behavioral mappings
Cognitive Reflex (System 1 vs System 2)
Technical fluency, economic sensitivity
CORE RULE: scalars are root cause of behavior

<<EPISTEMIC BOUNDARIES>>
You know: [domain expertise]
You do NOT know: [epistemic boundaries]

<<BEHAVIORAL GUARDRAILS>>
Response Constraints: [format rules]
Refusal Patterns: [behaviors to decline]
```

**Persona entity extended with:**
- `domainExpertise?: string[]` — Knowledge domains
- `epistemicBoundaries?: string[]` — What the persona doesn't know
- `responseConstraints?: string[]` — Format rules
- `refusalPatterns?: string[]` — Behaviors to decline

**Test verification:**
- `PersonaPromptCompiler.test.ts` — 7 tests (sections, anchors, RAG, multi-turn, boundaries, guardrails)

---

## Technique 3: Persona Anchors (SyTTA-style)

**Research Basis:** Xu et al. (2026) — *You only need 4 extra tokens: Synergistic Test-time Adaptation for LLMs* (ICLR 2026); Atri et al. (2026) — *Evaluating temporal consistency in multi-turn language models*

**What changed:** Before every agent turn, a short persona anchor (4-16 tokens) is injected immediately before the user message. This combats the "lost in the middle" phenomenon and attention decay over multi-turn interactions.

**Anchor generation** (`PersonaPromptCompiler.generateAnchor()`):
- Archetype detection based on Big Five scores
- Produces anchors like: `"As a cautious, risk-aware manager:"`, `"As a passionate first-time founder:"`, `"As an analytical, numbers-driven expert:"`
- 9 archetypes covering different personality profiles

**Mechanism:** The anchor is injected via `compileChatMessage()` which prepends the anchor to the user message. The anchor index resets for fresh interactions.

**Test verification:**
- Anchors verified to be 4-16 tokens
- Different profiles → different anchors
- Anchor injected before every turn

---

## Technique 4: Factual Grounding via ID-RAG

**Research Basis:** Tan et al. (2025) — *ID-RAG: Identity Retrieval-Augmented Generation for Long-Horizon Persona Coherence in Generative Agents*

**What changed:** Implemented a two-tier hybrid architecture:

**Tier 1 — Identity Store** (`IdRagStore.ts`):
- Backstory is broken into paragraph-level chunks with metadata
- Each chunk tagged with: `topic` (keyword-matched), `emotionalTone` (positive/negative/neutral/mixed), `relatedChunkIds` (adjacent + same-topic), `relationshipType`
- Semantic similarity via character trigram fingerprinting + cosine similarity
- No external dependencies — works server-side

**Tier 2 — Retrieval** (`IdRagService.ts`):
- `retrieveContext(persona, query, k=3)` → top-K most relevant chunks
- `formatRetrievedContext()` → prompt-ready string with topic/tone metadata
- `indexPersona(persona)` → ingest full backstory

**Hybrid prompt assembly** via `PersonaPromptCompiler.compileInteractionPrompt()`:
Compartmentalized prompt + `<<RETRIEVED MEMORY>>` section + persona anchor

**Test verification:**
- `IdRagStore.test.ts` — 8 tests (chunking, retrieval, ranking, formatting, edge cases)
- `PersonaSystemIntegration.test.ts` — Tests full hybrid prompt assembly

---

## Technique 5: InCharacter-Style Evaluation

**Research Basis:** Wang et al. (2024a) — *InCharacter: Evaluating Personality Fidelity in Role-Playing Agents through Psychological Interviews* (ACL 2024)

**What changed:** Created `InCharacterEvaluator` that implements the interview-based evaluation protocol:

1. **Interview Protocol** — 10 open-ended questions mapped to Big Five dimensions (2 per trait)
2. **Response Collection** — Persona answers each question naturally
3. **Expert Evaluation** — A separate "expert" LLM (blinded) evaluates the transcript for trait evidence
4. **Score Parsing** — Extracts 0-100 scores for each OCEAN dimension from expert analysis

**Key insight from the paper:** Self-report personality tests on LLMs are unreliable (max 67.1% dimensional accuracy). Interview-based evaluation achieves 76.6% because it avoids the alignment conflict between instruction-following and persona maintenance.

**Test verification:**
- `InCharacterEvaluator.test.ts` — 5 tests (question protocol, interview, expert analysis, score parsing, full evaluation)

---

## Technique 6: PICon-Style Consistency Interrogation

**Research Basis:** Kim et al. (2026) — *PICon: A Multi-Turn Interrogation Framework for Evaluating Persona Agent Consistency* (arXiv:2603.25620)

**What changed:** Created `PiconEvaluator` that probes persona agents through logically chained multi-turn questioning, evaluating three consistency dimensions:

1. **Internal Consistency** — Does the persona contradict itself? Expert LLM compares cross-turn claims.
2. **External Consistency** — Do factual claims align with the backstory? Expert LLM cross-references against established persona profile.
3. **Retest Consistency** — Does the persona give the same answers to repeated questions? Compares initial vs retest sessions.

**Interrogation protocol:** 8 chained questions where later questions reference earlier answers. Retest uses 3 repeated questions from the initial session.

**Output:** Structured `PiconResult` with scores (0-100) for each dimension, total score, contradiction list, and detailed breakdown.

**Test verification:**
- `PiconEvaluator.test.ts` — 4 tests (interrogation, retest, internal consistency, full evaluation)

---

## Integration & E2E Tests

**`PersonaSystemIntegration.test.ts`** — 6 tests verifying:
- Compartmentalized prompts + anchors combined correctly
- ID-RAG chunking + retrieval with realistic multi-paragraph backstory
- Different queries return different results
- Full hybrid prompt assembly (all components together)

**`test/persona-system-e2e.test.ts`** — 10 E2E tests verifying:
- Full pipeline from persona definition → compiled prompt → anchor → RAG → hybrid assembly
- Multi-turn conversation simulation
- Edge cases: empty backstory, unknown persona, different profiles
- Can run without any LLM calls (pure unit/integration tests)

---

## Architecture Diagram

```
Persona Entity
  ├── enhanced with epistemic boundaries + guardrails (T1)
  ├── backstory chunked by IdRagStore (T4)
  └── PBJScaffoldEnhancer generates psychological rationales (T2)

Interaction Flow:
  ChatAdapter
  ├── PersonaPromptCompiler
  │   ├── compileSystemPrompt() → 4 compartmentalized sections (T1)
  │   ├── generateAnchor() → 4-16 token persona anchor (T3)
  │   └── compileInteractionPrompt() → hybrid prompt (T4)
  └── IdRagService
      └── retrieveContext() → top-3 relevant chunks (T4)

Evaluation (offline):
  InCharacterEvaluator → interview + expert analysis (T5)
  PiconEvaluator → interrogation + 3 consistency scores (T6)
```

---

## Running the Tests

```bash
# All new persona inference tests
bunx --bun vitest run src/infrastructure/adapters/__tests__/

# E2E pipeline verification (no LLM needed)
bunx --bun vitest run test/persona-system-e2e.test.ts

# All tests
bunx --bun vitest run
```
