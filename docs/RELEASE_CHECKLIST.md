# Release Checklist

Run before sending Kynd to any external person (JZ, investors, founders, anyone). The goal is not "zero bugs" — it's **"I've already tested everything they could reasonably do."**

Total time: ~10 minutes after the automated gate.

---

## Step 0 — Automated gate (required)

```bash
bun run release
```

This runs lint + typecheck + production build + the deterministic test suite (unit, integration, and seeded browser tests — no live LLM calls). If it's red, fix before doing anything else.

## Step 1 — Human pass

### Personas

- [ ] Generate **1 persona** (count input = 1)
- [ ] Generate **3 personas** (default)
- [ ] Generate **10 personas**
- [ ] Generate from the **guided survey form** (default view)
- [ ] Generate from the **freeform textarea** ("Use freeform description instead")
- [ ] Empty input: Generate button disabled, no crash
- [ ] Huge/verbose audience description (copy-paste a paragraph)
- [ ] Weird formatting: emojis, markdown, ALL CAPS in the input
- [ ] Load **Demo Persona Batch** — batch appears in sidebar
- [ ] Click a batch in the sidebar — results view opens, personas render with backstory, traits, chat

### Analyses (Artifact Analysis)

- [ ] **Run New Analysis → URL** (use your own staging/live page) — completes end-to-end
- [ ] **Run New Analysis → Screenshot upload** — completes end-to-end
- [ ] Completed view renders: **Executive Synthesis** (top findings, disagreements, frictions), then per-persona reports with all **5 cognitive stages**
- [ ] Empty state: fresh browser, Analyses page shows "No analyses yet"
- [ ] **Refresh mid-run** — in-progress analysis survives or resumes; page doesn't crash
- [ ] **Cancel** an in-progress analysis — error/cancelled state is clean
- [ ] Analysis with a failing persona — synthesis still shows, failure count is visible

### Chat (persona chat)

- [ ] Ask a **follow-up question** — persona answers in character, grounded in its backstory
- [ ] Ask an **off-topic question** — persona responds according to its refusal patterns / epistemic boundaries
- [ ] Ask about **pricing / feature requests** — persona gives its own view, not a sales pitch
- [ ] **Refresh the page** mid-conversation — history is preserved

### UX

- [ ] **Mobile viewport** (iPhone-ish width): dashboard, analyses, chat all usable
- [ ] **Back button** works from analyses detail → list → dashboard
- [ ] Loading states: generation progress, streaming feedback visible (no frozen blank screens)
- [ ] Error states: kill the network or cancel mid-run — clean message, no white screen
- [ ] No console errors on the main paths (open devtools, spot-check `/dashboard`)

### Data

- [ ] An **old report** from a previous version still opens and renders (no schema crash)
- [ ] **Delete a report** — it disappears, list stays intact

### Accounts

No user accounts UI yet (auth = `VPS_AUTH_TOKEN` for API routes only). When that changes, add: login, logout, session persistence, wrong-password error.

---

## Step 2 — Output quality (only after prompt/pipeline changes)

If you changed prompts, the persona pipeline, or the artifact analysis structure, don't eyeball it — run the `verify-kynd` skill. It runs the real pipeline and judges the output against the pipeline invariants and persona schema:

```
/skill:verify-kynd
```

Then spot-check the judged output yourself before sending.

## Step 3 — Ship

- [ ] All of the above passed
- [ ] If backend changed: pushed to GH, pulled on VPS, `npx pm2 restart kynd-backend-engine` (see `docs/VPS_DEPLOYMENT.md`)
- [ ] Netlify deploy finished (or `git push` triggered it)

Done. Send it.
