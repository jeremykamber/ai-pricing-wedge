## Fixes for UI Refinements
- Re-added the intermediate screenshot preview in the FlowDialog so you can see what the agent sees as it evaluates the page (without showing the massive full page screenshot).
- Refactored `AudienceView.tsx` and `PersonaProfilePanel` to allow opening the Persona Chat immediately, before analysis reports are generated.
- Fixed the glitch where `FlowDialog` momentarily displayed all steps checked by setting the initial unmapped step `SETTING_UP_AGENT` to map to the starting step (0) in the tracker.
- Safely handled undefined `input` strings in `PersonaChat.tsx` to fix the `Cannot read properties of undefined (reading 'trim')` crash.
