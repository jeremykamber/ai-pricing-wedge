# persona-a-profile-backstory — notes

Session log / squawk sheet. Written during implementation; debrief appends.

## Squawks (2026-08-08, logged after live quality review of 6 personas)

- `[squawk] medium | PersonaAdapter strategy profile prompt | valueEvidence/fearEvidence are thin 2-4-word fragments and occasionally duplicated (Remy reused "value data over opinions" for two values). Research proves the model produces better quotes when asked ("evaluate software on ROI — every dollar has to come back"). Fix candidate: forbid duplicate quotes across values + ask for a quote with a few words of context. | Deferred: quality, not a blocker; fits the strategy-evidence-parity work.`
- `[squawk] low | PersonaAdapter research backstory prompt | Dakota's narrative says "data skepticism score is low" while the dimension table says Data Skepticism observed/0.9 — the narrative contradicted its own dimension on one line. Fix candidate: prompt nudge to describe each dimension consistently with its score. | Deferred: single-line cosmetic; re-verify with the next research run.`
- `[squawk] low | PersonaAdapter research profile prompt | Research produced 6 behavioralDimensions; strategy prompt states 3-5 but research doesn't bound the count. Fix candidate: add the 3-5 constraint to the research prompt for symmetry. | Deferred: cosmetic consistency.`

## Live verify evidence (raw outputs)

- strategy PASS: `.sisyphus/verify/2026-08-08T22-12-56-838Z-persona.json`
- research PASS: `.sisyphus/verify/2026-08-08T22-27-19-653Z-persona.json`

## Quality review (user requested, 2026-08-08)

Cohort 8.2/10: backstories 9, distinctness 9, Big Five↔narrative consistency 8.5,
identity/situation 9, evidence 6.5 (strategy) / 8.5 (research), prediction fields 8.
All six personas shippable; weaknesses logged above.

## Plan 05 (evidence integrity) — 2026-08-10

- RETIRED the 08-08 "thin 2-4-word fragments / duplicated quotes" squawk: the
  verbatim-or-honest contract + answer-to-question disclosure replaces the
  paraphrase instruction that caused it. Remaining research squawks (backstory
  contradiction, dim count) stay open — research untouched by design.
- Verification found two defects in the slice-1 verbatim guarantee (see
  verification/results.md): collectQuoteValues skips nested string fields
  (dim evidence + evidenceLinks excerpts unchecked); normalizeVerbatim leaves
  padding inside quote marks. Fixes proposed, user's call.

## Debrief — 2026-08-10 (callsign: persona-evidence-integrity, plan 05)

Set out: strategy personas fabricated first-person evidence the user never
said, and confidence was a blanket 0.7/0.9. Fix: verbatim-or-honest evidence
with LLM-decided confidence.

Landed (branch fix/strategy-persona-empty-fields, 249235a → 29da2da, PR #65):
- Verbatim-or-honest contract: prompt v2 + client-side normalized substring
  check on every quote field; empty slots are honest omission, not failure.
- "Answer to <question> in audience description" disclosure (evidenceQuestions).
- LLM-decided confidence (attributeConfidence + coverage check + rationale
  hover) replacing hardcoded bands.
- VPS rebuilt on the fix branch; deployed strategy runs verified verbatim.

Verification: release gate green (401→406 tests), 34/34 modes, tsc/lint
clean; live runs local + deployed all-verbatim. Round-2 fixes: nested-field
check gap, schema-blocked omission, droppable attributeConfidence, retry
budget 2→3, prompt pendulum (fabricate ↔ over-omit).

Squawks: VPS on fix branch (back to main after merge); residual fail-loud if
model fabricates 3× in a row (salvage option needs sign-off); research
backstory/dim-count; design open items (relevance axis, goalEvidence quote).

IOUs: 08-08 thin-fragments squawk retired; research squawks open.

Next step: user spot-checks deployed guided-form strategy output; then merge
PR #65, VPS back to main. Context: .ai/contexts/persona-pipeline/

## Round 3 — quote cleaning + research consistency (ac3917d)

Debug: the prompt's "wrapped in quotation marks" made deepseek literalize
the marks into stored values → UI double-wrapped ("Save time" → “"Save time"”)
and dim rows rendered raw marks with a generic "Source" label. Fix:
cleanQuote strips surrounding marks at mapping time (strategy + research);
dim rows render identically to values/fears. Research joined the verbatim-
or-honest contract (grounded in the persona description; interviews enter
the call by ID only) + distinct rule; prompt updated. Release gate 410
tests; live + deployed strategy/research all verbatim, stored values clean.
Open: research confidence still derived (LLM-decided extension is a call).

## Round 4 — research LLM-decided confidence (8b8c0c7)

User asked to extend attributeConfidence to research; double-check first
confirmed it was NOT there (research provenance still hardcoded 0.7/0.7/0.4,
dims 0.9/0.6). Research now reads attributeConfidence like strategy (tier
derived, rationale, coverage-enforced); attributeConfidence required in the
shared PersonaProfileSchema (both prompts instruct it) — StrategyProfileSchema
extension deleted. Live + deployed research: backstory 0.3-0.4 synthetic,
values 0.85-0.9, no bands. Release gate 411 tests.

## Debrief — 2026-08-11 (session 2, thread persona-evidence-integrity)

Set out (continuation): ship the evidence-integrity work; then user spot-check
surfaced issues.

Landed (branch fix/strategy-persona-empty-fields → 8b8c0c7, PR #65):
- Verbatim-or-honest evidence (all modes), answer-to-question disclosure,
  LLM-decided confidence for strategy AND research, quote-cleaning, research
  joins the contract; VPS deployed; release gate 411 tests green.
- Earlier rounds in this thread: plan 05 slices 1-3, verification fixes.

Airborne — user-reported on the deployed preview (2026-08-11, NOT debugged,
first work for the fresh session):
1. [bug] Duplicate sonner progress toast on generate (seen on research and
   ICP personas) — one per job expected. Hypothesis: generation triggered
   twice (would ALSO explain #2).
2. [perf] Generation took ~10 min. My deployed tests were ~2-4 min. If #1 is
   a double trigger, two jobs explain the doubling. Otherwise check retry
   chains (3 attempts) and the interview pipeline's extra calls.
3. [bug] Every ICP quote renders "(Answer to "Target audience" in audience
   description)" — the wrong question. Hypothesis: the ICP flow builds the
   description as ONE unlabelled block (no blank-line sections), so
   evidenceQuestionsFor's section split fails and labelOf returns the first
   label. Repro path: find how the ICP/guided-form description is assembled
   (SetupView / PersonaSurveyForm / surveyToPrompt callers), then unit-test
   the exact string.
4. [integrity] Interview-based personas: quotes are third-person PARAPHRASES
   ("scans feed by first checking names and profiles..."), not verbatim
   transcript fragments. The interview pipeline passes a summary (not the raw
   transcript) as the verbatim source — check GeneratePersonasFromInterviews-
   UseCase's personaDescription construction. Some SOURCES excerpts ARE raw
   transcript lines (interview-0) — mixed.
5. [feature] Click a source quote → jump to the highlighted spot in the
   original interview file (context view).

Squawks carried: VPS on fix branch → back to main after PR merge; research
backstory/dim-count (08-08); design open items (relevance axis, goalEvidence).

Next step (pickup): read this file; reproduce #1/#2 together (toast dup +
timing), then #3 (question mapping), then #4 (interview verbatim), #5 as
design. Context: .ai/contexts/persona-pipeline/
