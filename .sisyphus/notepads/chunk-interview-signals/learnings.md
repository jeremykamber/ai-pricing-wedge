Implemented chunkInterviewSignals

- What I changed:
  - Added src/application/interviewPipeline/chunkInterviewSignals.ts which converts
    ExtractedInterviewSignals into IdRagStore Chunk[].

- Key decisions / conventions used:
  - Each signal (painPoints, goals, values, featureDesires, decisionPatterns)
    maps to a signalType (pain_point, goal, value, feature_desire, decision_pattern).
  - Chunk.text uses the verbatim `quote` field (not normalized `text`).
  - Metadata includes sourceInterviewId, sourceSegmentId (when available), signalType, and topic.
  - Salient quotes are emitted as `salient_quote` chunks.
  - A single interview summary chunk contains a JSON string of { context, communicationStyle }
    and a counts object in metadata to aid retrieval filtering.
  - Chunk ids follow the pattern: `chunk-{personaId}-interview-{category}-{idx}`.

- Notes / next steps:
  - Running `bunx --bun tsc --noEmit` failed across the repo due to pre-existing
    TypeScript errors unrelated to this change (Persona type mismatches, missing properties,
    and some test errors). The new file itself is self-contained and should type-check
    in isolation.
  - lsp_diagnostics could not run due to missing typescript-language-server in the environment.
