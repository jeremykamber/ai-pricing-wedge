---
date: 2026-02-21T13:02:19-08:00
git_commit: 2381f083b26a254f44b64786211f5cbeb4c8feea
branch: feat/ui-refinements
repository: ai_user_testing_mvp
topic: "UI Refinements & Bug Fixes"
tags: [research, ui, bugfix, chat, simulation, persona]
status: complete
---

# Research: UI Refinements & Bug Fixes

## Research Question

Conduct comprehensive research for the task:
1. Re-add preview of what AI agents are seeing (screenshots of the pricing page as they are captured, but NOT the full page screenshot) into the "Running simulations" UI.
2. Enable chatting with each persona BEFORE the report is done, not just after.
3. Fix the visual glitch where "Running simulations" dialog shows all nodes checked and filled out for a split second before resetting to the normal state.
4. Fix the runtime TypeError in PersonaChat.tsx: `Cannot read properties of undefined (reading 'trim')` at line 111.

## Summary

This research investigates four distinct tasks across the Next.js React application. 
- For the agent vision preview, we found the `AnalysisProgress` object provides base64 screenshots (`analysisFlow.analysisProgress.screenshot`) streamed live during parsing which can be rendered directly inside the simulation `FlowDialog` within `DashboardClient.tsx`.
- The persona chat feature is provided by the `PersonaChat.tsx` slide-out, which was previously only available on the `ResultsView.tsx`. We discovered that `PersonaProfilePanel.tsx` can be extended to accept an `onChatClick` prop, allowing `AudienceView.tsx` to mount the chat overlay before simulations run.
- The visual glitch in `FlowDialog` stems from an incorrect initial streaming state. The server-action `analyzePricingPageAction` emitted `SETTING_UP_AGENT`, which wasn't defined in `PricingAnalysisProgressStep` mapping. This caused `currentStep` in `DashboardClient.tsx` to default to `3` (completed) until a mapped state like `STARTING` or `OPENING_PAGE` updated the UI.
- The `TypeError` in `PersonaChat.tsx` happens because `input` state initialized from `useChat` can be undefined, and `input.trim()` throws an error on evaluation for the submit button's `disabled` prop.

## Detailed Findings

### AI Agent Vision Preview
- What exists: `useAnalysisFlow.ts` already receives and parses `screenshot` data from `analyzePricingPage.ts` via RSC streaming (`@ai-sdk/rsc`). The `ParsePricingPageUseCase.ts` captures viewports using Playwright (`lastScoutingViewport` and live viewports).
- How it connects: `DashboardClient.tsx` uses `FlowDialog` to display `analysisFlow.analysisProgress`. We can insert an `<img>` tag with the base64 string directly below the progress text.

### Early Persona Chat
- What exists: `AudienceView.tsx` iterates over personas and renders `PersonaProfilePanel.tsx` cards. The chat is implemented via `PersonaChat.tsx`, relying on the Vercel AI SDK.
- How it connects: By adding an optional `onChatClick` prop to `PersonaProfilePanel` and local component state (`selectedPersonaId`) inside `AudienceView`, the chat slide-out (`PersonaChat`) can be triggered for each persona independently prior to proceeding to `ResultsView`. 

### Visual Glitch in "Running simulations"
- What exists: `DashboardClient.tsx` computes `currentStep` based on `analysisFlow.analysisProgress?.step`. `FlowDialog.tsx` renders all nodes as complete if `currentStep` is `3`.
- How it connects: `analyzePricingPage.ts` (the server action starting the simulation) initialized the stream with `step: "SETTING_UP_AGENT"`. This unmapped string resolves `currentStep` to `3` in `DashboardClient.tsx`'s ternary logic, creating a momentary flash of "all steps complete" until the correct `STARTING` or `OPENING_PAGE` states are emitted by Playwright navigation hooks.

### TypeError in PersonaChat.tsx
- What exists: `PersonaChat.tsx` uses `useChat()` from `@ai-sdk/react`. The input value is bound to the form and submit button, determining disabled state: `disabled={isLoading || !input.trim()}` (line 111).
- How it connects: Initial or reset states where `input` evaluates to `undefined` cause a runtime crash. Changing it to safely handle falsy values (`!input || !input.trim()`) resolves the component crash.

## Code References

- `src/ui/dashboard/components/DashboardClient.tsx:112` - "Running simulations" `FlowDialog` implementation.
- `src/ui/dashboard/components/views/AudienceView.tsx:12` - Audience persona list view.
- `src/components/custom/PersonaProfilePanel.tsx:18` - Individual persona display card.
- `src/actions/analyzePricingPage.ts:20` - Streaming initialization state.
- `src/application/usecases/ParsePricingPageUseCase.ts:10` - `PricingAnalysisProgressStep` valid steps map.
- `src/ui/dashboard/components/chat/PersonaChat.tsx:111` - Send button disabled prop logic.

## Open Questions

- Is there a need to store early chat context (pre-report chat logs) to influence the persona's response in the final pricing analysis phase? Currently, they act as independent LLM conversations and evaluations.
- Should we overlay gaze heatmaps dynamically on top of the live viewports during parsing, or keep it strictly for the final results view?
