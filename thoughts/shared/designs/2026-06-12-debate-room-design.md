---
date: 2026-06-12
topic: "Debate Room — Interactive Group Simulation Chat"
status: validated
---

# Debate Room: Interactive Group Simulation Chat

## Problem Statement

Kynd currently supports only 1:1 persona chat (user ↔ single persona). This is powerful for individual interviews, but product strategy decisions are never made in a vacuum. A founder evaluating a pricing change needs to see how **competing organizational perspectives** clash and resolve.

The goal is to transform Kynd from a static reporting tool into a living, dynamic sandbox where users can observe multi-persona debates driven by conflicting personality traits, roles, and values.

## Constraints

- **No additional LLM calls per turn** beyond the persona's own response — no moderator/referee LLM
- **Debate quality comes from prompt engineering**, not synthetic framing of what to say
- **Low latency** — users should see streaming responses, not wait for cascading LLM calls
- **Works with ANY personas** — not just the predefined cast; users pick from their existing persona batches
- **Multi-debate support** from day one — users can run N debates side-by-side (capped at 3 concurrent in UI)
- **Fits existing architecture** — Clean Architecture ports/adapters, Server Actions, streaming via `@ai-sdk/rsc`

## Approach

**Sequential round-robin within each debate round.** Persona A streams → Persona B streams → Persona C streams. Each persona receives the full conversation transcript + their full identity/trait profile + deterministic trait-based directives. The LLM naturally produces disagreement rooted in the persona's traits without being told what to think.

**Core insight:** The existing `PersonaPromptCompiler` already has trait-behavior mappings (e.g., "Low Agreeableness: You challenge everything"). When we feed a persona a transcript where someone said something their traits would oppose, the LLM produces authentic disagreement organically. No separate framing LLM needed.

**Rejected:**
- Parallel responses (personas can't react to each other)
- Moderator LLM that generates framing text (two LLM calls per turn, errors compound, undermines persona authenticity)
- Full free-form group chat (hard to control, personas talk over each other)

## Architecture

### New Files

| Layer | File | Responsibility |
|-------|------|---------------|
| Domain | `src/domain/entities/DebateRoom.ts` | Debate entity, messages, status |
| Domain | `src/domain/entities/DebatePersona.ts` | Lightweight persona subset for debate participants |
| Port | `src/domain/ports/IDebateServicePort.ts` | Contract for debate orchestration |
| Use Case | `src/application/usecases/DebateUseCase.ts` | Orchestrates round-robin turns, builds transcript state |
| Adapter | `src/infrastructure/adapters/DebateAdapter.ts` | Builds debate prompts, calls LLM per turn, streams events |
| Adapter | `src/infrastructure/adapters/DebatePromptCompiler.ts` | Deterministic prompt assembly (identity + debate context + trait directives) |
| Action | `src/actions/debateAction.ts` | Server action with structured event streaming |
| Hook | `src/ui/hooks/useDebate.ts` | Manages debate state, streaming, localStorage persistence |
| Store | `src/ui/stores/debateStore.ts` | Zustand store for N debates, active debate tracking |
| UI | `src/ui/dashboard/components/debate/DebateRoom.tsx` | Main debate room component |
| UI | `src/ui/dashboard/components/debate/DebateSetupPanel.tsx` | Config panel (pick personas, enter proposal, set rounds) |
| UI | `src/ui/dashboard/components/debate/DebateMessageBubble.tsx` | Individual message with persona avatar/name/role |
| UI | `src/ui/dashboard/components/debate/DebateSidebar.tsx` | Sidebar listing all debates with status |

### No changes to existing files

| File | Why unchanged |
|------|--------------|
| `PersonaPromptCompiler.ts` | Reused directly for persona identity; we wrap its output with debate context |
| `ChatAdapter.ts` | Debate has its own adapter — cleaner than overloading |
| `LlmServiceImpl.ts` | Already supports streaming; we call `createChatCompletionStream()` directly |
| `Persona.ts` | Already has all required fields (Big Five, values, fears, comm style) |
| `personaStore.ts` | Independent concern; debate picks personas from store but manages its own state |

## Components

### Domain Entities

**DebateRoom** — the aggregate root:
```typescript
interface DebateRoom {
  id: string;
  proposal: string;
  participants: Persona[];           // 2-5 personas
  messages: DebateMessage[];         // Full transcript
  currentRound: number;
  totalRounds: number;               // Default: 3
  status: 'setup' | 'in_progress' | 'completed' | 'error';
  error?: string;
  createdAt: string;
}
```

**DebateMessage** — a single utterance:
```typescript
interface DebateMessage {
  id: string;
  personaId: string | 'user';
  personaName: string;
  role: 'participant' | 'user';
  round: number;
  content: string;
  order: number;                     // Global sequence for sorting
}
```

### DebatePromptCompiler

This is the heart of the feature. It builds each persona's prompt deterministically — **no LLM calls**:

```typescript
class DebatePromptCompiler {
  buildPersonaPrompt(
    persona: Persona,
    participants: { name: string; occupation: string; keyValues: string[] }[],
    proposal: string,
    transcript: string,
    round: number,
    totalRounds: number,
  ): string
}
```

The output structure:

```
<<PERSONA IDENTITY>>      // Delegates to PersonaPromptCompiler.compileSystemPrompt()
<<PSYCHOGRAPHIC PROFILE>> // Big Five + values/fears + behavioral rules (reused)
<<EPISTEMIC BOUNDARIES>>  // What persona knows/doesn't know (reused)
<<BEHAVIORAL GUARDRAILS>> // Response constraints (reused)

<<DEBATE CONTEXT>>
Proposal: "[the proposal being debated]"

You are debating this proposal with:
- [Name] ([Occupation]): cares about [values extracted from persona]
- [Name] ([Occupation]): cares about [values extracted from persona]

Your role: [role label based on occupation + key values]

<<CURRENT DEBATE STATE>>
Round [N] of [totalRounds]
[If round 1]: "Awaiting first responses."
[If round > 1]: Formatted transcript of what's been said so far:
  Round 1:
    [Name]: "[their message]"
    [Name]: "[their message]"

<<YOUR RESPONSE>>
- Address specific points made by each participant who has spoken
- If you disagree with something, challenge it directly using your own reasoning
- Ground your position in your values, experience, and role
- Keep your response to 2-3 paragraphs
- Speak naturally — this is a strategy discussion among colleagues
```

The trait-based directives are **deterministic** — compiled at prompt-assembly time based on the persona's Big Five:

```typescript
private getTraitDirectives(persona: Persona): string[] {
  const directives: string[] = [];

  if (persona.neuroticism >= 60) {
    directives.push("- Your risk awareness is high — scrutinize optimistic claims and timelines");
  }
  if (persona.neuroticism <= 40) {
    directives.push("- You're naturally optimistic — don't let others' risk aversion dampen your openness");
  }
  if (persona.agreeableness <= 40) {
    directives.push("- Challenge assumptions others present — push for evidence");
  }
  if (persona.agreeableness >= 60) {
    directives.push("- Seek common ground, but don't sacrifice your position to avoid friction");
  }
  // etc. for all 5 dimensions

  return directives;
}
```

### DebateAdapter

Orchestrates a single debate run. Called per-debate, not persistent between calls:

```typescript
class DebateAdapter {
  constructor(private llmService: LlmServiceImpl, private promptCompiler: DebatePromptCompiler) {}

  async * executeDebate(
    proposal: string,
    participants: Persona[],
    totalRounds: number,
  ): AsyncIterable<DebateStreamEvent> {
    const transcript: DebateMessage[] = [];

    yield { type: 'debate_start', proposal, participants: participants.map(p => p.name) };

    for (let round = 1; round <= totalRounds; round++) {
      yield { type: 'round_start', round, totalRounds };

      for (const persona of participants) {
        yield { type: 'persona_start', personaId: persona.id, personaName: persona.name };

        const formattedTranscript = this.formatTranscript(transcript, round, totalRounds);
        const systemPrompt = this.promptCompiler.buildPersonaPrompt(
          persona,
          participants,
          proposal,
          formattedTranscript,
          round,
          totalRounds,
        );

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `What are your thoughts on this proposal, ${persona.name}?` },
        ];

        let fullResponse = "";
        for await (const chunk of this.llmService.createChatCompletionStream(messages, {
          temperature: 0.7,
          purpose: "Debate",
        })) {
          fullResponse += chunk;
          yield { type: 'chunk', personaId: persona.id, text: chunk };
        }

        const message: DebateMessage = {
          id: crypto.randomUUID(),
          personaId: persona.id,
          personaName: persona.name,
          role: 'participant',
          round,
          content: fullResponse,
          order: transcript.length,
        };
        transcript.push(message);

        yield { type: 'persona_end', personaId: persona.id };
      }

      yield { type: 'round_end', round };
    }

    yield { type: 'debate_end' };
  }
}
```

### Streaming Event Protocol

All events that the server action yields:

| Event | Fields | Meaning |
|-------|--------|---------|
| `debate_start` | `proposal`, `participants[]` | Debate initiated |
| `round_start` | `round`, `totalRounds` | Round N of M |
| `persona_start` | `personaId`, `personaName` | Persona is generating |
| `chunk` | `personaId`, `text` | Streaming text chunk |
| `persona_end` | `personaId` | Persona finished |
| `round_end` | `round` | Round complete |
| `debate_end` | none | All rounds complete |
| `error` | `message` | Fatal error — stop |

### Server Action

```typescript
// src/actions/debateAction.ts
"use server";

export async function debateAction(
  proposal: string,
  participants: Persona[],
  totalRounds: number,
) {
  const stream = createStreamableValue<any>("");

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const adapter = new DebateAdapter(llmService, new DebatePromptCompiler());

      let fullState = { messages: [] };

      for await (const event of adapter.executeDebate(proposal, participants, totalRounds)) {
        if (event.type === 'chunk' || event.type === 'persona_start' || event.type === 'persona_end') {
          // Streaming events — push individual
          stream.update(event);
        } else if (event.type === 'round_start' || event.type === 'debate_start') {
          // Metadata events
          stream.update(event);
        } else if (event.type === 'round_end') {
          stream.update(event);
        } else if (event.type === 'debate_end') {
          stream.done({ type: 'debate_end' });
          return;
        } else if (event.type === 'error') {
          stream.done({ type: 'error', message: event.message });
          return;
        }
      }

      stream.done({ type: 'debate_end' });
    } catch (error) {
      stream.done({ type: 'error', message: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}
```

## Data Flow

```
┌──────────────┐     proposal + 3 personas + rounds
│ DebateRoom   │ ──────────────────────────────────────────┐
│ (UI)         │                                            │
│              │     stream of DebateStreamEvent[]           │
│              │ ◄──────────────────────────────────────────┘
└──────────────┘
       │
       │ calls
       ▼
┌──────────────────────┐
│ debateAction()       │  Server action: createStreamableValue
│ src/actions/         │  Reads events from adapter, streams to client
└──────────────────────┘
       │
       │ creates
       ▼
┌──────────────────────┐
│ DebateAdapter        │  Iterates rounds × personas
│ executeDebate()      │  For each: builds prompt → calls LLM → yields events
└──────────────────────┘
       │
       │ uses
       ▼
┌──────────────────────┐
│ DebatePromptCompiler │  buildPersonaPrompt(): deterministic assembly
│                      │  Reuses PersonaPromptCompiler.compileSystemPrompt()
│                      │  Injects role labels, participant info, transcript
│                      │  Adds deterministic trait-based directives
└──────────────────────┘
       │
       │ calls
       ▼
┌──────────────────────┐
│ LlmServiceImpl       │  createChatCompletionStream()
│ (existing)           │  OpenRouter → streamed chunks
└──────────────────────┘
```

## Multi-Debate Support

**Architecture:** Each `debateAction()` call is fully independent. Server is stateless. The client manages N debates via a `debateStore`:

```
debateStore (Zustand + localStorage persistence):
  debates: DebateRoom[]          // All debates, past and present
  activeDebateId: string         // Which one is displayed
  isStreaming: boolean           // Any debate currently receiving events
```

Each `DebateRoom` in the store has its own message array and streaming flag. The UI shows a sidebar listing all debates with status badges (completed/in_progress/error). Clicking one sets `activeDebateId` and shows that room.

**Limits:**
- Concurrent active (streaming) debates: 3 max in UI
- Stored debates: unlimited (localStorage, same pattern as `persona_chat_{id}`)
- Participants per debate: 2-5 (3 sweet spot)

**User interjection flow:** When a debate is in progress and the user types in the input bar, it pauses auto-advance, adds a user message to the transcript, then resumes with all personas responding to the user's point in the next round. This makes the debate interactive rather than a passively watched simulation.

## UI Design

### Debate Room Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  🏛️  Strategy Room                                  [↻ New Debate]  │
│  Proposal: "Raise prices from $49 to $79/mo"                        │
│  Participants: Avery (CTO) · Riley (VP Eng) · Casey (Lead PM)        │
│  Round 2 of 3                                                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ── Round 1 ─────────────────────────────────────────────────────    │
│                                                                      │
│  [AV] Avery (CTO)                                       11:32 AM     │
│  I have serious concerns about the compliance implications here.     │
│  A 60% price increase..."                                           │
│                                                                      │
│  [RI] Riley (VP Engineering)                             11:33 AM     │
│  I hear the compliance concerns, Avery, but from an engineering      │
│  perspective we could implement tiered pricing in two sprints...     │
│                                                                      │
│  [CA] Casey (Product Manager)                            11:34 AM     │
│  Interesting tension between compliance and velocity. From the       │
│  user side, our feedback suggests the current pricing is actually    │
│  a barrier to close..."                                              │
│                                                                      │
│  ── Round 2 ─────────────────────────────────────────────────────    │
│                                                                      │
│  [AV] Avery (CTO)                                       11:35 AM     │
│  Riley, two sprints feels optimistic given the compliance...         │
│  And Casey, I'd push back on "users want this" — that might be...   │
│                                                                      │
│  [RI] Riley (VP Engineering)                             [typing…]   │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  [ What if we started with a 15% increase? ]              [Send]     │
└──────────────────────────────────────────────────────────────────────┘
```

### Key UX Details

- **Pulse dots** during `persona_start` → first `chunk` gap (shows "...is thinking")
- **Auto-scroll** to latest message, but user can scroll up to read history
- **Round separators** help orient where in the debate flow they are
- **Progress indicator** shows "Round 2 of 3" with a step bar
- **Copy transcript** button exports full debate as markdown
- **User messages** appear as special bubbles with "You (Founder)" label
- **Debate history sidebar** accessible from dashboard — list of all past debates with proposal preview

### Sidebar for Multi-Debate

```
┌──────────────────────┐
│ 💬 Debates           │
│                      │
│ ● Strategy Room      │  ← Active (in progress)
│   "Raise prices 30%" │
│                      │
│ ○ Pricing Tiers      │  ← Completed
│   "Usage-based vs    │
│    flat-rate"        │
│                      │
│ ○ Feature Launch     │  ← Completed
│   "Ship in Q2 vs Q3" │
│                      │
│ [+ New Debate]       │
└──────────────────────┘
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| LLM call fails for one persona | Log error, emit `persona_end` for that persona, continue with next persona. Note "[Persona] is unavailable" in transcript |
| All LLM calls fail | Emit `error` event, debate goes to `error` status |
| Stream disconnects mid-debate | Client falls back to polling server store (same pattern as `useAnalysisFlow.ts`) |
| User navigates away | Debate continues on server until completion; results stored in `debateStore`; user can return later |
| Rate limiting | Retry once with 2s backoff; skip persona's turn if fails again |

## Testing Strategy

1. **DebatePromptCompiler unit tests:**
   - Verify deterministic trait directives match Big Five values
   - Verify transcript formatting includes all previous messages
   - Verify role labels are correct based on occupation

2. **DebateAdapter integration tests:**
   - Mock LLM, verify event order: `debate_start` → `round_start` → `persona_start` → `chunk*` → `persona_end` → ... → `debate_end`
   - Verify 3 personas × 3 rounds = 9 persona responses

3. **Streaming protocol test:**
   - Verify structured events parse correctly on client
   - Verify `persona_start` → first `chunk` gap triggers typing UI

4. **E2E test:**
   - Start debate with 3 mock personas
   - Verify all 3 respond in round 1
   - Verify round 2 shows personas referencing each other's points
   - Verify user interjection pauses and resumes
   - Verify debate persists after page reload

5. **Multi-debate test:**
   - Start 2 debates, verify each streams independently
   - Verify switching between them shows correct state

## Open Questions

- **Backstory ingestion for debate:** Should each persona's backstory be ID-RAG ingested first (like `ChatAdapter` does)? This is cheap and adds authenticity. I'd lean yes.
- **Temperature per persona:** Should we vary temperature based on the persona's traits (e.g., higher temp for more creative/open personas)? Worth experimenting with in phase 2.
- **Tone guardrails:** Should the `DebatePromptCompiler` inject "Be direct but respectful — this is a strategy debate" or similar? I lean yes to set tone expectations.
