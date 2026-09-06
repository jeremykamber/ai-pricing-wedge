# Route — Behavioral Simulation Engine v2

Base: dev @9264dd6 · Integration branch: feat/simulation-engine-v2 (`.worktrees/simulation-engine-v2`)
Slice branches: slice/b, slice/c (isolated worktrees; A works directly on feat/simulation-engine-v2)

## Ledger

- **Done:** Slice A — Visceral Actor + Anthropologist (13 new tests green red-first, full suite 478 green, tsc 0, zero stale refs; businessGoal dropped from persona pipeline)
- **Done:** Slice B — Cohort synthesis + grounding (5 commits on slice/b; 27 tests green; computeSynthesis deleted incl. 2 UI importers migrated; four shallow port methods → one generateCohortSynthesis)
- **Done:** Slice C — CitationTooltip + RawThinkAloudSheet + PDF degrade (9 component tests red-first; full suite in slice-c 474 green)
- **Done:** Integration — slice/b + slice/c merged into feat/simulation-engine-v2; 2 conflicts resolved (adapter module-top, PDF imports); integrated tree: tsc 0, 76 files / 514 tests green
- **Done:** Slice D — CLI verification vs jobright.ai (live). Fixed en route: VPS Playwright server was loopback-bound (patched playwright-server.js host binding + pm2 restart on 8081), synthesis timeout 120s→240s (reasoning CoT), friction/disagreement prompt instructions, actor jargon rule hardened. Latest run: persona/structure/monologue/third-person/citations 12-14/14 verbatim all PASS; jargon ban ~3 partial FAILs (models narrate "social proof"/"CTA" as page elements — rule hardened after run; final judgment in E2E), disagreements empty in 1 of 2 runs (model judgment when cohort genuinely agrees — frictions present). Raw: .sisyphus/verify/v2-artifact-jobright.json
- **Done:** Slice E — Browser E2E validated end-to-end via deployed VPS backend: persona generation (5), visceral monologues, third-person extraction, cohort synthesis with verbatim citations confirmed through the real API+UI flow. Fixed en route: missing synthesis in VPS route + result polling, VPS standalone missing modules (browsers.json), playwright server binding, EACCES logs dir. 1219 lines of legacy pipeline deleted.
- **Done:** Post-PR fixes (user report review, 9 issues) — commit 580185c: journey state machine (prompt rule + code normalizer `normalizeJourneyOutcomes` — later stages become "Not reached — abandoned at <stage>", never schema-description strings), canonical brand injection (`artifactNameFrom` in AnalyzeArtifactUseCase → actor + extraction prompts, kills "Jobbright" hallucinations), anti-cinematic voice rule, first-person user-voice `unansweredQuestions`, complete-sentence evidence quotes, screenshot animation freeze (`freezePageMotion` in RemotePlaywrightAdapter — fixes "truncated copy" false findings), `topFindings` shape tolerance in CohortSynthesisSchema. Commit 27df60f: verify-output saves monologues before synthesis (timeout no longer destroys run). Earlier: 09d2bf0 fixed system prompt never actually sent to vision model (the purple-prose root cause), 7a1f0fa null-anchor locator tolerance.
- **Done:** Final validation run (jobright.ai, 3 personas, deployed VPS): brand 100% "Jobright" (0 violations), state machine OK on all personas, no schema-string leakage, no stage directions / cinematic fiction, 6/6 synthesis citations verbatim, synthesis present. 1 persona extraction timed out (240s, env — handled as graceful failure, excluded from synthesis). Raw: .sisyphus/verify/v2-artifact-jobright-final.json

## Status: COMPLETE — awaiting human review on PR #74
## Design decisions locked during validation

1. "Skipped stages" = outcome value `blocked`/`stopped`, NOT omitted journey entries. All 5 stages stay present and ordered (validatePersonaResponse invariant preserved).
2. `PersonaBreakdownCard.tsx` does not exist — Slice C targets inline rendering in `src/app/(app)/dashboard/analyses/[id]/page.tsx`.
3. Citation mechanism = structured `EvidenceCitation[]` array on `SynthesizedFinding` only. No `[cite-N]` string markers anywhere. All citation/extraction knowledge lives in one pure module.
4. PDF degrades gracefully (no popovers possible in react-pdf).
5. computeSynthesis heuristic fallback dies (spec-directed); synthesis failure throws, aggregated at action layer.
6. Failed-persona filter tightened so failure-fallback responses don't enter synthesis.

## File ownership (parallel contract)

- **A:** LlmServicePort persona region, VisionAnalysisAdapter cognitive/formatter region (~840–1240), AnalyzeArtifactUseCase, PersonaResponse tests.
- **B:** ArtifactSynthesis.ts, synthesizeArtifactResults + citations module, VisionAnalysisAdapter synthesis region (~1421+), deletes computeSynthesis.
- **C:** UI components, analyses/[id]/page.tsx wiring, AnalysisPdfDocument degrade, component tests.

## Verification plan

- Per-slice checkpoints: unit/component tests green + tsc clean per ownership scope.
- After merge: adversarial review on reviewed surfaces (grounding determinism, prompt leakage), then Slice D CLI run, then Slice E browser E2E, full suite, jnk-commit, PR → dev.
