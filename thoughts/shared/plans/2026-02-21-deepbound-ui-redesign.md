# DeepBound UI Redesign Implementation Plan

## Overview

A complete ground-up redesign of DeepBound's UI to establish a new visual identity that is minimalist, highly functional, and modern, utilizing substantial whitespace. We will remove all existing proprietary UI components and Next.js routes, replacing them with a fresh, modular, and UX-friendly structure based on customized shadcn/ui primitives. The underlying business logic, state management (Zustand), and server actions will remain intact.

## Current State Analysis

- **Routes**: Next.js App Router with `(marketing)` and `(app)` route groups.
- **Components**: Heavy custom components residing in `src/ui/components/` and `src/components/PartialPersonaCard.tsx`.
- **State/Logic**: Handled by robust hooks (`usePersonaFlow`, `useAnalysisFlow`) using `@ai-sdk/rsc` streaming and a global Zustand store (`userStore.ts`).
- **Styling**: Tailwind v4 with `oklch` syntax, thick borders (explicit 2px overrides), and custom dark/light modes defined in `globals.css`.

## Desired End State

- **Clean Slate**: All legacy routes and custom components outside of shadcn are deleted.
- **New Visual Identity**: Minimalist, high-whitespace, simple, and functional. Replaces the amplified border overrides with refined, subtle demarcations. 
- **Modular Architecture**: New, domain-specific UI components built cleanly on top of existing shadcn/ui primitives.
- **Functional Integrity**: Full integration with the existing hooks (`usePersonaFlow`, `useAnalysisFlow`) and Server Actions without modifying the backend.
- **Total Consistency**: 100% unified design language across marketing and application pages.

## What We're NOT Doing

- **Backend Changes**: No changes to `src/actions/` or database interactions.
- **State Hook Logic Changes**: We will consume `usePersonaFlow` and `useAnalysisFlow` as they are, without changing their internal logic or streaming parsing.
- **Deleting shadcn Primitives**: The base components in `src/components/ui/` will be kept (and restyled via `globals.css` if necessary).

## Implementation Approach

We will follow a structured, phased approach to ensure a safe transition:
1. **Purge**: Safely remove legacy views and styles.
2. **Foundation**: Establish the new minimalist design system in `globals.css` and recreate core Next.js layouts.
3. **Component Library**: Build the new, customized modular components required for the specific views.
4. **Marketing Rebuild**: Reconstruct the public-facing landing page.
5. **Dashboard Rebuild**: Reconstruct the main interactive dashboard, wiring up the existing state hooks to the new minimalist views.

---

## Phase 1: Cleanup and Design System Reset

### Overview
Delete legacy files and establish the new minimalist design tokens in `globals.css`.

### Changes Required:

#### 1. Delete Legacy Components & Routes
**Files to Delete**:
- `src/ui/components/**/*` (Entire directory)
- `src/components/PartialPersonaCard.tsx`
- `src/app/(marketing)/layout.tsx`
- `src/app/(marketing)/page.tsx`
- `src/app/layout.tsx`
- `src/app/(app)/dashboard/page.tsx`

#### 2. Reset Global Styles
**File**: `src/app/globals.css`
**Changes**: Remove the bulky 2px border overrides. Implement a high-contrast, minimalist `oklch` theme with soft, subtle borders, high whitespace scale, and refined typography.

### Success Criteria:
- [x] Automated: Application fails to compile (expected, as routes are deleted).
- [x] Automated: `globals.css` contains the new theme without legacy `!important` border overrides.

---

## Phase 2: Core Layouts & Foundation

### Overview
Recreate the essential Next.js routing structure with modern, spacious layouts.

### Changes Required:

#### 1. Root Layout
**File**: `src/app/layout.tsx`
**Changes**: Set up basic HTML/body tags with the new font variables (Geist/Geist Mono), antialiasing, and global providers.

#### 2. Marketing Layout
**File**: `src/app/(marketing)/layout.tsx`
**Changes**: Create a spacious layout with a minimalist navigation header and footer.

#### 3. Dashboard Layout
**File**: `src/app/(app)/dashboard/layout.tsx`
**Changes**: Create an application shell optimized for focus. High whitespace, discreet sidebar or top navigation, and an uncluttered main content area.

### Success Criteria:
- [x] Automated: Next.js compiles the layout files.
- [ ] Manual: Empty layouts render cleanly with the correct fonts and background colors.

---

## Phase 3: New Modular UI Component Library

### Overview
Create the building blocks for the new UI, customized from shadcn/ui.

### Changes Required:

#### 1. Reusable Dashboard Elements
**Files**: `src/ui/core/` or `src/components/custom/` (e.g., `MinimalCard.tsx`, `StatusBadge.tsx`, `StepIndicator.tsx`, `PersonaAvatar.tsx`)
**Changes**: 
- Create a `MinimalCard` with very subtle borders and extensive padding.
- Create a `StepIndicator` for the analysis and persona generation flows that looks clean and unobtrusive.
- Create a `PersonaAvatar` and `PersonaProfilePanel` to handle the display of AI agents gracefully without visual clutter.

#### 2. Flow Modals / Dialogs
**File**: `src/components/custom/FlowDialog.tsx`
**Changes**: A highly refined, centered dialog used for the streaming stages (Analysis & Persona generation), emphasizing readability of the streaming steps.

### Success Criteria:
- [x] Automated: Linting passes for all new components.
- [x] Manual: Components are visually consistent, strictly adhering to the minimalist, high-whitespace directive.

---

## Phase 4: Marketing Page Rebuild

### Overview
Recreate the landing page to reflect the new visual identity.

### Changes Required:

#### 1. Landing Page
**File**: `src/app/(marketing)/page.tsx`
**Changes**: 
- Implement a striking, minimalist hero section with a clear value proposition.
- Use ample vertical rhythm (margin/padding) between sections.
- Integrate the new custom components (like mock `PersonaAvatar` displays) to showcase the product cleanly.
- Ensure all calls-to-action (CTAs) properly route to `/dashboard`.

### Success Criteria:
- [x] Automated: Page compiles successfully.
- [ ] Manual: Visual inspection confirms a massive improvement in whitespace, typography hierarchy, and overall modern aesthetic.

---

## Phase 5: Dashboard & State Re-Integration

### Overview
Rebuild the interactive dashboard and hook it up to the existing business logic.

### Changes Required:

#### 1. Dashboard Entry Point
**File**: `src/app/(app)/dashboard/page.tsx`
**Changes**: 
- Build the main state orchestrator component here (or in a separate `DashboardClient.tsx` if preferred).
- Import and initialize `usePersonaFlow` and `useAnalysisFlow`.

#### 2. Interactive Views
**Files**: e.g., `src/ui/dashboard/SetupView.tsx`, `src/ui/dashboard/AudienceView.tsx`, `src/ui/dashboard/ResultsView.tsx`
**Changes**:
- **SetupView**: Minimalist input forms for user profiles and pricing URLs.
- **AudienceView**: A clean grid of generated personas utilizing the new `MinimalCard` and `PersonaProfilePanel`.
- **ResultsView**: A spacious, analytical layout for displaying the gaze overlays and AI critique side-by-side with the personas.
- **Chat Interface**: Rebuild the `PersonaChat` as an elegant, slide-out or modal interface with distraction-free chat bubbles.

### Success Criteria:
- [x] Automated: TypeScript definitions match the hooks perfectly.
- [ ] Manual: Users can successfully input data, generate personas, run the analysis flow, and chat with personas.
- [ ] Manual: The streaming progress indicators function smoothly in the new `FlowDialog` UI.
- [ ] Manual: The application is 100% functional and visually pristine.

---

## Testing Strategy

### Automated Verification
- `npm run build` succeeds without type errors.
- `npm run lint` passes across the entire `src/app` and `src/ui` directories.

### Manual Verification
- **Aesthetic Check**: Compare the new implementation against the "minimalist, simple, modern" constraints. Ensure no thick legacy borders remain.
- **E2E Flow**: Complete a full user journey:
  1. Load marketing page.
  2. Navigate to Dashboard.
  3. Enter customer profile -> Generate Personas.
  4. Enter pricing URL -> Run Pricing Analysis.
  5. Open a chat with a generated persona and verify streaming responses.