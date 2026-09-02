---
date: 2026-02-21T11:26:39-08:00
git_commit: e5d3a86ef752021dcf054d9b83fe37111bb54472
branch: refactor/deepbound-ui-redesign
repository: ai_user_testing_mvp
topic: "Deepbound UI Redesign Mapping"
tags: [research, codebase, frontend, UI, redesign, Next.js, actions]
status: complete
---

# Research: Deepbound UI Redesign Mapping

## Research Question

Map out the current frontend design, server actions, state management, and existing Next.js routes to prepare for a total UI redesign where all non-shadcn UI components and Next.js routes will be deleted.

## Summary

The frontend is a Next.js (App Router) application. State is handled by a mix of `Zustand` (for global auth) and custom React hooks that interact with `@ai-sdk/rsc` streaming Server Actions for long-running workflows (persona generation and pricing analysis). Styling uses Tailwind v4 with a custom `oklch`-based soft indigo theme. The UI is split into marketing pages and a dashboard application.

## Detailed Findings

### 1. Next.js Routes

The app uses the Next.js App Router with Route Groups:
- **`src/app/(marketing)/page.tsx`** - The public landing page.
- **`src/app/(marketing)/layout.tsx`** - Wrapper layout for public marketing pages.
- **`src/app/(app)/dashboard/page.tsx`** - The main dashboard interface for analysis and persona workflows.
- **`src/app/layout.tsx`** - The global root layout containing global providers and font definitions.

### 2. UI Components to Delete

These are the proprietary domain components that will be replaced during the redesign. 
- **Core App Views**:
  - `src/ui/components/Dashboard.tsx`
  - `src/ui/components/dashboard/views/CustomerInputView.tsx`
  - `src/ui/components/dashboard/views/PersonaGridView.tsx`
  - `src/ui/components/dashboard/views/AnalysisResultView.tsx`
- **Domain Components**:
  - `src/ui/components/PersonaChat.tsx`
  - `src/ui/components/GazeOverlay.tsx`
  - `src/ui/components/PersonaAnalysisPDF.tsx`
  - `src/ui/components/RegisterUserComponent.tsx`
  - `src/ui/components/UserForm.tsx`
  - `src/ui/components/Logo.tsx`
  - `src/components/PartialPersonaCard.tsx`
- **Shared Dashboard Components** (`src/ui/components/dashboard/shared/`):
  - `ThoughtfulDialog.tsx`, `MetricBlock.tsx`, `RefinedStep.tsx`, `PersonaChatInterface.tsx`, `PersonaCard.tsx`, `PsychologicalProfile.tsx`, `PsychologicalRadar.tsx`

### 3. UI Components to Keep (shadcn)

All primitives located in `src/components/ui/` should remain intact:
- `tabs.tsx`, `card.tsx`, `popover.tsx`, `progress.tsx`, `scroll-area.tsx`, `tooltip.tsx`, `alert.tsx`, `dialog.tsx`, `badge.tsx`, `button.tsx`, `input.tsx`, `carousel.tsx`.

### 4. State Management

State is separated into global data vs flow-based orchestrations:
- **`src/ui/stores/userStore.ts`**: A global `Zustand` store persisting to `localStorage`. Handles user authentication (`login`, `register`, `logout`, `edit`, `remove`).
- **`src/ui/hooks/useAnalysisFlow.ts`**: Complex custom hook orchestrating the pricing analysis workflow. Manages image/url inputs, calls `analyzePricingPageAction`, parses `readStreamableValue` from the AI SDK, handles cancellation tokens, and manages the `predictGazeAction`.
- **`src/ui/hooks/usePersonaFlow.ts`**: Custom hook managing the persona generation lifecycle. Tracks input profile, triggers `generatePersonasAction`, parses the streaming response to update UI progress steps (`BRAINSTORMING_PERSONAS`, `GENERATING_BACKSTORIES`, `DONE`).
- **`src/ui/hooks/useLocalStorage.ts`**: Generic local storage utility hook.

### 5. Server Actions

Server Actions are predominantly asynchronous and heavily rely on `@ai-sdk/rsc` `createStreamableValue` to stream JSON progression to the client hooks:
- **`src/actions/analyzePricingPage.ts`**: Takes an image/URL and personas, spins up a remote Playwright browser or vision agent, and streams progress steps.
- **`src/actions/generatePersonas.ts`**: Accepts a customer profile description and streams back a list of generated personas.
- **`src/actions/chatWithPersona.ts`**: Streams chat completion chunks when interacting with a persona.
- **`src/actions/cancelRequest.ts`**: Global action to terminate an active AI request using a cancellation manager.
- **`src/actions/predictGaze.ts`**: Predicts gaze heatmaps based on the analysis screenshot.
- **`src/actions/validateAnalysis.ts`**: Critic validation of analysis vs. persona.
- **`src/actions/recordStep.ts`**: Memory log for saving user interaction steps.

### 6. Branding & Design System

The application relies on Tailwind CSS v4 embedded entirely in `src/app/globals.css`. 
- **Colors**: Uses modern `oklch` syntax natively. 
  - *Light Mode*: Soft, muted indigo (`primary: oklch(0.45 0.08 264)`).
  - *Dark Mode*: Sophisticated deep dark tone (`background: oklch(0.08 0 0)`).
- **Styling Conventions**:
  - Amplified global border widths: Explicitly sets `.border`, `.border-t`, etc., to `2px !important;`.
  - Border Radius: Large rounding with `--radius: 0.75rem;`.
  - Custom scrollbars defined under `.custom-scrollbar` and `.scrollbar-none`.

## Code References

- `src/ui/hooks/useAnalysisFlow.ts` - Central orchestration for the analysis step.
- `src/actions/analyzePricingPage.ts` - Core action executing AI automation with streaming.
- `src/app/globals.css:46` - Light mode `oklch` theme definition.
- `src/app/globals.css:76` - Dark mode `oklch` theme definition.
- `src/app/globals.css:104` - Amplified border overrides.

## Open Questions

- When recreating the UI, should we maintain the same Route Group structure (`(marketing)` and `(app)`)?
- Should the new design use the exact same Tailwind `oklch` variables, or are we migrating to standard shadcn variables (e.g., standard HSL format)?
- Will the flow hooks (`useAnalysisFlow` and `usePersonaFlow`) be refactored alongside the UI, or just consumed by new components?
