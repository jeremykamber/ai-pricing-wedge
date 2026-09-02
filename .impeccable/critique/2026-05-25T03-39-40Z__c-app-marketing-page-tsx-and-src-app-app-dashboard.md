---
target: marketing page + dashboard
total_score: 22
p0_count: 3
p1_count: 3
timestamp: 2026-05-25T03-39-40Z
slug: c-app-marketing-page-tsx-and-src-app-app-dashboard
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | FlowDialogs obscure dashboard; no progress outside modal |
| 2 | Match System & Real World | 3 | "BRAINSTORMING_PERSONAS" / "ENHANCING_WITH_PBJ" — internal jargon |
| 3 | User Control and Freedom | 1 | Chat + Detail modals stack; no back from batch→detail→chat |
| 4 | Consistency and Standards | 1 | Buttons mix rounded-full, rounded-lg, rounded-xl, rounded-[2rem] |
| 5 | Error Prevention | 3 | Pricing URL input accepts anything; error surfaces only on server fail |
| 6 | Recognition Rather Than Recall | 2 | "Batches" sidebar concept requires recall, not recognition |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts; every action is 2+ clicks through modals |
| 8 | Aesthetic and Minimalist Design | 2 | Decorative blurs, gradients, shadows, spinning animations |
| 9 | Error Recovery | 3 | Error boxes work but are stylistically inconsistent |
| 10 | Help and Documentation | 3 | No contextual help, no onboarding tour, no tooltips |
| **Total** | | **22/40** | **Needs Improvement** |

## Anti-Patterns Verdict

**This looks AI-generated.** The tells are numerous and unambiguous:

- **Pill buttons everywhere** — every CTA on marketing AND dashboard uses rounded-full
- **Decorative blur blobs** — the hero background glow is the canonical generic AI SaaS pattern
- **Gradient progress bars** — `from-indigo-600 to-indigo-400` hardcoded instead of CSS variable
- **Dual animation systems** — tailwind-animate + framer-motion in the same app
- **Spinning rings + bounce dots** — decorative spinning in FlowDialog, `animate-bounce` on typing
- **Shadow salad** — `shadow-sm` through `shadow-2xl` scattered on cards, buttons, inputs, modals
- **Arbitrary radii** — `rounded-[1.25rem]`, `rounded-[2rem]`, `rounded-full`, `rounded-lg` all in the same surface layer

**Detector scan:** Failed to run — the bundled detector plugin is missing (detect.mjs found, but the actual detection engine it wraps is not installed). Manual review covers the gap.

## Overall Impression

Kynd's fundamental design direction is sound — "Instrument Panel" is the right north star, the PRODUCT.md strategy is coherent, and DESIGN.md is a strong spec. But the current codebase was built against a different design system (the old DESIGN_SYSTEM.md with indigo hex, shadows, pill buttons, glass headers). The gap between the spec and the implementation is approximately a full visual overhaul. The good news: most violations are token-level (CSS variables, class swaps) rather than structural rewrites. The SetupView progressive disclosure is genuinely well-done and should be preserved.

## What's Working

1. **SetupView progressive disclosure.** The two-step form with disabled-next-step gating is the most refined UX in the app. The numbered circles and clear copy are exactly right.

2. **Typography foundation.** Geist Sans + Geist Mono is already wired up via `--font-geist-sans` and `--font-geist-mono`. The raw materials are correct — just the application of Mono for data/labels is missing.

3. **PersonaDetailModal copy architecture.** The uppercase mono section labels ("THE BACKSTORY VAULT", "THE ENGINE", "GOALS") with proper tracking establish the data-label hierarchy. This section is closest to the DESIGN.md spec.

## Priority Issues

### P0 — globals.css uses hex/rgba instead of OKLCH; card uses transparent rgba
- **What:** `--primary: #2e5bff`, `--background: #0f131a`, `--card: rgba(255,255,255,0.03)`, `--border: rgba(0,0,0,0.08)` — all violate the OKLCH mandate. The transparent card background creates accidental glassmorphism stacking.
- **Why it matters:** The entire tonal layering system (background → card → raised → modal) depends on precise OKLCH lightness steps. Hex values can't express the cool charcoal chromatic temperature. The rgba card breaks when layered.
- **Fix:** Replace all token values with exact OKLCH from DESIGN.md. Dark: `background: oklch(0.12 0.01 265)`, `card: oklch(0.14 0.01 265)`, `primary: oklch(0.55 0.18 270)`, `border: oklch(0.2 0.01 265)`. Light mode too.
- **Suggested command:** `/impeccable polish`

### P0 — No-Shadow Rule violated everywhere
- **What:** `shadow-sm` on MinimalCard, `shadow-lg shadow-primary/20` on CTAs, `shadow-xl/2xl` on mock cards, `shadow-sm` on inputs, `shadow-md` on modal buttons, `shadow-2xl` on FlowDialog.
- **Why it matters:** The elevation system IS tonal layering + borders. Shadows add visual noise, violate the Flat-Edge Rule, and are the #2 generic AI SaaS tell after pill buttons.
- **Fix:** Remove all `shadow-*` from cards, buttons, modals, inputs. Keep subtle indigo glow only on focus states per spec.
- **Suggested command:** `/impeccable polish`

### P0 — Buttons use rounded-full instead of 6px radius
- **What:** Every button — marketing CTAs, "Generate Personas", "Run Simulation", "Chat" buttons, modal buttons — uses `rounded-full`.
- **Why it matters:** DESIGN.md: "No pill shapes — those belong on consumer surfaces." Pills are the #1 indicator of consumer-grade design.
- **Fix:** Replace all `rounded-full` with `rounded-md` (6px) on every button across every component.
- **Suggested command:** `/impeccable polish`

### P1 — Modal stacking (detail → chat → generation)
- **What:** PersonaDetailModal opens on click → PersonaChat opens as second modal inside it → FlowDialogs overlay both. Up to 3 modal layers.
- **Why it matters:** DESIGN.md bans modal-as-first-thought. Modals disorient, hide context, and create deep navigation stacks. A founder wanting to chat takes 4 clicks and 2 modals.
- **Fix:** Replace detail modal with inline expandable card or side sheet. Chat as side panel. Generation as non-modal toast/inline bar.
- **Suggested command:** `/impeccable craft`

### P1 — Mono-Data Rule broken: scores not in Geist Mono
- **What:** Big Five scores use `font-bold tabular-nums` without `font-mono`. `renderScalar` uses `text-sm font-bold`. StatusBadge uses `text-xs font-medium` — no mono, no uppercase.
- **Why it matters:** The Sans-vs-Mono contrast is how the typographic system creates hierarchy. All quantitative data must render in Geist Mono with tabular-nums.
- **Fix:** Add `font-mono` to all score/value spans. Update StatusBadge to Label spec (mono, uppercase, 0.6875rem, 0.08em tracking).
- **Suggested command:** `/impeccable typeset`

### P1 — Decorative gradients, blur blobs, spinning animations
- **What:** Hero `blur-[120px]`, gradient overlays `from-primary/10 to-transparent blur-3xl`, FlowDialog spinning rings `animate-[spin_4s_linear_infinite]`, gradient progress bars `from-indigo-600 to-indigo-400`, bounce dots `animate-bounce`, pulsing labels.
- **Why it matters:** "Invisible UI, visible data" — these elements draw attention to the UI. Spinning rings and bounce dots contradict "snappy mechanical precision."
- **Fix:** Remove decorative blur blobs and gradient overlays. Flat Signal Indigo progress bars. Linear fade typing dots (no bounce). Determinate progress indicator instead of spinner.
- **Suggested command:** `/impeccable distill`

## Persona Red Flags

### Alex (Power User)
- No keyboard shortcuts visible anywhere. Click-to-chat: click card → modal loads → click Chat → second modal loads = 4 clicks, 2 modal transitions. Should be 2 max with a side sheet.
- No bulk operations. Can't select multiple personas for comparison. No command palette or quick search.

### Jordan (First-Timer)
- "Batches" is an internal concept. "BRAINSTORMING_PERSONAS" / "GENERATING_BACKSTORIES" / "ENHANCING_WITH_PBJ" shown during generation — first-timer has no idea what PB&J means.
- "Load Demo Personas" is hidden — small underline text in top-right corner. Easy to miss.
- No help button, no tooltip on unfamiliar terms, no onboarding tour.

### Founder (Project-Specific)
- Time-to-value: type description → click Generate → wait behind modal with spinning animation → see personas. The modal hides progress. Should see results forming in real-time.
- "Run Pricing Simulation" requires a URL — founder without a deployed pricing page is stuck. No mock/MVP mode.
- No "quick start" path — can't see what Kynd can do without typing a description first. The small "Load Demo" link doesn't cut it.
- After results: what do they DO with the insight? No share/export/report flow visible from main dashboard.

## Minor Observations

1. Dashboard header has only a ThemeToggle — empty header feeling
2. Sidebar `w-64` (256px) vs spec `240px` — 16px discrepancy
3. Marketing footer links (Privacy, Terms, Contact) all link to `#`
4. Features nav links to `#features` (works), Pricing links to `#pricing` (broken anchor)
5. Marketing entrance animations: 700-1000ms when spec says 150ms — 5-7x too slow
6. `hover:scale-105` on primary CTA — "No scale, no lift" per spec
7. FlowDialog `rounded-[2rem]` (32px) — only beaten by... nothing, that's enormous
8. MinimalCard `rounded-[1.25rem]` (20px) vs spec 8px — 2.5x the spec
9. PersonaChat uses rounded-full on input and send button — pill chat components
10. Framer-motion + tailwind-animate — two animation systems for one app
11. No-Black Rule followed in intent (`#0f131a` not pure black) but hex means chromatic temperature is unspecified
12. Marketing header `space-x-6` nav spacing not aligned with DESIGN.md spacing scale

## Questions to Consider

1. **The brand says "Sharp · Confident · Minimal" but the code uses rounded-full buttons, rounded-[2rem] dialogs, and shadow-2xl cards — is the DESIGN.md aspirational or authoritative?** One of them has to drive. Which gets veto power?

2. **If Kynd is "an instrument panel" where "the interface disappears so insights take focus," why does the first-time founder experience involve a 4-step wizard with animated dialogs, spinning rings, and academic step labels?** Is there a version that is a single-page chat interface — persona on the left, conversation on the right — and nothing else?

3. **The modal stacking problem (detail → chat → generation) suggests the interaction model is optimized for engineering convenience. What would it cost to make PersonaDetail + PersonaChat a single split-panel view — zero modals?**
