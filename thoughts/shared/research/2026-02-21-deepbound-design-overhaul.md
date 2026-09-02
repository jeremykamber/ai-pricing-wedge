---
date: 2026-02-21T10:53:14-08:00
git_commit: 9184e82b25c306b9e03b64499aab722b8724fa92
branch: feat/deepbound-design-system-overhaul
repository: ai_user_testing_mvp
topic: "DeepBound Design Overhaul"
tags: [research, codebase, design-system, ui]
status: complete
---

# Research: DeepBound Design Overhaul

## Research Question

Overhaul the design system to match the 'DeepBound' brand (simplicity > everything, high whitespace, functional, elegant minimal UI). The stack is Next.js 16 App Router, React 19, Tailwind CSS v4, Radix primitives. Focus on:
- Locating all current pages
- Locating all shared UI components
- Understanding the current theme/colors/tailwind config.
- Documenting existing layout patterns that need to be improved.

## Summary

The current codebase utilizes Next.js App Router (`src/app`), heavily relies on Shadcn/Radix primitives (`src/components/ui/`), and manages UI features via specialized components (`src/ui/components/`). The styling strategy uses Tailwind CSS v4 with an inline `@theme` defined in `src/app/globals.css`. A key finding is that the current style exhibits a brutalist or highly industrial aesthetic (e.g., global `border-width: 2px !important;`, extensive use of `tracking-widest` and `uppercase` with extremely small font sizes like `text-[10px]`). This directly conflicts with the desired "elegant minimal UI" and "simplicity > everything" direction.

## Detailed Findings

### Pages and Layouts
- **File Structure:** Pages are located under `src/app/`. 
- **Root Layout:** (`src/app/layout.tsx:26`) The root explicitly hardcodes `<html lang="en" className="dark">`, enforcing dark mode globally.
- **Marketing Pages:** Located in `src/app/(marketing)/`.
  - The `layout.tsx` (e.g., `src/app/(marketing)/layout.tsx:11`) features dense typography with significant tracking adjustments.
- **Dashboard Pages:** Located in `src/app/(app)/dashboard/`.
- **Sandbox Pages:** `src/app/design-sandbox/page.tsx`.

### Shared UI Components
- **Radix/Shadcn Primitives:** Reside in `src/components/ui/` (e.g., `button.tsx`, `dialog.tsx`, `card.tsx`, `tabs.tsx`).
- **Domain/Feature UI:** Housed within `src/ui/components/` (e.g., `Dashboard.tsx`, `Logo.tsx`, `PersonaChat.tsx`, and `dashboard/views/`).
- **Component Styling Example:** (`src/components/ui/button.tsx:22`) The Button component defines custom variants like `premium` and `brand` and applies explicit classes like `rounded-lg` which maps to a `.5rem` border radius setup in globals.

### Theme, Colors, and Tailwind Configuration
- **Configuration Approach:** Tailwind CSS v4 is used with variables stored inline in `src/app/globals.css:7` under the `@theme` directive, utilizing `oklch` color spaces.
- **Fonts:** While `src/app/layout.tsx:5` injects Geist and Geist_Mono fonts, `src/app/globals.css:1` imports 'Inter' from Google Fonts and assigns it to `--font-sans`. This represents an inconsistency in typography handling.
- **Styling Overrides (Anti-Minimal):** 
  - `src/app/globals.css:98` forces a global hack `border-width: 2px !important;` on `.border` utility classes, creating a bulky look.
  - `src/app/globals.css:128` injects a custom slim scrollbar `custom-scrollbar`.

### Existing Layout Patterns to Improve
- **Typography Density:** Extensive use of `text-[9px]`, `text-[10px]`, `uppercase`, `tracking-widest`, `tracking-[0.3em]`, and `font-black` in layouts (e.g., `src/app/(marketing)/layout.tsx:46` and `src/ui/components/Dashboard.tsx:132`) creates a heavy, complex visual load opposed to "high whitespace, elegant minimal UI".
- **Density Over Spacing:** The dashboard uses dense tabs arrays and multiple layers of borders/cards nested within dialogs (`ThoughtfulDialog.tsx` usage in `Dashboard.tsx:196`).
- **Dark Mode Coupling:** The layout rigidly binds to `className="dark"`, which may restrict the adoption of lighter minimal UI themes common in 'clean/simple' designs unless the brand strictly dictates a dark-only minimal interface.

## Code References
- `src/app/globals.css:7` - Inline Tailwind v4 theme mapping.
- `src/app/globals.css:98` - Global `2px !important` border hack.
- `src/app/layout.tsx:26` - Hardcoded dark mode class mapping and Geist font assignments.
- `src/app/(marketing)/layout.tsx:11` - Marketing shell exhibiting dense typographic tracking/uppercase patterns.
- `src/ui/components/Dashboard.tsx:127` - Complex tab-based application layout interface showcasing Radix primitive composition.
- `src/components/ui/button.tsx:22` - Specialized `premium` and `brand` button variants.

## Open Questions
- Should the application strictly remain locked into `dark` mode, or does the "elegant minimal UI" brand direction mandate a light-mode refactoring?
- Is the intention to standardize exclusively on `Geist` fonts and strip `Inter` entirely?
- Which specific layout blocks (e.g. Dashboard navigation, Marketing header) should be immediately converted to high-whitespace grids rather than their current tight Flexbox formations?