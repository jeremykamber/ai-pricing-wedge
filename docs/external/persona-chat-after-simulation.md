# Persona chat after simulation — where the stack lives

Durable map for anyone extending the "chat with a persona after a simulation"
feature. Written 2026-08-12 (feat/chat-after-simulation).

## The chat stack (existing, was silently ungrounded)

The chat feature was previously wired only into the pre-simulation views
(`ResultsView`, `AudienceView`, `PersonaDetailSheet`) and hardcoded
`analysis: null` — so personas could be interviewed before testing but never
about what they actually saw. The full stack:

- UI: `src/ui/dashboard/components/chat/PersonaChat.tsx` (modal),
  `PersonaChatInline.tsx` (tab), `PanelChat.tsx` (cohort modal, new).
- Action: `src/actions/chatWithPersona.ts`, `src/actions/chatWithPanel.ts`
  (both dual-mode: local via use cases, remote via VPS API routes).
- Use cases: `ChatWithPersonaUseCase`, `ChatWithPanelUseCase`.
- Domain port: `LlmServicePort.chatWithPersonaStream`, `chatWithPanelStream`.
- Adapter: `ChatAdapter` (ID-RAG backstory grounding) → `ChatPromptCompiler`
  → `LlmServiceImpl.createChatCompletionStream` (OpenRouter).

## Grounding types — the deprecated mismatch

- `PricingAnalysis` (legacy, @deprecated) vs `PersonaResponse` (modern,
  artifact-agnostic). Simulations produce `PersonaResponse[]`.
- The chat context type is `ChatAnalysisContext = PricingAnalysis | PersonaResponse | null`
  (defined in `LlmServicePort`). `ChatPromptCompiler.buildAnalysisContext`
  renders "what you saw in the simulation" from a `PersonaResponse`
  (overview, journey, findings, frictions, open questions, research answer).
- `PersonaResponse.personaId` links back to the full `Persona`; the report
  page resolves via `src/ui/dashboard/utils/resolveChatPersona.ts` (store
  match by id/name, else reconstruct from `PersonaProfile` — age unknown → 0,
  prompt renders "—"). Never assume the source batch still exists.

## Panel (cohort) synthesis chat

`PanelChat` + `chatWithPanelAction` → `ChatWithPanelUseCase` →
`chatWithPanelStream` → `ChatPromptCompiler.compilePanelMessages`. It answers
"what would our users think of X?" grounded in ALL responses + the
`ArtifactSynthesis`. No persona identity — it's a research-synthesis voice.
VPS route: `POST /api/vps/chat-with-panel` (mirrors chat-with-persona).

## Local vs VPS

`shouldRunLocally()` (FORCE_LOCAL=true) runs use cases in-process; otherwise
actions POST to `${VPS_BACKEND_URL}/api/vps/...`. Backend changes require a
VPS pull + `npx pm2 restart` before remote mode reflects them.
