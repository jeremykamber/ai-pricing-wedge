2026-05-24: Created application-layer types for interview -> persona pipeline.

Notes:
- Kept interfaces pure, no methods.
- Placed file under src/application/interviewPipeline/types.ts as requested.
- LSP server not installed in environment; ran tsc which surfaced unrelated type errors in Persona tests (existing project CI errors). Our new file is type-correct.

Gotchas:
- The repo contains strict Persona interface used widely; adding application types did not require importing domain types.

2026-05-24: Implemented sampling.ts (weightedDraw + samplePersonas)

Notes:
- `SampledPersonaSignal.decisionPattern` is `ExtractedSignal`, not `WeightedItem` — requires conversion via `toExtractedSignal()` helper
- `context.role`, `context.industry`, `communicationStyle` are `WeightedItem` — no conversion needed, used directly
- `WeightedItem.sourceExamples` provides the `quote` field for synthetic `ExtractedSignal` creation
- `weightedDraw` uses **without replacement** within a single draw (no duplicate items for one persona's category), but different persona draws can get the same items (replacement across draws)
- Coherence validation is injected as an `onValidate` callback — sampling module makes zero LLM calls
- Retry logic: up to 3 batch-level retries, replacing only contradictory indices each round
