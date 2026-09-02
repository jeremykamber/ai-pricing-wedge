# persona-a-profile-backstory

Status: accepted

Decision: Split persona generation into a batched profile call, per-persona parallel backstory calls (named, third-person), then the existing PB&J rationalization pass.

Context: One LLM call generated every persona's full structure at once — slow, one failure surface, and field-skipping under output-budget pressure (backstory usually dropped last).

Alternatives: two-phase batched backstories (b); per-persona parallel profiles (rejected — same-input parallel calls homogenize, diversity needs in-batch prompting); lazy/on-demand backstories (rejected — verify judge requires backstory at generation time); stream+salvage single-call (doesn't fix the latency wall).

Reason: smallest coherent change — reuses generatePersonaArray, rationalizePersonas, and the existing progress steps; the profile/story seam matches what personas are made of; per-persona isolation (user priority) on the risky phase.

Failure mode to watch: profile call still large — per-phase required-field validation + retry nudge; a backstory call failing after retries fails the whole run loudly (no hollow personas).

Verification: verify-output --mode strategy and --mode research pass REQUIRED_PERSONA_FIELDS; backstories are named third-person; wall-clock faster than the single-call version with visible phase progress; release gate green.

Open questions (for design): profile call stays batched (diversity) — confirm; evidence stays LLM-generated vs assembled from interview signals (research has quotes; strategy has none) — deferred; partial-batch semantics on backstory failure — decided: fail loudly.

Update (2026-08-08, mid-implementation): the evidence question is resolved — strategy personas get FULL research parity (valueEvidence, fearEvidence, evidenceLinks, bestFor/lessReliableFor, identityContext/situationContext, per-attribute provenance with computed overallConfidence), but grounded in the user's questionnaire/free response (the persona description), not interview transcripts. Evidence is LLM-generated from the description. Research stays interview-grounded.

# persona-evidence-integrity

Status: accepted (2026-08-10, design approved)

Decision: Strategy evidence becomes verbatim-or-honest with LLM-decided confidence. Evidence quotes must be verbatim fragments of the user's response (quoted, sourced "your response"), never fabricated persona-voice quotes; absent quotes are honest (attribute stays interpreted). Confidence per attribute (values/fears/goals/backstory/dims) is decided by the LLM in a profile-time `attributeConfidence` list, not hardcoded bands. Enforced client-side (verbatim substring + coverage + distinct checks) with failure-specific retry nudges, 2 attempts, fail-loud.

Reason: the deployed output fabricated first-person "evidence" the user never said — an integrity problem, not cosmetic. Hardcoded confidence bands repeated the "blanket 0.7" issue the user already rejected.

Failure mode to watch: a terse input can't support verbatim quotes for every attribute — the design accepts omission (empty quote) so the run doesn't retry-loop or fail on honest gaps; coverage nudge handles LLM omission.
