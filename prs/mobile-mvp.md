# MVP: Persona management and simulation reviews on mobile

> The app currently works on desktop only. Opening `/dashboard/simulations/[id]` or `/dashboard/debates` on a phone shows two sidebars (dashboard + feature-specific) with a content area squeezed into the remaining ~150px. The app cannot meaningfully be used on a phone.

## Current behavior

The app is built desktop-first. Some responsive classes exist (`sm:`, `md:`, `lg:` breakpoints on padding, font sizes, and grid columns) but they were applied reactively to specific components rather than as part of a mobile strategy. There is no mobile navigation, no touch-aware interactions, and the 20px base font size makes content larger than necessary on small screens.

Specific problems:

### Navigation (total blocker)

The dashboard layout renders a fixed 240px sidebar (`w-60`) alongside a content area. On a 375px phone, the sidebar alone takes up 64% of the viewport, leaving ~135px for content. The debate page adds a **second** sidebar (another 256px) stacked alongside the dashboard sidebar, making the content area approximately zero (the debate sidebar starts at 240px and the content area just overflows).

There is no hamburger menu, bottom tab bar, or slide-over drawer. The three main nav links (Personas, Interviews, Simulations) are only accessible via sidebar. Debates is not linked from the sidebar at all and can only be reached by navigating to the URL directly.

### Hover-dependent interactions

Several critical actions depend on `opacity-0 group-hover:opacity-100`:

- Delete batch button (`DashboardClient.tsx:371`)
- Delete simulation button (`simulations/page.tsx:106`)
- Delete persona button (`PersonaProfilePanel.tsx:49`)

On touch devices, these buttons never appear — there is no long-press fallback or explicit delete action elsewhere.

### Font size

`html { font-size: 20px }` in `globals.css:117` makes all text ~25% larger than the browser default (16px). This is fine on a 27" display but means headings on mobile consume the entire viewport width. The `text-5xl` (3rem = 60px) hero on the marketing page is literally larger than most phone screens are tall.

### Page-by-page mobile experience

| Page | Problems |
|------|----------|
| `/` (marketing) | Already reasonably responsive. Hero font sizes could be smaller on mobile. |
| `/dashboard` (batch list / persona grid) | Batch list cards have hover delete. Persona grid is `grid-cols-1` on mobile (ok), but each card is content-heavy. |
| `/dashboard/new` | Survey form is long (8 questions). Chip buttons wrap well. Works on mobile but tedious to fill out. |
| `/dashboard/interviews` | Drag-and-drop upload zone has click fallback. Form is straightforward. |
| `/dashboard/simulations` | NewSimulationForm has mode toggle, URL input, textareas, file upload — long form but scrollable. Simulation cards have hover delete. |
| `/dashboard/simulations/[id]` | Per-persona accordions, executive synthesis — mostly text content, works on mobile. |
| `/dashboard/generating/[runId]` | Step indicator + progress bar — simple, works. |
| `/dashboard/debates` | Two sidebars make it unusable. Chat UI (DebateRoom) would work well on mobile if the sidebars were resolved. |
| Dialogs/Sheets | `PersonaDetailSheet` uses `h-[85dvh]` (good — dvh is the right unit) and `max-w-[680px]`. Likely usable. `PersonaDetailModal` uses `w-[95vw]`. The `FlowDialog` already has `flex-col md:flex-row` patterns. |
| Toasts | Fixed `bottom-right` — hard to reach on large phones with one hand. |
| `FloatingSimulationButton` | Fixed `bottom-6 right-6` — would conflict with mobile bottom nav. |

## What mobile-first means here

The app does not need to support every mobile use case equally. The most useful mobile scenarios are:

1. **Reviewing simulation results** — reading persona feedback, findings, and synthesis during a meeting or on the go
2. **Tracking generation progress** — glancing at persona generation status
3. **Quick chat with a persona** — asking a follow-up question
4. **Starting a generation** — entering a brief audience description

The heaviest forms (survey-based persona creation, lengthy debate setup) are secondary for mobile. The goal is that the primary read-only and quick-input flows work well on a phone, not that every feature is equally optimized.

## What to build

### Navigation (essential)

Replace the fixed sidebar with a responsive pattern:

- **Desktop (md+):** sidebar visible as-is
- **Mobile (<md):** sidebar becomes a slide-over drawer triggered by a hamburger button in a top bar. The user's current page is always visible behind the drawer.
- **Bottom tab bar** for mobile: Personas, Interviews, Simulations, Debates as a fixed-height bar at the bottom of the viewport.
- The debate sidebar should merge into the mobile tab bar or become a secondary sheet.

### Touch interactions (essential)

- Replace hover-only delete buttons with always-visible or action-menu patterns on mobile.
- Touch targets should be at least 44px. Current `h-10` buttons at 20px font size are ~40px — close but worth auditing.

### Font size (medium priority)

- Keep 20px base on desktop.
- Reduce to 16px base on mobile via a `@media (max-width: 768px)` override, or use responsive text size utilities throughout.
- Audit the 10+ places where `md:text-*` is used and add `text-*` mobile equivalents where missing.

### Page responsiveness (medium priority)

Most pages need incremental changes:

- `/dashboard`: persona grid (`grid-cols-1` already correct), batch list cards need hover fixes
- `/dashboard/simulations`: simulation cards need hover fixes
- `/dashboard/debates`: resolve the two-sidebar problem; the chat room itself works on mobile
- `FloatingSimulationButton`: hide on mobile when bottom tab bar is visible, or reposition
- Toaster: position `bottom-center` on mobile, `bottom-right` on desktop
- All dialogs and sheets: verify they respect viewport constraints. Most are already close.

### Input & forms (lower priority)

- The guided survey form is 8 questions with chip buttons — works on mobile but is tedious. Consider a condensed mobile layout.
- The textarea-only mode (freeform description) is better for mobile — one field, one button. Consider making it the default on mobile.
- Number inputs (`personaCount`) should use `type="number"` with `inputmode="numeric"` — already done.
- File upload drag-and-drop is already backed by a hidden `<input type="file">` — works on mobile.

### What to defer

- Mobile PWA support (manifest, service worker, offline)
- Touch gestures (swipe to delete, pull to refresh)
- Real device testing beyond iPhone Safari / Chrome responsive mode
- Light mode (the theme toggle is commented out)
- Native app wrappers

## Effort estimate

| Area | Days | Notes |
|------|------|-------|
| Responsive dashboard shell + mobile nav | 3-4 | New `MobileSidebar` component, bottom tab bar, hook for nav state, responsive layout wrapper. Needs to handle both sidebar types (main + debate). |
| Touch interaction cleanup | 1 | Audit hover-dependent buttons, add touch fallbacks. Mainly 3 components. |
| Font size responsive strategy | 0.5-1 | Decide on approach (media query on html vs. responsive utilities). Global change in `globals.css` + component audit. |
| Page-by-page responsive pass | 3-4 | Each route gets reviewed: debate two-sidebar fix, simulation cards, toaster/button positioning, dialog sizing. Mostly CSS/scaffold changes, no business logic. |
| Form mobile pass | 1 | Guided survey condensed layout on mobile, make freeform default on small screens. |
| **Total** | **9-14** | |

This assumes a single experienced frontend engineer familiar with the codebase working full-time. The work is mostly additive (new components for mobile nav, responsive wrappers) with targeted edits to existing components. No data layer changes, no API changes, no store changes.

## Questions

1. Should the bottom tab bar include Debates? It is currently not in the sidebar nav. Adding it to the tab bar would be the right UX but means adding a sidebar link too for consistency.
2. Mobile nav design: are we fine with a standard slide-over drawer + bottom tab bar, or should we explore a more opinionated mobile nav (e.g., top tab bar, swipeable panels)?
3. Font size strategy: is a media query on `html` acceptable, or should we do a Tailwind `@screen` approach with utilities? The former is simpler but means every existing component gets smaller text on mobile automatically (which is correct) — it could break carefully tuned layouts that depend on the 20px base.
