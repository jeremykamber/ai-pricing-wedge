# ADR: Client-Side PDF Report Export

## Context
During the launch period, Kynd operates without forced user accounts or authentication. Analyses and persona batches are saved in client-side IndexedDB. When users complete an analysis simulation, they need a tangible, permanent artifact of their results that survives browser data clears and can be shared with stakeholders.

## Decision
Implement a pure client-side PDF generation and export feature using the already-installed `@react-pdf/renderer` package directly within the completed analysis view (`/dashboard/analyses/[id]`). Defer transactional email delivery and server-side cloud storage (Supabase) until post-MVP validation.

## Chosen Approach
- Add a prominent "Export PDF" / "Download Report" action to `CompletedView`.
- Build a dedicated, styled PDF document template component using `@react-pdf/renderer` primitives (`Document`, `Page`, `View`, `Text`, `StyleSheet`).
- Render executive synthesis, research question answers, aggregated friction/unanswered questions, cognitive journey tables, and major findings per persona.
- Download the resulting blob directly on the client with zero network requests or backend state.

## Runner-Up
- **Option 2 (HTML Email + PDF):** Deferred to avoid introducing external email provider credentials, rate-limiting, and unauthenticated relay abuse risks before demand is validated.

## Failure Mode to Watch
- **Memory / Rendering Performance:** Rendering large PDF documents with deep nested views or large embedded base64 screenshots directly in the browser thread can cause brief UI stutters. (Mitigated by generating on-demand asynchronously and styling cleanly without giant embedded images unless needed).

## Measured By
- No measurable outcome yet (launch utility feature).

## Verification Strategy
- Component unit test verifying PDF document data binding and structure.
- Browser test validating export trigger, button states, and download delivery without console errors.
