---
date: 2026-07-11
topic: "Navigation & Onboarding Redesign"
status: validated
---

# Navigation & Onboarding Redesign

## Problem Statement

The current Kynd dashboard has three UX issues:

1. **First-time users see only the ICP textarea** — there's no indication that interview-driven generation exists as an alternative path
2. **Batch navigation is confusing** — clicking "Personas" in the sidebar doesn't take you to the batch list if a batch is already selected; users must click "All Batches" to go back
3. **The "Run Pricing Simulation" CTA lives on the persona batch view** — it belongs in the Simulations tab, which is the natural home for simulation-related actions

## Constraints

- No changes to domain/use-case/adapter layers — this is a pure UI + navigation refactor
- `GeneratePersonasUseCase` and `GeneratePersonasFromInterviewsUseCase` remain untouched
- Existing persona store shape (`PersonaBatch`) stays the same
- Existing simulation store shape stays the same
- No new entities, no database changes

## Approach

**Variant A: Minimal Fix** — targeted UI changes to solve the three problems without restructuring the navigation model.

### Backlog (not in scope)

- **Variant C: Unified Workspace** — eventual redesign with a Home dashboard showing recent batches, recent simulations, and quick actions. Defer until core product stabilizes.
- **Interview Groupings** — persist uploaded transcripts, create grouping entity, allow combining groups. Requires new domain entity, storage, and UI. Separate session.

## Architecture

No structural changes. The work lives entirely in:

- `src/ui/dashboard/components/DashboardClient.tsx` — batch list as default view
- `src/ui/dashboard/components/views/SetupView.tsx` — add interview link
- `src/ui/dashboard/components/Sidebar.tsx` — click handler clears active batch
- `src/app/(app)/dashboard/simulations/page.tsx` — add "Run New Simulation" CTA
- `src/ui/stores/personaStore.ts` — may need minor adjustments

## Components

### 1. Onboarding: ICP Default + Interview Link

**What changes:** `SetupView.tsx` gets a secondary CTA linking to `/dashboard/interviews`.

**How it looks:**
- Primary: textarea + "Generate Personas" button (unchanged)
- Secondary: below the primary CTA, a text link or subtle card: "Have interview transcripts? [Generate from interviews →](/dashboard/interviews)"
- No choice screen, no wizard, no multi-step onboarding

**Why this works:** New users land on the simplest path (describe your audience). Users with interviews discover the alternative without being forced into a decision before they have context.

### 2. Batch Navigation: Always Show Batch List

**What changes:** Clicking "Personas" in the sidebar always clears `activeBatchId` and shows the batch list.

**Current behavior:**
- Sidebar click on "Personas" navigates to `/dashboard` but doesn't clear active batch
- If a batch was selected, the user sees the batch view, not the list
- User must click "All Batches" link to go back

**New behavior:**
- Sidebar click on "Personas" → clears `activeBatchId` → shows batch list
- Clicking a specific batch in the sidebar → sets `activeBatchId` → shows that batch's personas
- The "Personas" nav item stays highlighted when viewing a batch (you're still in the Personas section)
- The "Recent Batches" section in the sidebar remains as-is — it's the quick-access path to specific batches

**Implementation:** In `Sidebar.tsx`, the Personas link's `onClick` handler should call `setActiveBatch(null)` before navigating. The batch items in "Recent Batches" already call `setActiveBatch(batch.id)` — no change needed there.

### 3. Simulation CTA: Move to Simulations Tab

**What changes:** Remove "Run Pricing Simulation" from the persona batch view. Add "Run New Simulation" CTA to the simulations list page.

**Current behavior:**
- When viewing a batch (interview-sourced), there's a "Run Report" section with a URL input and "Run Pricing Simulation" button
- The simulations page (`/dashboard/simulations`) only lists existing simulations
- Empty state says "go run a simulation from the dashboard"

**New behavior:**
- Batch view: no simulation CTA. Just shows persona cards.
- Simulations page: prominent "Run New Simulation" button at top
- Clicking "Run New Simulation" → shows a form: select a batch (dropdown of all batches) + enter pricing URL → "Run" button
- This creates the simulation in `simulationStore` and triggers `useAnalysisFlow`

**Implementation detail:** The simulations page needs access to `usePersonaStore` to list batches for the dropdown. The `useAnalysisFlow` hook is already designed to work independently — it takes a URL and persona list. The new CTA form just provides those inputs.

**Note:** The from-ICP `SetupView` currently has a post-generation simulation step (textarea for URL + "Run Pricing Simulation" button). This should also be removed — after generation, the user sees their personas. To run a simulation, they go to the Simulations tab. This keeps the flows cleanly separated.

## Data Flow

No changes to data flow. All existing actions, use cases, and adapters remain untouched.

- Persona generation: UI → action → use case → LLM → Persona[] → personaStore (unchanged)
- Simulation: UI → action → use case → Playwright + LLM → PricingAnalysis[] → simulationStore (unchanged, just different entry point)

## Error Handling

No new error paths. Existing error handling in `usePersonaFlow`, `useInterviewPipeline`, and `useAnalysisFlow` remains unchanged.

## Testing Strategy

- **Sidebar behavior:** Verify that clicking "Personas" clears active batch and shows batch list
- **Batch list → batch view → batch list:** Verify the round-trip works (click batch → see personas → click Personas → see batch list)
- **Simulation CTA on Simulations page:** Verify the form loads batches from store, accepts URL, and triggers simulation
- **Simulation CTA removed from batch view:** Verify the batch view no longer shows simulation controls
- **SetupView interview link:** Verify the link navigates to `/dashboard/interviews`
- **Empty states:** Verify simulations page empty state no longer says "go to dashboard" (since the CTA is now here)

## Open Questions

- **Simulation batch selector UX:** Should it be a dropdown, a list of cards, or a search field? Dropdown is simplest for v1. If users have many batches, we can upgrade later.
- **Should the simulations page show batch name on simulation cards?** It already does (`batchName` field on `Simulation` entity). No change needed.
- **Should we keep the "Load Demo Personas" button on SetupView?** Yes — it's useful for exploration. No change.
