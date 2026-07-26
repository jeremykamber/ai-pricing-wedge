# Persona Modeling Philosophy Implementation

Implemented Mar 2025 as PR #62 on feat/persona-modeling-overhaul branch.

## Dual-mode generation

Three modes with distinct rules:

| Mode | Evidence | Invention | Backstory | Use case |
|------|----------|-----------|-----------|----------|
| research | Required | None/minimal | 2-3 sentences, evidence-only | Interview-based personas |
| strategy | Allowed | Controlled | Rich storytelling | ICP/market personas |
| cluster | Required | Cluster-level | Minimal | Multi-interview synthesis |

## Key files

- `src/domain/entities/Persona.ts` — new fields: generationMode, behavioralDimensions, provenance, evidenceLinks, clusterInfo, identityContext, situationContext, counterfactualTest
- `src/domain/entities/PersonaProvenance.ts` — tier labeling (observed/interpreted/synthetic), per-attribute confidence
- `src/domain/entities/BehavioralDimension.ts` — context-specific behavioral axes (supplements Big Five)
- `src/domain/dtos/PersonaGenerationConfig.ts` — config types for each generation mode (shared base schema, no discriminator in configs since method name IS the discriminator)
- `src/domain/ports/LlmServicePort.ts` — new methods for research/strategy/cluster generation + streaming + counterfactual test
- `src/infrastructure/adapters/PersonaAdapter.ts` — shared parsePersonaList/extractBaseFields/extractBehavioralDimensions helpers, mode-specific prompts
- `src/application/usecases/GeneratePersonasUseCase.ts` — mode dispatch

## Philosophy principles encoded

1. Every persona detail should explain a decision, behavior, or need (not be a biography)
2. Don't invent details that CREATE behavior; only invent details that EXPLAIN behavior
3. Identity vs situation distinction: identityContext (stable traits) vs situationContext (contextual behavior)
4. Counterfactual removal test: "If this detail were false, would the team make a different product decision?"
5. Provenance: every attribute tracks its tier (observed/interpreted/synthetic) and confidence

## Tests

64 tests across domain, infrastructure, and application layers covering all three modes, count validation, error handling, and type safety.
