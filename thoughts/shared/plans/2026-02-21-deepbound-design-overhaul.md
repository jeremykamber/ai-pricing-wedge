# DeepBound Design Overhaul Implementation Plan

## Overview
This plan outlines the steps to overhaul the UI of the ai_user_testing_mvp repository to match the new "DeepBound" brand. The target aesthetic is "simplicity > everything", focusing on high whitespace, functional design, and an elegant, minimal dark-mode UI powered exclusively by the Geist font family. The previous brutalist, industrial style (heavy borders, tiny uppercase tracking) will be entirely removed.

## Current State Analysis
- **Styling**: `globals.css` forces a `2px !important` border hack and imports `Inter` while `layout.tsx` imports `Geist`.
- **Typography**: Extensive use of `text-[9px]`, `text-[10px]`, `uppercase`, `tracking-[0.3em]`, and `font-black` creating dense, heavy UI.
- **Components**: The UI is tightly packed with borders and uses custom brutalist Button variants. Tabs are visually complex.
- **Layout**: The dark mode is hardcoded in `layout.tsx`. Dashboard screens are deeply nested with tight padding.

## Desired End State
- A clean, dark-mode-only aesthetic using solely the Geist font.
- Removal of all heavy `2px` borders.
- Increased whitespace (padding/margin) across all major layouts.
- Replaced microscopic uppercase text with standard, legible sizes (`text-sm`, `text-xs`) using normal tracking and medium/regular weights.
- Refactored core Radix primitives (Button, Tabs, Card, etc.) to feature minimal styling (subtle borders, muted colors).

## What We're NOT Doing
- We are not changing the underlying application state management or hooks (e.g., `usePersonaFlow`, `useAnalysisFlow`).
- We are not implementing light mode (the brand direction implies a sleek, minimal dark mode).

---

## Phase 1: Foundation & Global Typography

### Overview
Clean up global stylesheets and layout roots to establish the minimal dark mode foundation and ensure the exclusive use of Geist.

### Changes Required:

#### 1. `src/app/globals.css`
- **Action**: Remove the `Inter` font import.
- **Action**: Map `--font-sans` to `--font-geist-sans`.
- **Action**: Completely remove the `.border`, `.border-t`, `.border-b`, `.border-l`, `.border-r` 2px `!important` overrides.
- **Action**: Clean up the custom scrollbar to be more minimal (or remove it to rely on OS defaults).

#### 2. `src/app/layout.tsx`
- **Action**: Verify the `geistSans` and `geistMono` imports are correctly applied.
- **Action**: Ensure `antialiased` is applied to the body.

### Success Criteria:
#### Automated Verification:
- [x] Next.js builds successfully (`npm run build`).
#### Manual Verification:
- [x] Inspect the DOM to ensure `Inter` is no longer loaded.
- [x] Verify that borders across the application default to `1px` instead of `2px`.

---

## Phase 2: Core Primitive Overhaul

### Overview
Refactor the Shadcn/Radix primitive components to match the new elegant aesthetic.

### Changes Required:

#### 1. `src/components/ui/button.tsx`
- **Action**: Remove thick borders and dense font rules.
- **Action**: Update the base class to `font-medium` (removing `font-bold` or `uppercase` if present).
- **Action**: Ensure `premium` and `brand` variants are subtle and elegant (e.g., simple background colors, no heavy shadows).

#### 2. `src/components/ui/tabs.tsx`
- **Action**: Remove `uppercase` and `tracking-widest` from tab triggers.
- **Action**: Increase padding and simplify the active state (e.g., a simple subtle background or bottom border, removing heavy box borders).

#### 3. `src/components/ui/card.tsx`
- **Action**: Reduce border opacity (e.g., `border-white/5` instead of `border-white/10`).
- **Action**: Increase default padding (`p-6` or `p-8`) to add whitespace.

### Success Criteria:
#### Automated Verification:
- [x] Linting passes (`npm run lint`).
#### Manual Verification:
- [x] Buttons look soft, minimal, and do not use microscopic uppercase text.
- [x] Tabs are clean and legible without wide tracking.

---

## Phase 3: Marketing Layout Refactor

### Overview
Remove the dense brutalist typography from the marketing shell.

### Changes Required:

#### 1. `src/app/(marketing)/layout.tsx`
- **Action**: Remove `uppercase text-[12px] tracking-widest` from the Logo link.
- **Action**: Change navigation links from `text-[10px] font-bold tracking-widest uppercase` to `text-sm font-medium text-muted-foreground hover:text-foreground`.
- **Action**: Update the "Get started" button to use default sizing without `text-[10px] uppercase tracking-widest`.
- **Action**: Refactor the Footer typography to standard sizes (`text-sm` for headings, `text-sm` for links) and increase vertical spacing.

### Success Criteria:
#### Automated Verification:
- [x] Type checking passes (`tsc --noEmit`).
#### Manual Verification:
- [x] The marketing header and footer look calm and legible.
- [x] No tiny `10px` uppercase text remains.

---

## Phase 4: Dashboard & Application UI Refactor

### Overview
Overhaul the core Dashboard UI to increase whitespace, simplify the layout, and remove brutalist micro-typography.

### Changes Required:

#### 1. `src/ui/components/Dashboard.tsx`
- **Action**: Remove `uppercase tracking-widest text-[14px]` from the "Dashboard" title, replacing it with `text-lg font-semibold`.
- **Action**: Refactor the `<TabsTrigger>` elements. Remove `text-[10px] font-bold uppercase tracking-widest`. Use standard `text-sm font-medium`.
- **Action**: Remove the brutalist numeric badges (e.g., `<span className="size-4 ...">1</span>`) from the tabs, or replace them with simple, elegant icons/numbers without harsh borders.
- **Action**: Increase the main container spacing and padding to embrace "high whitespace".

#### 2. `src/ui/components/dashboard/views/*` (CustomerInputView, PersonaGridView, AnalysisResultView)
- **Action**: Scan for and remove `text-[9px]`, `text-[10px]`, `uppercase`, `tracking-widest`, `tracking-[0.3em]`, `font-black`.
- **Action**: Replace with standard `text-xs` or `text-sm` and `font-medium` or `font-normal`.
- **Action**: Soften borders inside these views.

#### 3. `src/ui/components/PersonaChat.tsx` & `ThoughtfulDialog.tsx`
- **Action**: Refactor dialog headers and chat UI to maintain the high whitespace, elegant typography approach.

### Success Criteria:
#### Automated Verification:
- [x] Tests pass (if applicable).
- [x] Linting passes (`npm run lint`).
#### Manual Verification:
- [x] The Dashboard feels airy and spacious.
- [x] The user flow (Input -> Personas -> Analysis) looks consistent and elegant.
- [x] All brutalist typography artifacts have been successfully eradicated.