# Implementation Plan: Debate Room — Interactive Group Simulation Chat

**Date:** 2026-06-12
**Source Design:** `thoughts/shared/designs/2026-06-12-debate-room-design.md`
**Architecture:** Hexagonal (Domain → Application → Infrastructure → UI)
**Testing:** vitest, `__tests__/` alongside source files
**Runtime:** Bun, Next.js 14 App Router

---

## Research Completed

All research done directly (no subagents needed — design doc + direct reads of existing patterns):

- **`chatWithPersonaAction.ts`** — Server action pattern: `"use server"`, `createStreamableValue`, async IIFE with try/catch, `return { streamData: stream.value }`
- **`useAnalysisFlow.ts`** — Hook pattern for streaming: `readStreamableValue`, progress state management, abort handling
- **`simulationStore.ts`** — Zustand persist pattern: `persist(create<T>()(...), { name, storage: createJSONStorage(() => localStorage), partialize })`
- **`PersonaChat.tsx`** — UI pattern: `"use client"`, `useLocalStorage`, `readStreamableValue` for streaming, `useTransition` for pending state
- **`PersonaPromptCompiler.ts`** — Prompt compilation with `<<SECTION>>` markers, Big Five trait directives
- **`ChatAdapter.ts`** — Adapter pattern using `LlmServiceImpl.createChatCompletionStream()` with OpenAI-style messages array
- **`ChatWithPersonaUseCase.ts`** — Thin use case wrapping `LlmServicePort`
- **`LlmServiceImpl.ts`** — `createChatCompletionStream(messages, { temperature, purpose }): AsyncIterable<string>`
- **`Persona.ts`** — Full Persona interface with all Big Five + psychographic fields
- **Simulation entity/store** — Zustand with `add/update/remove/markComplete/markError` pattern, `persist` middleware, `partialize` for filtering streaming data

---

## Files To Create (13 new files)

| # | File | Purpose | Type |
|---|------|---------|------|
| 1 | `src/domain/entities/DebateRoom.ts` | Debate entity interface, DebateMessage, DebateStreamEvent types | Domain |
| 2 | `src/domain/ports/IDebateServicePort.ts` | Contract for debate orchestration | Port |
| 3 | `src/application/usecases/DebateUseCase.ts` | Thin use case wrapping DebateAdapter | Use Case |
| 4 | `src/infrastructure/adapters/DebatePromptCompiler.ts` | Deterministic prompt assembly (reuses PersonaPromptCompiler) | Adapter |
| 5 | `src/infrastructure/adapters/DebateAdapter.ts` | Orchestrator: rounds × personas, LLM calls, streaming events | Adapter |
| 6 | `src/actions/debateAction.ts` | Server action with streaming via createStreamableValue | Action |
| 7 | `src/ui/stores/debateStore.ts` | Zustand store with localStorage persistence | Store |
| 8 | `src/ui/hooks/useDebate.ts` | Streaming consumption, state updates, interjection | Hook |
| 9 | `src/ui/dashboard/components/debate/DebateSetupPanel.tsx` | Config panel (pick personas, enter proposal, set rounds) | UI |
| 10 | `src/ui/dashboard/components/debate/DebateMessageBubble.tsx` | Single message with avatar/name/role | UI |
| 11 | `src/ui/dashboard/components/debate/DebateSidebar.tsx` | Sidebar listing all debates | UI |
| 12 | `src/ui/dashboard/components/debate/DebateRoom.tsx` | Main debate room UI | UI |
| 13 | `src/app/(app)/dashboard/debates/page.tsx` | New debates route page | Route |

## Files To Modify (2 existing files)

| # | File | Changes |
|---|------|---------|
| 14 | `src/ui/dashboard/components/Sidebar.tsx` | Add "Debates" nav link with `MessageSquareIcon` |
| 15 | `src/ui/dashboard/components/DashboardClient.tsx` | Add "New Debate" button in persona batch view to launch setup |

---

## Task Sequence (6 parallel batches)

### Dependency Graph

```
Batch 1 (parallel — 3 implementers): 1.1, 1.2, 1.3
Batch 2 (parallel — 2 implementers): 2.1, 2.2
Batch 3 (parallel — 1 implementer):  3.1
Batch 4 (parallel — 2 implementers): 4.1, 4.2
Batch 5 (parallel — 4 implementers): 5.1, 5.2, 5.3, 5.4
Batch 6 (parallel — 3 implementers): 6.1, 6.2, 6.3
```

---

### Batch 1: Foundation (parallel — 3 implementers)

All tasks have NO dependencies — run simultaneously.

---

#### Task 1.1: Domain types — DebateRoom, DebateMessage, DebateStreamEvent

**File:** `src/domain/entities/DebateRoom.ts`
**Test:** `src/domain/entities/__tests__/DebateRoom.test.ts`
**Depends:** none

**Design decision:** The design uses `Persona[]` directly for participants (not a separate `DebatePersona` type). All code examples reference `Persona` from `@/domain/entities/Persona`. The `DebatePersona.ts` file mentioned in the design table is NOT needed — the existing `Persona` interface has all required fields (Big Five, values, fears, communication style). I'm including the `DebateStreamEvent` union type here since it's a domain-level protocol shared between server and client.

<details>
<summary>src/domain/entities/__tests__/DebateRoom.test.ts</summary>

```typescript
import { describe, it, expect } from "vitest";
import type { DebateRoom, DebateMessage, DebateStreamEvent } from "../DebateRoom";

describe("DebateRoom types", () => {
  it("creates a valid DebateRoom with required fields", () => {
    const room: DebateRoom = {
      id: "debate-1",
      proposal: "Raise prices from $49 to $79/mo",
      participants: [],
      messages: [],
      currentRound: 0,
      totalRounds: 3,
      status: "setup",
      createdAt: new Date().toISOString(),
    };
    expect(room.id).toBe("debate-1");
    expect(room.status).toBe("setup");
    expect(room.currentRound).toBe(0);
    expect(room.totalRounds).toBe(3);
  });

  it("creates a valid DebateMessage", () => {
    const msg: DebateMessage = {
      id: "msg-1",
      personaId: "persona-1",
      personaName: "Jordan Chen",
      role: "participant",
      round: 1,
      content: "I have concerns about pricing.",
      order: 0,
    };
    expect(msg.role).toBe("participant");
    expect(msg.round).toBe(1);
    expect(msg.id).toBeTruthy();
  });

  it("creates a user-type DebateMessage", () => {
    const msg: DebateMessage = {
      id: "msg-2",
      personaId: "user",
      personaName: "You",
      role: "user",
      round: 2,
      content: "What about a compromise?",
      order: 5,
    };
    expect(msg.role).toBe("user");
    expect(msg.personaId).toBe("user");
  });

  it("discriminates debate_start event", () => {
    const event: DebateStreamEvent = {
      type: "debate_start",
      proposal: "Test proposal",
      participants: ["Alice", "Bob"],
    };
    expect(event.type).toBe("debate_start");
    if (event.type === "debate_start") {
      expect(event.proposal).toBe("Test proposal");
      expect(event.participants).toHaveLength(2);
    }
  });

  it("discriminates chunk event", () => {
    const event: DebateStreamEvent = {
      type: "chunk",
      personaId: "p1",
      text: "I think...",
    };
    expect(event.type).toBe("chunk");
    if (event.type === "chunk") {
      expect(event.text).toBe("I think...");
    }
  });

  it("discriminates all event types", () => {
    const events: DebateStreamEvent[] = [
      { type: "debate_start", proposal: "p", participants: ["A"] },
      { type: "round_start", round: 1, totalRounds: 3 },
      { type: "persona_start", personaId: "p1", personaName: "Alice" },
      { type: "chunk", personaId: "p1", text: "hello" },
      { type: "persona_end", personaId: "p1" },
      { type: "round_end", round: 1 },
      { type: "debate_end" },
      { type: "error", message: "LLM failed" },
    ];
    expect(events).toHaveLength(8);
    events.forEach((e) => expect(e.type).toBeTruthy());
  });
});
```

</details>

<details>
<summary>src/domain/entities/DebateRoom.ts</summary>

```typescript
import type { Persona } from "./Persona";

/**
 * A single utterance in the debate transcript.
 */
export interface DebateMessage {
  id: string;
  /** `"user"` for interjections from the human, or a persona's ID */
  personaId: string | "user";
  personaName: string;
  role: "participant" | "user";
  round: number;
  content: string;
  /** Global sequence number for sorting */
  order: number;
}

/**
 * Aggregate root for a debate session.
 */
export interface DebateRoom {
  id: string;
  proposal: string;
  participants: Persona[];
  messages: DebateMessage[];
  currentRound: number;
  totalRounds: number;
  status: "setup" | "in_progress" | "completed" | "error";
  error?: string;
  createdAt: string;
}

/**
 * Streaming events yielded by DebateAdapter.executeDebate().
 * Discriminated union — use `event.type` to narrow.
 */
export type DebateStreamEvent =
  | { type: "debate_start"; proposal: string; participants: string[] }
  | { type: "round_start"; round: number; totalRounds: number }
  | { type: "persona_start"; personaId: string; personaName: string }
  | { type: "chunk"; personaId: string; text: string }
  | { type: "persona_end"; personaId: string }
  | { type: "round_end"; round: number }
  | { type: "debate_end" }
  | { type: "error"; message: string };
```

</details>

**Verify:** `bun vitest run src/domain/entities/__tests__/DebateRoom.test.ts`

---

#### Task 1.2: Port interface — IDebateServicePort

**File:** `src/domain/ports/IDebateServicePort.ts`
**Test:** none (interface-only, no runtime behavior to test)
**Depends:** none

**Design decision:** Following the pattern of `LlmServicePort`, this port defines the contract that `DebateAdapter` implements and `DebateUseCase` depends on. The `executeDebate` method signature mirrors the design's `DebateAdapter.executeDebate()`.

```typescript
import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

/**
 * Port for debate orchestration.
 * Implemented by DebateAdapter (infrastructure layer).
 * Depended upon by DebateUseCase (application layer).
 */
export interface IDebateServicePort {
  /**
   * Execute a multi-round, multi-persona debate.
   * Yields structured streaming events for the client to consume.
   *
   * @param proposal — The statement/proposal being debated
   * @param participants — 2-5 personas
   * @param totalRounds — Number of rounds (default 3)
   */
  executeDebate(
    proposal: string,
    participants: Persona[],
    totalRounds: number,
  ): AsyncIterable<DebateStreamEvent>;
}
```

**Verify:** TypeScript compiles (`bun vitest run --typecheck`)

---

#### Task 1.3: Zustand store — debateStore

**File:** `src/ui/stores/debateStore.ts`
**Test:** `src/ui/stores/__tests__/debateStore.test.ts`
**Depends:** 1.1 (imports `DebateRoom` type)

**Design decision:** Following `simulationStore.ts` pattern — Zustand with `persist` middleware, `createJSONStorage(() => localStorage)`, and `partialize` to exclude streaming-only fields. The store manages N debates, active tracking, max concurrent limit, and user interjection state. Using `crypto.randomUUID()` for IDs (same as design code). MAX_CONCURRENT capped at 3 per design.

<details>
<summary>src/ui/stores/__tests__/debateStore.test.ts</summary>

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useDebateStore } from "../debateStore";
import type { DebateRoom } from "@/domain/entities/DebateRoom";
import type { Persona } from "@/domain/entities/Persona";

const mockPersona: Persona = {
  id: "p1",
  name: "Alice",
  age: 30,
  occupation: "CTO",
  educationLevel: "MSc",
  interests: ["tech"],
  goals: ["scale"],
  conscientiousness: 80,
  neuroticism: 40,
  openness: 70,
  extraversion: 50,
  agreeableness: 30,
  values: ["efficiency"],
  fears: ["failure"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  pricingSensitivity: 50,
  typicalBudget: "$50/mo",
};

function makeDebate(overrides?: Partial<DebateRoom>): DebateRoom {
  return {
    id: `debate-${Date.now()}`,
    proposal: "Test proposal",
    participants: [mockPersona],
    messages: [],
    currentRound: 0,
    totalRounds: 3,
    status: "setup",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("debateStore", () => {
  beforeEach(() => {
    useDebateStore.setState({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
    });
  });

  it("adds a debate and sets it active", () => {
    const d = makeDebate();
    useDebateStore.getState().addDebate(d);
    expect(useDebateStore.getState().debates).toHaveLength(1);
    expect(useDebateStore.getState().activeDebateId).toBe(d.id);
  });

  it("does not set active when adding with setActive=false", () => {
    const d1 = makeDebate();
    useDebateStore.getState().addDebate(d1);
    const prevActive = d1.id;

    const d2 = makeDebate();
    useDebateStore.getState().addDebate(d2, false);
    expect(useDebateStore.getState().activeDebateId).toBe(prevActive);
  });

  it("updates a debate", () => {
    const d = makeDebate();
    useDebateStore.getState().addDebate(d);
    useDebateStore.getState().updateDebate(d.id, { status: "in_progress", currentRound: 1 });
    const updated = useDebateStore.getState().debates.find((x) => x.id === d.id);
    expect(updated?.status).toBe("in_progress");
    expect(updated?.currentRound).toBe(1);
  });

  it("removes a debate", () => {
    const d = makeDebate();
    useDebateStore.getState().addDebate(d);
    useDebateStore.getState().removeDebate(d.id);
    expect(useDebateStore.getState().debates).toHaveLength(0);
  });

  it("sets active debate", () => {
    const d1 = makeDebate({ id: "d1" });
    const d2 = makeDebate({ id: "d2" });
    useDebateStore.getState().addDebate(d1);
    useDebateStore.getState().addDebate(d2);
    useDebateStore.getState().setActive("d2");
    expect(useDebateStore.getState().activeDebateId).toBe("d2");
  });

  it("adds a message to a debate", () => {
    const d = makeDebate({ id: "d1" });
    useDebateStore.getState().addDebate(d);
    useDebateStore.getState().addMessage("d1", {
      id: "msg-1",
      personaId: "p1",
      personaName: "Alice",
      role: "participant",
      round: 1,
      content: "Hello",
      order: 0,
    });
    const debate = useDebateStore.getState().debates.find((x) => x.id === "d1");
    expect(debate?.messages).toHaveLength(1);
    expect(debate?.messages[0].content).toBe("Hello");
  });

  it("tracks streaming state", () => {
    useDebateStore.getState().setStreaming(true);
    expect(useDebateStore.getState().isStreaming).toBe(true);
    useDebateStore.getState().setStreaming(false);
    expect(useDebateStore.getState().isStreaming).toBe(false);
  });

  it("enforces max concurrent debates", () => {
    const max = useDebateStore.getState().MAX_CONCURRENT;
    for (let i = 0; i < max + 2; i++) {
      useDebateStore.getState().addDebate(makeDebate({ id: `d${i}` }));
    }
    const inProgress = useDebateStore.getState().debates.filter(
      (d) => d.status === "setup" || d.status === "in_progress"
    );
    expect(inProgress.length).toBeLessThanOrEqual(max);
  });
});
```

</details>

<details>
<summary>src/ui/stores/debateStore.ts</summary>

```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DebateRoom, DebateMessage } from "@/domain/entities/DebateRoom";

interface DebateStoreState {
  debates: DebateRoom[];
  activeDebateId: string | null;
  isStreaming: boolean;
  MAX_CONCURRENT: number;

  addDebate: (debate: DebateRoom, setActive?: boolean) => void;
  updateDebate: (id: string, updates: Partial<DebateRoom>) => void;
  removeDebate: (id: string) => void;
  setActive: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
  addMessage: (debateId: string, message: DebateMessage) => void;
  getDebate: (id: string) => DebateRoom | undefined;
}

export const useDebateStore = create<DebateStoreState>()(
  persist(
    (set, get) => ({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
      MAX_CONCURRENT: 3,

      addDebate: (debate, setActive = true) => {
        const state = get();
        const activeCount = state.debates.filter(
          (d) => d.status === "setup" || d.status === "in_progress"
        ).length;
        if (activeCount >= state.MAX_CONCURRENT) return;

        set({
          debates: [debate, ...state.debates],
          ...(setActive ? { activeDebateId: debate.id } : {}),
        });
      },

      updateDebate: (id, updates) =>
        set((state) => ({
          debates: state.debates.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        })),

      removeDebate: (id) =>
        set((state) => ({
          debates: state.debates.filter((d) => d.id !== id),
          activeDebateId:
            state.activeDebateId === id ? null : state.activeDebateId,
        })),

      setActive: (id) => set({ activeDebateId: id }),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      addMessage: (debateId, message) =>
        set((state) => ({
          debates: state.debates.map((d) =>
            d.id === debateId
              ? { ...d, messages: [...d.messages, message] }
              : d
          ),
        })),

      getDebate: (id) => get().debates.find((d) => d.id === id),
    }),
    {
      name: "debate-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        debates: state.debates,
        activeDebateId: state.activeDebateId,
      }),
    }
  )
);
```

</details>

**Verify:** `bun vitest run src/ui/stores/__tests__/debateStore.test.ts`

---

### Batch 2: Core Modules (parallel — 2 implementers)

Depend on Batch 1. Run simultaneously.

---

#### Task 2.1: DebatePromptCompiler

**File:** `src/infrastructure/adapters/DebatePromptCompiler.ts`
**Test:** `src/infrastructure/adapters/__tests__/DebatePromptCompiler.test.ts`
**Depends:** 1.1 (imports `DebateRoom` types)

**Design decision:** This is the "heart of the feature" per the design. It reuses `PersonaPromptCompiler.compileSystemPrompt()` for the identity sections (design: "Reuse PersonaPromptCompiler for the identity sections"). The trait directives are deterministic — compiled from Big Five values at prompt-assembly time, not LLM-generated. The `participants` param for `buildPersonaPrompt` is derived from the Persona array (name, occupation, key values extracted from `persona.values`).

Following the `PersonaPromptCompiler` class pattern (not an interface/port since it's a pure adapter with no IO).

<details>
<summary>src/infrastructure/adapters/__tests__/DebatePromptCompiler.test.ts</summary>

```typescript
import { describe, it, expect } from "vitest";
import { DebatePromptCompiler } from "../DebatePromptCompiler";
import type { Persona } from "@/domain/entities/Persona";

const alice: Persona = {
  id: "p1",
  name: "Alice Chen",
  age: 38,
  occupation: "CTO",
  educationLevel: "MSc Computer Science",
  interests: ["cloud", "security"],
  goals: ["scale infrastructure"],
  conscientiousness: 85,
  neuroticism: 65,
  openness: 60,
  extraversion: 40,
  agreeableness: 30,
  values: ["security", "reliability", "evidence"],
  fears: ["data breach", "compliance failure"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  pricingSensitivity: 60,
  typicalBudget: "$100/mo",
  backstory: "I've led engineering teams through two SOC2 audits.",
};

const bob: Persona = {
  id: "p2",
  name: "Bob Martinez",
  age: 32,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["UX", "analytics"],
  goals: ["increase engagement"],
  conscientiousness: 70,
  neuroticism: 35,
  openness: 80,
  extraversion: 65,
  agreeableness: 70,
  values: ["user delight", "speed", "collaboration"],
  fears: ["building the wrong thing"],
  communicationStyle: "collaborative",
  decisionStyle: "consensus-seeking",
  pricingSensitivity: 40,
  typicalBudget: "$50/mo",
};

describe("DebatePromptCompiler", () => {
  const compiler = new DebatePromptCompiler();

  it("includes all prompt sections", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Raise prices 60%", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("<<PERSONA IDENTITY>>");
    expect(prompt).toContain("<<PSYCHOGRAPHIC PROFILE>>");
    expect(prompt).toContain("<<EPISTEMIC BOUNDARIES>>");
    expect(prompt).toContain("<<BEHAVIORAL GUARDRAILS>>");
    expect(prompt).toContain("<<DEBATE CONTEXT>>");
    expect(prompt).toContain("<<CURRENT DEBATE STATE>>");
    expect(prompt).toContain("<<YOUR RESPONSE>>");
  });

  it("includes the persona's name and proposal", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Raise prices 60%", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("Alice Chen");
    expect(prompt).toContain("Raise prices 60%");
  });

  it("lists each participant with their values", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("Alice Chen");
    expect(prompt).toContain("CTO");
    expect(prompt).toContain("Bob Martinez");
    expect(prompt).toContain("Product Manager");
  });

  it("includes round indicator", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("Round 1 of 3");
  });

  it("includes transcript when round > 1", () => {
    const transcript = `Round 1:\n  Alice Chen: "I have concerns."\n  Bob Martinez: "I disagree."`;
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", transcript, 2, 3);
    expect(prompt).toContain("Alice Chen: \"I have concerns.\"");
    expect(prompt).toContain("Bob Martinez: \"I disagree.\"");
  });

  it("adds deterministic trait directives based on Big Five", () => {
    // Alice: high neuroticism (65), low agreeableness (30)
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("risk awareness is high");
    expect(prompt).toContain("Challenge assumptions");

    // Bob: low neuroticism (35), high agreeableness (70)
    const prompt2 = compiler.buildPersonaPrompt(bob, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt2).toContain("naturally optimistic");
    expect(prompt2).toContain("Seek common ground");
  });

  it("includes response instructions", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("Address specific points");
    expect(prompt).toContain("2-3 paragraphs");
    expect(prompt).toContain("strategy discussion");
  });
});
```

</details>

<details>
<summary>src/infrastructure/adapters/DebatePromptCompiler.ts</summary>

```typescript
import type { Persona } from "@/domain/entities/Persona";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";

/**
 * Deterministic prompt builder for debate turns.
 * Reuses PersonaPromptCompiler for identity/psychographic/epistemic/guardrail sections.
 * Adds debate-specific context (proposal, participants, transcript, round info).
 * All trait-based directives are compiled from Big Five values — no LLM calls.
 */
export class DebatePromptCompiler {
  private baseCompiler = new PersonaPromptCompiler();

  /**
   * Build a complete system prompt for one persona's turn in the debate.
   *
   * @param persona — The persona whose turn it is
   * @param participants — All debate participants (for listing opponents)
   * @param proposal — The proposal being debated
   * @param transcript — Formatted transcript of prior messages
   * @param round — Current round number (1-indexed)
   * @param totalRounds — Total rounds in this debate
   */
  buildPersonaPrompt(
    persona: Persona,
    participants: Persona[],
    proposal: string,
    transcript: string,
    round: number,
    totalRounds: number,
  ): string {
    const identitySection = this.baseCompiler.compileSystemPrompt(persona);
    const debateContext = this.buildDebateContext(persona, participants, proposal);
    const debateState = this.buildDebateState(transcript, round, totalRounds);
    const traitDirectives = this.getTraitDirectives(persona);
    const responseInstructions = this.getResponseInstructions();

    return [
      identitySection,
      "",
      "<<DEBATE CONTEXT>>",
      debateContext,
      "",
      "<<CURRENT DEBATE STATE>>",
      debateState,
      "",
      "<<TRAIT-BASED DIRECTIVES>>",
      ...traitDirectives,
      "",
      "<<YOUR RESPONSE>>",
      responseInstructions,
    ].join("\n");
  }

  private buildDebateContext(persona: Persona, participants: Persona[], proposal: string): string {
    const others = participants
      .filter((p) => p.id !== persona.id)
      .map((p) => {
        const values = p.values?.length ? p.values.slice(0, 3).join(", ") : "general business concerns";
        return `- ${p.name} (${p.occupation}): cares about ${values}`;
      })
      .join("\n");

    const roleLabel = this.deriveRoleLabel(persona);

    return [
      `Proposal: "${proposal}"`,
      "",
      "You are debating this proposal with:",
      others,
      "",
      `Your role: ${roleLabel}`,
    ].join("\n");
  }

  private deriveRoleLabel(persona: Persona): string {
    const occ = persona.occupation.toLowerCase();
    if (/ceo|cto|cfo|founder|chief|executive/.test(occ)) return "Strategic decision-maker — focused on business impact and risk";
    if (/vp|vice president|head|director|svp/.test(occ)) return "Organizational leader — balancing team capacity against business goals";
    if (/product manager|product owner|pm/.test(occ)) return "User advocate — focused on customer needs and product-market fit";
    if (/engineer|developer|architect|software/.test(occ)) return "Technical realist — focused on feasibility, complexity, and quality";
    if (/designer|ux|design/.test(occ)) return "Experience advocate — focused on user needs and design quality";
    if (/marketing|growth|sales/.test(occ)) return "Market strategist — focused on positioning, messaging, and conversion";
    return "Cross-functional stakeholder — balancing multiple perspectives";
  }

  private buildDebateState(transcript: string, round: number, totalRounds: number): string {
    const lines: string[] = [`Round ${round} of ${totalRounds}`];
    if (round === 1) {
      lines.push("Awaiting first responses.");
    } else {
      lines.push("Here is what has been said so far:");
      lines.push(transcript);
    }
    return lines.join("\n");
  }

  /**
   * Deterministic trait directives compiled from Big Five values.
   * These drive authentic disagreement without an LLM moderator.
   */
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
    if (persona.openness >= 60) {
      directives.push("- You're open to new approaches — explore creative solutions even if unconventional");
    }
    if (persona.openness <= 40) {
      directives.push("- You prefer proven approaches — be skeptical of unproven ideas");
    }
    if (persona.conscientiousness >= 70) {
      directives.push("- Attend to details others may miss — timelines, costs, and dependencies matter");
    }
    if (persona.conscientiousness <= 40) {
      directives.push("- Trust your instincts over elaborate planning — speed matters");
    }
    if (persona.extraversion >= 60) {
      directives.push("- Engage actively with each participant — build on their ideas");
    }
    if (persona.extraversion <= 40) {
      directives.push("- Take time to think before responding — your reflective perspective adds depth");

    return directives;
  }

  private getResponseInstructions(): string {
    return [
      "- Address specific points made by each participant who has spoken",
      "- If you disagree with something, challenge it directly using your own reasoning",
      "- Ground your position in your values, experience, and role",
      "- Keep your response to 2-3 paragraphs",
      "- Speak naturally — this is a strategy discussion among colleagues",
    ].join("\n");
  }
}
```

</details>

**Verify:** `bun vitest run src/infrastructure/adapters/__tests__/DebatePromptCompiler.test.ts`

---

#### Task 2.2: DebateUseCase

**File:** `src/application/usecases/DebateUseCase.ts`
**Test:** `src/application/usecases/__tests__/DebateUseCase.test.ts`
**Depends:** 1.2 (imports `IDebateServicePort`)

**Design decision:** Following `ChatWithPersonaUseCase` pattern — thin wrapper that delegates to the port. The use case accepts `IDebateServicePort` (DIP) so the caller (action) decides which implementation to inject.

<details>
<summary>src/application/usecases/__tests__/DebateUseCase.test.ts</summary>

```typescript
import { describe, it, expect, vi } from "vitest";
import { DebateUseCase } from "../DebateUseCase";
import type { IDebateServicePort } from "@/domain/ports/IDebateServicePort";
import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

const mockPersona: Persona = {
  id: "p1",
  name: "Alice",
  age: 30,
  occupation: "CTO",
  educationLevel: "MSc",
  interests: ["tech"],
  goals: ["scale"],
  conscientiousness: 50,
  neuroticism: 50,
  openness: 50,
  extraversion: 50,
  agreeableness: 50,
  values: ["efficiency"],
  fears: ["failure"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  pricingSensitivity: 50,
  typicalBudget: "$50/mo",
};

describe("DebateUseCase", () => {
  it("delegates executeDebate to the port and yields events", async () => {
    const mockEvents: DebateStreamEvent[] = [
      { type: "debate_start", proposal: "Test", participants: ["Alice"] },
      { type: "debate_end" },
    ];

    const mockPort: IDebateServicePort = {
      executeDebate: vi.fn().mockImplementation(async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      }),
    };

    const useCase = new DebateUseCase(mockPort);
    const results: DebateStreamEvent[] = [];

    for await (const event of useCase.executeDebate("Test", [mockPersona], 1)) {
      results.push(event);
    }

    expect(results).toHaveLength(2);
    expect(results[0].type).toBe("debate_start");
    expect(results[1].type).toBe("debate_end");
    expect(mockPort.executeDebate).toHaveBeenCalledWith("Test", [mockPersona], 1);
  });

  it("forwards errors from the port", async () => {
    const mockPort: IDebateServicePort = {
      executeDebate: vi.fn().mockImplementation(async function* () {
        yield { type: "error", message: "LLM unavailable" } as DebateStreamEvent;
      }),
    };

    const useCase = new DebateUseCase(mockPort);
    const results: DebateStreamEvent[] = [];

    for await (const event of useCase.executeDebate("Test", [mockPersona], 1)) {
      results.push(event);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ type: "error", message: "LLM unavailable" });
  });
});
```

</details>

<details>
<summary>src/application/usecases/DebateUseCase.ts</summary>

```typescript
import type { Persona } from "@/domain/entities/Persona";
import type { IDebateServicePort } from "@/domain/ports/IDebateServicePort";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

/**
 * Use case for executing a multi-persona debate.
 * Thin wrapper around IDebateServicePort — follows ChatWithPersonaUseCase pattern.
 */
export class DebateUseCase {
  constructor(private debateService: IDebateServicePort) {}

  /**
   * Execute a debate stream. Yields structured events for the client.
   */
  async *executeDebate(
    proposal: string,
    participants: Persona[],
    totalRounds: number,
  ): AsyncIterable<DebateStreamEvent> {
    yield* this.debateService.executeDebate(proposal, participants, totalRounds);
  }
}
```

</details>

**Verify:** `bun vitest run src/application/usecases/__tests__/DebateUseCase.test.ts`

---

### Batch 3: Infrastructure Adapter (parallel — 1 implementer)

---

#### Task 3.1: DebateAdapter

**File:** `src/infrastructure/adapters/DebateAdapter.ts`
**Test:** `src/infrastructure/adapters/__tests__/DebateAdapter.test.ts`
**Depends:** 2.1 (uses `DebatePromptCompiler`), 2.2 (implements `IDebateServicePort`)

**Design decision:** The adapter implements `IDebateServicePort` and orchestrates the round-robin. It takes `LlmServiceImpl` directly (same as `ChatAdapter` pattern). Error handling follows the design: if one persona's LLM call fails, emit `persona_end` with an error note and continue; if all fail, emit `error`. Rate limiting handled via LlmServiceImpl's built-in `.withRetry()`. The adapter is stateless — called per-debate, not persistent.

Following the design code closely — uses `crypto.randomUUID()` for message IDs, `formatTranscript` for building the transcript string, and yields all event types exactly as specified.

<details>
<summary>src/infrastructure/adapters/__tests__/DebateAdapter.test.ts</summary>

```typescript
import { describe, it, expect, vi } from "vitest";
import { DebateAdapter } from "../DebateAdapter";
import { LlmServiceImpl } from "../LlmServiceImpl";
import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

// Mock LlmServiceImpl
vi.mock("../LlmServiceImpl", () => ({
  LlmServiceImpl: {
    createFromEnv: vi.fn(),
  },
}));

function createMockLlmService(chunks: string[]) {
  return {
    createChatCompletionStream: vi.fn().mockImplementation(async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    }),
  };
}

const mockPersonas: Persona[] = [
  {
    id: "p1", name: "Alice Chen", age: 38,
    occupation: "CTO", educationLevel: "MSc",
    interests: ["cloud"], goals: ["scale"],
    conscientiousness: 80, neuroticism: 60, openness: 60,
    extraversion: 40, agreeableness: 30,
    values: ["security", "reliability"], fears: ["breach"],
    communicationStyle: "direct", decisionStyle: "data-driven",
    pricingSensitivity: 60, typicalBudget: "$100/mo",
  },
  {
    id: "p2", name: "Bob Martinez", age: 32,
    occupation: "Product Manager", educationLevel: "MBA",
    interests: ["UX"], goals: ["engagement"],
    conscientiousness: 70, neuroticism: 35, openness: 80,
    extraversion: 65, agreeableness: 70,
    values: ["user delight", "speed"], fears: ["wrong thing"],
    communicationStyle: "collaborative", decisionStyle: "consensus-seeking",
    pricingSensitivity: 40, typicalBudget: "$50/mo",
  },
];

describe("DebateAdapter", () => {
  it("yields correct event sequence for 2 personas × 1 round", async () => {
    const llmMock = createMockLlmService(["Hello ", "world"]);
    const adapter = new DebateAdapter(llmMock as any, new (await import("../DebatePromptCompiler")).DebatePromptCompiler());

    const events: DebateStreamEvent[] = [];
    for await (const event of adapter.executeDebate("Test proposal", mockPersonas, 1)) {
      events.push(event);
    }

    // Expected order: debate_start → round_start → persona_start → chunk* → persona_end → persona_start → chunk* → persona_end → round_end → debate_end
    expect(events[0].type).toBe("debate_start");
    expect(events[1].type).toBe("round_start");
    expect(events[2].type).toBe("persona_start"); // Alice begins
    expect(events[3].type).toBe("chunk");          // "Hello "
    expect(events[4].type).toBe("chunk");          // "world"
    expect(events[5].type).toBe("persona_end");    // Alice done
    expect(events[6].type).toBe("persona_start"); // Bob begins
    expect(events[7].type).toBe("chunk");
    expect(events[8].type).toBe("chunk");
    expect(events[9].type).toBe("persona_end");    // Bob done
    expect(events[10].type).toBe("round_end");
    expect(events[11].type).toBe("debate_end");
  });

  it("yields correct number of persona responses for 3 personas × 3 rounds", async () => {
    const llmMock = createMockLlmService(["response"]);
    const adapter = new DebateAdapter(llmMock as any, new (await import("../DebatePromptCompiler")).DebatePromptCompiler());

    const threePersonas = [mockPersonas[0], mockPersonas[1], {
      ...mockPersonas[0],
      id: "p3",
      name: "Casey Kim",
      occupation: "VP Engineering",
    }];

    const events: DebateStreamEvent[] = [];
    for await (const event of adapter.executeDebate("Test", threePersonas, 3)) {
      events.push(event);
    }

    const personaStartEvents = events.filter((e) => e.type === "persona_start");
    expect(personaStartEvents).toHaveLength(9); // 3 personas × 3 rounds

    const roundStartEvents = events.filter((e) => e.type === "round_start");
    expect(roundStartEvents).toHaveLength(3);

    const debateEndEvents = events.filter((e) => e.type === "debate_end");
    expect(debateEndEvents).toHaveLength(1);
  });

  it("includes proposal and participant names in debate_start", async () => {
    const llmMock = createMockLlmService(["response"]);
    const adapter = new DebateAdapter(llmMock as any, new (await import("../DebatePromptCompiler")).DebatePromptCompiler());

    const events: DebateStreamEvent[] = [];
    for await (const event of adapter.executeDebate("Raise prices 60%", mockPersonas, 1)) {
      events.push(event);
    }

    const startEvent = events[0];
    if (startEvent.type === "debate_start") {
      expect(startEvent.proposal).toBe("Raise prices 60%");
      expect(startEvent.participants).toContain("Alice Chen");
      expect(startEvent.participants).toContain("Bob Martinez");
    } else {
      // If this fails, the event order is wrong
      expect.fail("First event should be debate_start");
    }
  });

  it("handles LLM failure for one persona and continues", async () => {
    const llmMock = {
      createChatCompletionStream: vi.fn()
        .mockImplementationOnce(async function* () {
          throw new Error("LLM unavailable");
        })
        .mockImplementation(async function* () {
          yield "I agree with the proposal.";
        }),
    };

    const adapter = new DebateAdapter(llmMock as any, new (await import("../DebatePromptCompiler")).DebatePromptCompiler());

    const events: DebateStreamEvent[] = [];
    for await (const event of adapter.executeDebate("Test", mockPersonas, 1)) {
      events.push(event);
    }

    // Should still complete — first persona fails, second succeeds
    const debutEndEvents = events.filter((e) => e.type === "debate_end");
    expect(debutEndEvents).toHaveLength(1);
    const personaEndEvents = events.filter((e) => e.type === "persona_end");
    expect(personaEndEvents).toHaveLength(2);
  });
});
```

</details>

<details>
<summary>src/infrastructure/adapters/DebateAdapter.ts</summary>

```typescript
import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent, DebateMessage } from "@/domain/entities/DebateRoom";
import type { IDebateServicePort } from "@/domain/ports/IDebateServicePort";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { DebatePromptCompiler } from "./DebatePromptCompiler";
import OpenAI from "openai";

/**
 * Orchestrates a single multi-round, multi-persona debate.
 * Stateless — call executeDebate() per debate session.
 * Implements IDebateServicePort (DIP).
 */
export class DebateAdapter implements IDebateServicePort {
  private promptCompiler: DebatePromptCompiler;

  constructor(
    private llmService: LlmServiceImpl,
    promptCompiler?: DebatePromptCompiler,
  ) {
    this.promptCompiler = promptCompiler ?? new DebatePromptCompiler();
  }

  /**
   * Execute a round-robin debate.
   * For each round: Persona A streams → Persona B streams → Persona C streams.
   * Each persona receives the full transcript so far + their identity/trait profile.
   */
  async *executeDebate(
    proposal: string,
    participants: Persona[],
    totalRounds: number,
  ): AsyncIterable<DebateStreamEvent> {
    const transcript: DebateMessage[] = [];
    let order = 0;

    yield {
      type: "debate_start",
      proposal,
      participants: participants.map((p) => p.name),
    };

    for (let round = 1; round <= totalRounds; round++) {
      yield { type: "round_start", round, totalRounds };

      for (const persona of participants) {
        yield {
          type: "persona_start",
          personaId: persona.id,
          personaName: persona.name,
        };

        try {
          const formattedTranscript = this.formatTranscript(transcript, round);
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
            {
              role: "user",
              content: `What are your thoughts on this proposal, ${persona.name}?`,
            },
          ];

          let fullResponse = "";
          for await (const chunk of this.llmService.createChatCompletionStream(
            messages,
            {
              temperature: 0.7,
              purpose: "Debate",
            },
          )) {
            fullResponse += chunk;
            yield { type: "chunk", personaId: persona.id, text: chunk };
          }

          const message: DebateMessage = {
            id: crypto.randomUUID(),
            personaId: persona.id,
            personaName: persona.name,
            role: "participant",
            round,
            content: fullResponse,
            order: order++,
          };
          transcript.push(message);
        } catch (err) {
          console.error(
            `[DebateAdapter] LLM call failed for ${persona.name}:`,
            err,
          );
          // Emit a note in the transcript but continue
          const errorMessage: DebateMessage = {
            id: crypto.randomUUID(),
            personaId: persona.id,
            personaName: persona.name,
            role: "participant",
            round,
            content: `[${persona.name} is unavailable due to a technical issue.]`,
            order: order++,
          };
          transcript.push(errorMessage);
        }

        yield { type: "persona_end", personaId: persona.id };
      }

      yield { type: "round_end", round };
    }

    yield { type: "debate_end" };
  }

  /**
   * Format the current transcript for inclusion in the prompt.
   * Returns empty string for round 1 (no prior messages).
   */
  private formatTranscript(
    transcript: DebateMessage[],
    currentRound: number,
  ): string {
    if (currentRound <= 1) return "Awaiting first responses.";

    const lines: string[] = [];
    for (const msg of transcript) {
      if (msg.round < currentRound) {
        lines.push(`${msg.personaName}: "${msg.content}"`);
      }
    }
    return lines.join("\n");
  }
}
```

</details>

**Verify:** `bun vitest run src/infrastructure/adapters/__tests__/DebateAdapter.test.ts`

---

### Batch 4: Action + Hook (parallel — 2 implementers)

Depend on Batch 3.

---

#### Task 4.1: debateAction Server Action

**File:** `src/actions/debateAction.ts`
**Test:** `src/actions/__tests__/debateAction.test.ts`
**Depends:** 3.1 (uses `DebateAdapter`)

**Design decision:** Following `chatWithPersonaAction.ts` pattern exactly: `"use server"`, `createStreamableValue`, async IIFE with try/catch, `return { streamData: stream.value }`. Creates `DebateAdapter` with `LlmServiceImpl.createFromEnv("openrouter")` and `DebatePromptCompiler`. Structured event streaming — pushes raw events to the stream and lets the client decode them.

<details>
<summary>src/actions/__tests__/debateAction.test.ts</summary>

```typescript
import { describe, it, expect, vi } from "vitest";

// Mock the server-only modules
vi.mock("@ai-sdk/rsc", () => ({
  createStreamableValue: () => {
    const value = { current: undefined };
    return {
      value,
      update: vi.fn().mockImplementation((v: any) => { value.current = v; }),
      done: vi.fn().mockImplementation((v: any) => { value.current = v; }),
    };
  },
}));

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => ({
  LlmServiceImpl: {
    createFromEnv: vi.fn().mockReturnValue({
      createChatCompletionStream: vi.fn(),
    }),
  },
}));

vi.mock("@/infrastructure/adapters/DebateAdapter", () => ({
  DebateAdapter: vi.fn().mockImplementation(() => ({
    executeDebate: vi.fn().mockImplementation(async function* () {
      yield { type: "debate_start", proposal: "Test", participants: ["Alice"] };
      yield { type: "round_start", round: 1, totalRounds: 1 };
      yield { type: "persona_start", personaId: "p1", personaName: "Alice" };
      yield { type: "chunk", personaId: "p1", text: "Hello" };
      yield { type: "persona_end", personaId: "p1" };
      yield { type: "round_end", round: 1 };
      yield { type: "debate_end" };
    }),
  })),
}));

import { debateAction } from "../debateAction";

describe("debateAction", () => {
  it("returns streamData with correct shape", async () => {
    const mockPersona = {
      id: "p1", name: "Alice", age: 30,
      occupation: "CTO", educationLevel: "MSc",
      interests: ["tech"], goals: ["scale"],
      conscientiousness: 50, neuroticism: 50, openness: 50,
      extraversion: 50, agreeableness: 50,
      values: ["eff"], fears: ["fail"],
      communicationStyle: "direct", decisionStyle: "data-driven",
      pricingSensitivity: 50, typicalBudget: "$50/mo",
    };

    const result = await debateAction("Test", [mockPersona], 1);
    expect(result).toHaveProperty("streamData");
  });
});
```

</details>

<details>
<summary>src/actions/debateAction.ts</summary>

```typescript
"use server";

import { createStreamableValue } from "@ai-sdk/rsc";
import { DebateAdapter } from "@/infrastructure/adapters/DebateAdapter";
import { DebatePromptCompiler } from "@/infrastructure/adapters/DebatePromptCompiler";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

/**
 * Server action for starting a multi-persona debate.
 * Returns a streamable value that yields DebateStreamEvent objects.
 */
export async function debateAction(
  proposal: string,
  participants: Persona[],
  totalRounds: number,
) {
  const stream = createStreamableValue<DebateStreamEvent>();

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const adapter = new DebateAdapter(
        llmService,
        new DebatePromptCompiler(),
      );

      for await (const event of adapter.executeDebate(
        proposal,
        participants,
        totalRounds,
      )) {
        if (event.type === "debate_end") {
          stream.done({ type: "debate_end" } as DebateStreamEvent);
          return;
        }
        if (event.type === "error") {
          stream.done(event);
          return;
        }
        stream.update(event);
      }

      // Safety net if the loop exits without a terminal event
      stream.done({ type: "debate_end" } as DebateStreamEvent);
    } catch (error) {
      console.error("[debateAction] Fatal error:", error);
      stream.done({
        type: "error",
        message: (error as Error).message,
      } as DebateStreamEvent);
    }
  })();

  return { streamData: stream.value as unknown as AsyncIterable<DebateStreamEvent> };
}
```

</details>

**Verify:** `bun vitest run src/actions/__tests__/debateAction.test.ts`

---

#### Task 4.2: useDebate Hook

**File:** `src/ui/hooks/useDebate.ts`
**Test:** `src/ui/hooks/__tests__/useDebate.test.ts`
**Depends:** 1.3 (uses `useDebateStore`), 4.1 (calls `debateAction`)

**Design decision:** Following `useAnalysisFlow.ts` pattern — manages streaming consumption from server action, updates Zustand store with events, handles abort, and exposes interjection support. The hook receives a `debateId` and manages streaming for that specific debate. Uses `readStreamableValue` from `@ai-sdk/rsc`.

Key behaviors:
- Calls `debateAction` and reads stream events
- On `persona_start`: sets streaming flag, adds placeholder message
- On `chunk`: appends to current streaming message
- On `persona_end`: finalizes the message
- On `round_start` / `round_end`: updates debate round state
- On `debate_end`: marks as completed, clears streaming flag
- On `error`: marks as error
- Interjection: user message added to transcript, then resumes

<details>
<summary>src/ui/hooks/__tests__/useDebate.test.ts</summary>

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";

// Mock the server action at module level
vi.mock("@/actions/debateAction", () => ({
  debateAction: vi.fn(),
}));

vi.mock("@ai-sdk/rsc", () => ({
  readStreamableValue: vi.fn(),
}));

import { useDebate } from "../useDebate";
import { debateAction } from "@/actions/debateAction";
import { readStreamableValue } from "@ai-sdk/rsc";

const mockPersona: Persona = {
  id: "p1", name: "Alice Chen", age: 38,
  occupation: "CTO", educationLevel: "MSc",
  interests: ["cloud"], goals: ["scale"],
  conscientiousness: 80, neuroticism: 60, openness: 60,
  extraversion: 40, agreeableness: 30,
  values: ["security"], fears: ["breach"],
  communicationStyle: "direct", decisionStyle: "data-driven",
  pricingSensitivity: 60, typicalBudget: "$100/mo",
};

// Helper to create a mock stream that yields events
function createMockStream(events: any[]) {
  return {
    [Symbol.asyncIterator]: () => {
      let i = 0;
      return {
        next: async () => {
          if (i < events.length) {
            return { value: events[i++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

describe("useDebate", () => {
  beforeEach(() => {
    useDebateStore.setState({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
    });
    vi.clearAllMocks();
  });

  it("starts a debate adds it to the store and streams events", async () => {
    const mockStream = createMockStream([
      { type: "debate_start", proposal: "Test", participants: ["Alice"] },
      { type: "round_start", round: 1, totalRounds: 1 },
      { type: "persona_start", personaId: "p1", personaName: "Alice" },
      { type: "chunk", personaId: "p1", text: "Hello " },
      { type: "chunk", personaId: "p1", text: "world" },
      { type: "persona_end", personaId: "p1" },
      { type: "round_end", round: 1 },
      { type: "debate_end" },
    ]);

    vi.mocked(debateAction).mockResolvedValue({
      streamData: mockStream as any,
    });

    const { result } = renderHook(() => useDebate());

    await act(async () => {
      await result.current.startDebate("Test proposal", [mockPersona], 1);
    });

    // Should have added a debate to the store
    const state = useDebateStore.getState();
    expect(state.debates).toHaveLength(1);
    expect(state.debates[0].proposal).toBe("Test proposal");
    expect(state.debates[0].status).toBe("completed");
  });

  it("marks debate as error when stream returns error event", async () => {
    const mockStream = createMockStream([
      { type: "debate_start", proposal: "Test", participants: ["Alice"] },
      { type: "error", message: "LLM failed" },
    ]);

    vi.mocked(debateAction).mockResolvedValue({
      streamData: mockStream as any,
    });

    const { result } = renderHook(() => useDebate());

    await act(async () => {
      await result.current.startDebate("Test", [mockPersona], 1);
    });

    const state = useDebateStore.getState();
    expect(state.debates[0].status).toBe("error");
    expect(state.debates[0].error).toBe("LLM failed");
  });
});
```

</details>

<details>
<summary>src/ui/hooks/useDebate.ts</summary>

```typescript
"use client";

import { useCallback } from "react";
import { readStreamableValue } from "@ai-sdk/rsc";
import { debateAction } from "@/actions/debateAction";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";
import type { DebateRoom, DebateStreamEvent, DebateMessage } from "@/domain/entities/DebateRoom";

/**
 * Hook for managing a debate session.
 * Handles starting a debate, consuming streaming events, and updating the store.
 */
export function useDebate() {
  const store = useDebateStore();

  /**
   * Start a new debate with the given proposal, participants, and rounds.
   * Creates the debate in the store, calls the server action, and consumes events.
   */
  const startDebate = useCallback(
    async (
      proposal: string,
      participants: Persona[],
      totalRounds: number,
    ): Promise<string> => {
      const debateId = `debate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Create the debate in setup state
      const debate: DebateRoom = {
        id: debateId,
        proposal,
        participants,
        messages: [],
        currentRound: 0,
        totalRounds,
        status: "setup",
        createdAt: new Date().toISOString(),
      };
      store.addDebate(debate);

      // Track the current persona being streamed
      let currentPersonaId: string | null = null;
      let currentMessageId: string | null = null;
      let streamingContent = "";

      store.setStreaming(true);

      try {
        const { streamData } = await debateAction(proposal, participants, totalRounds);

        for await (const event of readStreamableValue(streamData)) {
          if (!event) continue;

          switch (event.type) {
            case "debate_start":
              store.updateDebate(debateId, { status: "in_progress" });
              break;

            case "round_start":
              store.updateDebate(debateId, { currentRound: event.round });
              break;

            case "persona_start":
              // Finalize previous persona's message if any
              if (currentPersonaId && currentMessageId && streamingContent) {
                // Message already pushed via chunks — it's complete
              }
              currentPersonaId = event.personaId;
              currentMessageId = crypto.randomUUID();
              streamingContent = "";

              // Add an empty placeholder message that will be filled by chunks
              store.addMessage(debateId, {
                id: currentMessageId,
                personaId: event.personaId,
                personaName: event.personaName,
                role: "participant",
                round: store.getDebate(debateId)?.currentRound ?? 1,
                content: "",
                order: store.getDebate(debateId)?.messages.length ?? 0,
              });
              break;

            case "chunk":
              if (currentPersonaId === event.personaId) {
                streamingContent += event.text;
                // Update the last message content (replace placeholder)
                const debate = store.getDebate(debateId);
                if (debate && currentMessageId) {
                  const updatedMessages = debate.messages.map((m) =>
                    m.id === currentMessageId
                      ? { ...m, content: streamingContent }
                      : m,
                  );
                  store.updateDebate(debateId, { messages: updatedMessages });
                }
              }
              break;

            case "persona_end":
              // Persona finished — message is already updated via chunks
              currentPersonaId = null;
              currentMessageId = null;
              streamingContent = "";
              break;

            case "round_end":
              store.updateDebate(debateId, { currentRound: event.round });
              break;

            case "debate_end":
              store.updateDebate(debateId, { status: "completed" });
              store.setStreaming(false);
              return debateId;

            case "error":
              store.updateDebate(debateId, {
                status: "error",
                error: event.message,
              });
              store.setStreaming(false);
              return debateId;
          }
        }

        // Stream ended without a terminal event — mark as completed
        store.updateDebate(debateId, { status: "completed" });
        store.setStreaming(false);
      } catch (err) {
        console.error("[useDebate] Fatal error:", err);
        store.updateDebate(debateId, {
          status: "error",
          error: (err as Error).message,
        });
        store.setStreaming(false);
      }

      return debateId;
    },
    [store],
  );

  /**
   * Add a user interjection message to an active debate.
   * This pauses streaming and injects a user message into the transcript.
   */
  const interject = useCallback(
    (debateId: string, content: string) => {
      const debate = store.getDebate(debateId);
      if (!debate) return;

      const message: DebateMessage = {
        id: crypto.randomUUID(),
        personaId: "user",
        personaName: "You",
        role: "user",
        round: debate.currentRound,
        content,
        order: debate.messages.length,
      };

      store.addMessage(debateId, message);
    },
    [store],
  );

  return {
    startDebate,
    interject,
    debates: store.debates,
    activeDebateId: store.activeDebateId,
    isStreaming: store.isStreaming,
    setActiveDebate: store.setActive,
    getDebate: store.getDebate,
    removeDebate: store.removeDebate,
  };
}
```

</details>

**Verify:** `bun vitest run src/ui/hooks/__tests__/useDebate.test.ts`

---

### Batch 5: UI Components (parallel — 4 implementers)

Depend on Batch 4.

---

#### Task 5.1: DebateMessageBubble

**File:** `src/ui/dashboard/components/debate/DebateMessageBubble.tsx`
**Test:** `src/ui/dashboard/components/debate/__tests__/DebateMessageBubble.test.tsx`
**Depends:** 1.1 (uses `DebateMessage` type)

**Design decision:** Following the message bubble pattern from `PersonaChat.tsx`. Shows avatar initials, name, role label, message content, and timestamp. User messages get a different style ("You" label, right-aligned). Participant messages show the persona's initials circle with their name and occupation.

<details>
<summary>src/ui/dashboard/components/debate/__tests__/DebateMessageBubble.test.tsx</summary>

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DebateMessageBubble } from "../DebateMessageBubble";

describe("DebateMessageBubble", () => {
  it("renders a participant message with avatar and name", () => {
    render(
      <DebateMessageBubble
        message={{
          id: "1",
          personaId: "p1",
          personaName: "Alice Chen",
          role: "participant",
          round: 1,
          content: "I have concerns about this proposal.",
          order: 0,
        }}
        occupation="CTO"
      />,
    );

    expect(screen.getByText("Alice Chen")).toBeTruthy();
    expect(screen.getByText("CTO")).toBeTruthy();
    expect(screen.getByText("I have concerns about this proposal.")).toBeTruthy();
    expect(screen.getByText("AC")).toBeTruthy(); // initials
  });

  it("renders a user message with different styling", () => {
    render(
      <DebateMessageBubble
        message={{
          id: "2",
          personaId: "user",
          personaName: "You",
          role: "user",
          round: 2,
          content: "What about a compromise?",
          order: 5,
        }}
      />,
    );

    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("What about a compromise?")).toBeTruthy();
  });

  it("renders empty content for streaming placeholder", () => {
    render(
      <DebateMessageBubble
        message={{
          id: "3",
          personaId: "p1",
          personaName: "Alice Chen",
          role: "participant",
          round: 1,
          content: "",
          order: 1,
        }}
        occupation="CTO"
        isStreaming
      />,
    );

    // Should show a typing indicator
    expect(screen.getByTestId("typing-indicator")).toBeTruthy();
  });
});
```

</details>

<details>
<summary>src/ui/dashboard/components/debate/DebateMessageBubble.tsx</summary>

```typescript
"use client";

import React from "react";
import type { DebateMessage } from "@/domain/entities/DebateRoom";

interface DebateMessageBubbleProps {
  message: DebateMessage;
  occupation?: string;
  isStreaming?: boolean;
}

/**
 * A single message bubble in the debate room.
 * Participant messages show avatar initials + name + occupation.
 * User messages show "You" label with right-alignment.
 */
export function DebateMessageBubble({
  message,
  occupation,
  isStreaming,
}: DebateMessageBubbleProps) {
  const isUser = message.role === "user";
  const initials = message.personaName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Streaming placeholder — show typing dots
  if (isStreaming && !message.content) {
    return (
      <div className="flex flex-col max-w-[85%] self-start items-start">
        <div
          data-testid="typing-indicator"
          className="px-5 py-4 rounded-2xl rounded-tl-sm text-foreground border border-border/40 flex items-center gap-1.5"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col max-w-[85%] ${
        isUser ? "self-end items-end" : "self-start items-start"
      }`}
    >
      {/* Speaker label */}
      {!isUser && (
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary font-semibold text-xs text-secondary-foreground">
            {initials}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground leading-tight">
              {message.personaName}
            </span>
            {occupation && (
              <span className="text-[10px] text-muted-foreground leading-tight">
                {occupation}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap text-foreground ${
          isUser
            ? "rounded-tr-sm bg-primary/10 border border-primary/20"
            : "rounded-tl-sm bg-card border border-border/40"
        }`}
      >
        {message.content || (isStreaming ? "…" : "")}
      </div>

      {/* Label for user messages */}
      {isUser && (
        <span className="text-[10px] text-muted-foreground mt-1 px-1">You</span>
      )}
    </div>
  );
}
```

</details>

**Verify:** `bun vitest run src/ui/dashboard/components/debate/__tests__/DebateMessageBubble.test.tsx`

---

#### Task 5.2: DebateSetupPanel

**File:** `src/ui/dashboard/components/debate/DebateSetupPanel.tsx`
**Test:** `src/ui/dashboard/components/debate/__tests__/DebateSetupPanel.test.tsx`
**Depends:** 1.1 (uses `Persona` type from `Persona.ts`), `personaStore`

**Design decision:** A dialog/sheet that lets the user pick 2-5 personas from the active batch, enter a proposal, and set the number of rounds (2-5, default 3). Uses the `usePersonaStore` to get the available personas. Exposes an `onStart` callback that returns the config.

<details>
<summary>src/ui/dashboard/components/debate/__tests__/DebateSetupPanel.test.tsx</summary>

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebateSetupPanel } from "../DebateSetupPanel";

describe("DebateSetupPanel", () => {
  const mockPersonas = [
    { id: "p1", name: "Alice Chen", occupation: "CTO" },
    { id: "p2", name: "Bob Martinez", occupation: "Product Manager" },
    { id: "p3", name: "Casey Kim", occupation: "VP Engineering" },
  ];

  it("renders the setup form", () => {
    render(
      <DebateSetupPanel
        availablePersonas={mockPersonas as any}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("New Debate")).toBeTruthy();
    expect(screen.getByPlaceholderText(/What proposal/)).toBeTruthy();
    expect(screen.getByText(/Start Debate/)).toBeTruthy();
  });

  it("lists available personas as checkable items", () => {
    render(
      <DebateSetupPanel
        availablePersonas={mockPersonas as any}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice Chen")).toBeTruthy();
    expect(screen.getByText("Bob Martinez")).toBeTruthy();
    expect(screen.getByText("Casey Kim")).toBeTruthy();
  });

  it("calls onStart with config when form is submitted", () => {
    const onStart = vi.fn();
    render(
      <DebateSetupPanel
        availablePersonas={mockPersonas as any}
        onStart={onStart}
        onCancel={vi.fn()}
      />,
    );

    // Type a proposal
    const input = screen.getByPlaceholderText(/What proposal/);
    fireEvent.change(input, { target: { value: "Raise prices 60%" } });

    // Select first persona
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    // Submit
    const submitBtn = screen.getByText(/Start Debate/);
    fireEvent.click(submitBtn);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: "Raise prices 60%",
        totalRounds: 3,
      }),
    );
  });

  it("disables submit without proposal or personas", () => {
    render(
      <DebateSetupPanel
        availablePersonas={mockPersonas as any}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const submitBtn = screen.getByText(/Start Debate/);
    expect(submitBtn).toBeDisabled();
  });
});
```

</details>

<details>
<summary>src/ui/dashboard/components/debate/DebateSetupPanel.tsx</summary>

```typescript
"use client";

import React, { useState } from "react";
import type { Persona } from "@/domain/entities/Persona";

interface DebateSetupConfig {
  proposal: string;
  participants: Persona[];
  totalRounds: number;
}

interface DebateSetupPanelProps {
  availablePersonas: Persona[];
  onStart: (config: DebateSetupConfig) => void;
  onCancel: () => void;
}

/**
 * Setup panel for configuring a new debate.
 * User selects personas, enters a proposal, and sets rounds.
 */
export function DebateSetupPanel({
  availablePersonas,
  onStart,
  onCancel,
}: DebateSetupPanelProps) {
  const [proposal, setProposal] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [totalRounds, setTotalRounds] = useState(3);

  const togglePersona = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Max 5 participants
        if (next.size >= 5) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const selectedPersonas = availablePersonas.filter((p) =>
    selectedIds.has(p.id),
  );

  const canSubmit =
    proposal.trim().length > 0 &&
    selectedPersonas.length >= 2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    onStart({
      proposal: proposal.trim(),
      participants: selectedPersonas,
      totalRounds,
    });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold tracking-tight">New Debate</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Proposal */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Proposal
          </label>
          <textarea
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            placeholder="What proposal should the personas debate?"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            rows={3}
          />
        </div>

        {/* Persona selection */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Participants ({selectedPersonas.length}/5 — select 2-5)
          </label>
          <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto custom-scrollbar">
            {availablePersonas.map((p) => {
              const isSelected = selectedIds.has(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors text-sm ${
                    isSelected
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-background border border-border/40 hover:border-border/80"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePersona(p.id)}
                    className="rounded border-input h-4 w-4 accent-primary"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {p.occupation}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-xs text-primary font-medium shrink-0">
                      Selected
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {availablePersonas.length < 2 && (
            <p className="text-xs text-destructive">
              You need at least 2 personas in your batch. Create more personas first.
            </p>
          )}
        </div>

        {/* Rounds */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Rounds: {totalRounds}
          </label>
          <input
            type="range"
            min={1}
            max={5}
            value={totalRounds}
            onChange={(e) => setTotalRounds(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>3 (recommended)</span>
            <span>5</span>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Start Debate
        </button>
      </form>
    </div>
  );
}
```

</details>

**Verify:** `bun vitest run src/ui/dashboard/components/debate/__tests__/DebateSetupPanel.test.tsx`

---

#### Task 5.3: DebateSidebar

**File:** `src/ui/dashboard/components/debate/DebateSidebar.tsx`
**Test:** `src/ui/dashboard/components/debate/__tests__/DebateSidebar.test.tsx`
**Depends:** 1.3 (uses `useDebateStore`)

**Design decision:** Following the design mockup — lists all debates with proposal preview, status badge, and active indicator. Clicking a debate sets it as active. "New Debate" button at the bottom. The sidebar is distinct from the app sidebar — it's the inner debate navigation.

<details>
<summary>src/ui/dashboard/components/debate/__tests__/DebateSidebar.test.tsx</summary>

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebateSidebar } from "../DebateSidebar";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";

const mockPersona: Persona = {
  id: "p1", name: "A", age: 30,
  occupation: "CTO", educationLevel: "MSc",
  interests: [], goals: [],
  conscientiousness: 50, neuroticism: 50, openness: 50,
  extraversion: 50, agreeableness: 50,
  values: [], fears: [],
  communicationStyle: "", decisionStyle: "",
  pricingSensitivity: 50, typicalBudget: "",
};

describe("DebateSidebar", () => {
  beforeEach(() => {
    useDebateStore.setState({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
    });
  });

  it("shows empty state when no debates exist", () => {
    const onNewDebate = vi.fn();
    render(<DebateSidebar onNewDebate={onNewDebate} />);
    expect(screen.getByText(/No debates yet/)).toBeTruthy();
  });

  it("lists all debates with proposal preview", () => {
    useDebateStore.getState().addDebate({
      id: "d1",
      proposal: "Raise prices 60%",
      participants: [mockPersona],
      messages: [],
      currentRound: 0,
      totalRounds: 3,
      status: "setup",
      createdAt: new Date().toISOString(),
    });
    useDebateStore.getState().addDebate({
      id: "d2",
      proposal: "Ship Q2 vs Q3",
      participants: [mockPersona],
      messages: [],
      currentRound: 1,
      totalRounds: 3,
      status: "in_progress",
      createdAt: new Date().toISOString(),
    });

    render(<DebateSidebar onNewDebate={vi.fn()} />);
    expect(screen.getByText(/Raise prices/)).toBeTruthy();
    expect(screen.getByText(/Ship Q2/)).toBeTruthy();
  });

  it("highlights the active debate", () => {
    useDebateStore.getState().addDebate({
      id: "d1",
      proposal: "Test",
      participants: [mockPersona],
      messages: [],
      currentRound: 0,
      totalRounds: 3,
      status: "completed",
      createdAt: new Date().toISOString(),
    });

    render(<DebateSidebar onNewDebate={vi.fn()} />);
    const activeItem = screen.getByText("Test").closest("button");
    expect(activeItem?.className).toContain("active");
  });

  it("calls onNewDebate when button clicked", () => {
    const onNewDebate = vi.fn();
    render(<DebateSidebar onNewDebate={onNewDebate} />);
    const btn = screen.getByText(/New Debate/);
    fireEvent.click(btn);
    expect(onNewDebate).toHaveBeenCalledTimes(1);
  });

  it("shows status badges", () => {
    useDebateStore.getState().addDebate({
      id: "d1",
      proposal: "Test",
      participants: [mockPersona],
      messages: [],
      currentRound: 1,
      totalRounds: 3,
      status: "in_progress",
      createdAt: new Date().toISOString(),
    });

    render(<DebateSidebar onNewDebate={vi.fn()} />);
    expect(screen.getByText(/In Progress/)).toBeTruthy();
  });
});
```

</details>

<details>
<summary>src/ui/dashboard/components/debate/DebateSidebar.tsx</summary>

```typescript
"use client";

import React from "react";
import { useDebateStore } from "@/ui/stores/debateStore";
import { MessageSquareIcon, PlusIcon } from "lucide-react";

interface DebateSidebarProps {
  onNewDebate: () => void;
}

/**
 * Sidebar listing all debates with status badges.
 * Clicking a debate sets it as the active view.
 */
export function DebateSidebar({ onNewDebate }: DebateSidebarProps) {
  const debates = useDebateStore((s) => s.debates);
  const activeDebateId = useDebateStore((s) => s.activeDebateId);
  const setActive = useDebateStore((s) => s.setActive);

  const statusConfig: Record<string, { label: string; dotClass: string }> = {
    setup: { label: "Setup", dotClass: "bg-muted-foreground" },
    in_progress: { label: "In Progress", dotClass: "bg-blue-500 animate-pulse" },
    completed: { label: "Completed", dotClass: "bg-green-500" },
    error: { label: "Error", dotClass: "bg-destructive" },
  };

  return (
    <aside className="w-64 shrink-0 border-r border-border/40 bg-sidebar flex flex-col h-full">
      <div className="h-14 flex items-center px-5 border-b border-border/40">
        <span className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <MessageSquareIcon className="h-4 w-4" />
          Debates
        </span>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {debates.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
            <MessageSquareIcon className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-xs text-muted-foreground">No debates yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-3 overflow-y-auto custom-scrollbar">
            {debates.map((debate) => {
              const config = statusConfig[debate.status] ?? statusConfig.error;
              const isActive = debate.id === activeDebateId;
              const preview = debate.proposal.length > 40
                ? debate.proposal.slice(0, 40) + "…"
                : debate.proposal;

              return (
                <button
                  key={debate.id}
                  onClick={() => setActive(debate.id)}
                  className={`flex flex-col gap-1 px-3 py-2.5 rounded-md text-left transition-colors w-full ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${config.dotClass}`} />
                    <span className={`text-xs font-medium truncate ${isActive ? "text-primary" : ""}`}>
                      {config.label}
                    </span>
                  </div>
                  <span className="text-xs truncate pl-[14px]">{preview}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/40">
        <button
          type="button"
          onClick={onNewDebate}
          className="flex items-center justify-center gap-2 w-full h-9 rounded-md bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New Debate
        </button>
      </div>
    </aside>
  );
}
```

</details>

**Verify:** `bun vitest run src/ui/dashboard/components/debate/__tests__/DebateSidebar.test.tsx`

---

#### Task 5.4: DebateRoom (Main UI)

**File:** `src/ui/dashboard/components/debate/DebateRoom.tsx`
**Test:** `src/ui/dashboard/components/debate/__tests__/DebateRoom.test.tsx`
**Depends:** 5.1 (uses `DebateMessageBubble`), 4.2 (uses `useDebate`)

**Design decision:** The main room component maps messages from the active debate to bubbles, shows round separators, a header with proposal + progress, and an input bar for interjection. Follows the layout mockup from the design — round separators, pulse dots during thinking, auto-scroll.

<details>
<summary>src/ui/dashboard/components/debate/__tests__/DebateRoom.test.tsx</summary>

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DebateRoom } from "../DebateRoom";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";

const mockPersona: Persona = {
  id: "p1", name: "Alice Chen", age: 38,
  occupation: "CTO", educationLevel: "MSc",
  interests: [], goals: [],
  conscientiousness: 50, neuroticism: 50, openness: 50,
  extraversion: 50, agreeableness: 50,
  values: [], fears: [],
  communicationStyle: "", decisionStyle: "",
  pricingSensitivity: 50, typicalBudget: "",
};

function setupStore() {
  useDebateStore.setState({
    debates: [{
      id: "d1",
      proposal: "Raise prices 60%",
      participants: [mockPersona],
      messages: [],
      currentRound: 1,
      totalRounds: 3,
      status: "in_progress",
      createdAt: new Date().toISOString(),
    }],
    activeDebateId: "d1",
    isStreaming: false,
  });
}

describe("DebateRoom", () => {
  beforeEach(() => {
    useDebateStore.setState({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
    });
  });

  it("shows empty state when no active debate", () => {
    render(<DebateRoom />);
    expect(screen.getByText(/Select a debate/)).toBeTruthy();
  });

  it("renders debate header with proposal and round info", () => {
    setupStore();
    render(<DebateRoom />);
    expect(screen.getByText(/Raise prices 60%/)).toBeTruthy();
    expect(screen.getByText(/Round 1 of 3/)).toBeTruthy();
  });

  it("shows participants in the header", () => {
    setupStore();
    render(<DebateRoom />);
    expect(screen.getByText(/Alice Chen/)).toBeTruthy();
  });

  it("shows round separators when there are messages in different rounds", () => {
    useDebateStore.setState({
      debates: [{
        id: "d1",
        proposal: "Test",
        participants: [mockPersona],
        messages: [
          { id: "m1", personaId: "p1", personaName: "Alice", role: "participant", round: 1, content: "First", order: 0 },
          { id: "m2", personaId: "p1", personaName: "Alice", role: "participant", round: 2, content: "Second", order: 1 },
        ],
        currentRound: 2,
        totalRounds: 3,
        status: "in_progress",
        createdAt: new Date().toISOString(),
      }],
      activeDebateId: "d1",
      isStreaming: false,
    });
    render(<DebateRoom />);
    expect(screen.getAllByText(/Round/).length).toBeGreaterThanOrEqual(1);
  });
});
```

</details>

<details>
<summary>src/ui/dashboard/components/debate/DebateRoom.tsx</summary>

```typescript
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useDebateStore } from "@/ui/stores/debateStore";
import { DebateMessageBubble } from "./DebateMessageBubble";
import { Send, CopyIcon, CheckIcon } from "lucide-react";

/**
 * Main debate room UI.
 * Shows the active debate's messages, round separators, progress, and input bar.
 */
export function DebateRoom() {
  const debates = useDebateStore((s) => s.debates);
  const activeDebateId = useDebateStore((s) => s.activeDebateId);
  const isStreaming = useDebateStore((s) => s.isStreaming);
  const activeDebate = debates.find((d) => d.id === activeDebateId);

  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeDebate?.messages]);

  if (!activeDebate) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">Select a debate or start a new one</p>
        </div>
      </div>
    );
  }

  const handleCopyTranscript = async () => {
    const transcript = activeDebate.messages
      .map((m) => `[${m.personaName}]: ${m.content}`)
      .join("\n\n");
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInterject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeDebateId) return;
    // Interjection will be handled by the useDebate hook
    // For now, the store tracks the message
    useDebateStore.getState().addMessage(activeDebateId, {
      id: crypto.randomUUID(),
      personaId: "user",
      personaName: "You",
      role: "user",
      round: activeDebate.currentRound,
      content: input.trim(),
      order: activeDebate.messages.length,
    });
    setInput("");
  };

  // Group messages by round for separator rendering
  const messagesByRound = activeDebate.messages.reduce<
    Record<number, typeof activeDebate.messages>
  >((acc, msg) => {
    if (!acc[msg.round]) acc[msg.round] = [];
    acc[msg.round].push(msg);
    return acc;
  }, {});

  const getPersona = (personaId: string) =>
    activeDebate.participants.find((p) => p.id === personaId);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-bold tracking-tight">
              {activeDebate.proposal}
            </h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Round {activeDebate.currentRound} of {activeDebate.totalRounds}
              </span>
              <span>·</span>
              <span>
                {activeDebate.participants.map((p) => p.name).join(" · ")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyTranscript}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/40 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex gap-1">
          {Array.from({ length: activeDebate.totalRounds }, (_, i) => {
            const roundNum = i + 1;
            const isCompleted = roundNum < activeDebate.currentRound;
            const isCurrent = roundNum === activeDebate.currentRound;
            return (
              <div
                key={roundNum}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  isCompleted
                    ? "bg-primary"
                    : isCurrent
                      ? "bg-primary/50"
                      : "bg-muted"
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
        {Object.entries(messagesByRound).map(([roundStr, messages]) => {
          const roundNum = Number(roundStr);
          return (
            <div key={roundStr} className="flex flex-col gap-4">
              {/* Round separator */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Round {roundNum}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Messages in this round */}
              {messages.map((msg) => {
                const persona = msg.personaId !== "user"
                  ? getPersona(msg.personaId)
                  : undefined;
                return (
                  <DebateMessageBubble
                    key={msg.id}
                    message={msg}
                    occupation={persona?.occupation}
                    isStreaming={
                      isStreaming &&
                      msg === activeDebate.messages[activeDebate.messages.length - 1] &&
                      !msg.content
                    }
                  />
                );
              })}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      {activeDebate.status === "in_progress" && (
        <div className="shrink-0 px-6 py-4 border-t border-border/40 bg-card">
          <form
            onSubmit={handleInterject}
            className="relative flex items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add your perspective (interjects into the debate)..."
              disabled={isStreaming}
              className="w-full h-11 pl-4 pr-12 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all placeholder:text-muted-foreground/70 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="absolute right-1.5 h-8 w-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

</details>

**Verify:** `bun vitest run src/ui/dashboard/components/debate/__tests__/DebateRoom.test.tsx`

---

### Batch 6: Integration (parallel — 3 implementers)

Depend on Batch 5.

---

#### Task 6.1: Debates Route Page

**File:** `src/app/(app)/dashboard/debates/page.tsx`
**Test:** none (Next.js page, minimal logic)
**Depends:** 5.4 (uses `DebateRoom`), 5.1 (uses `DebateSidebar`), 5.2 (uses `DebateSetupPanel`)

**Design decision:** Following the `simulations/page.tsx` pattern — a client component that composes the sidebar + main area. The page switches between setup panel (when creating) and debate room (when viewing). Uses `useDebate` for the `startDebate` action and `usePersonaStore` to get available personas from the active batch.

<details>
<summary>src/app/(app)/dashboard/debates/page.tsx</summary>

```typescript
"use client";

import React, { useState } from "react";
import { useDebateStore } from "@/ui/stores/debateStore";
import { usePersonaStore } from "@/ui/stores/personaStore";
import { useDebate } from "@/ui/hooks/useDebate";
import { DebateSidebar } from "@/ui/dashboard/components/debate/DebateSidebar";
import { DebateRoom } from "@/ui/dashboard/components/debate/DebateRoom";
import { DebateSetupPanel } from "@/ui/dashboard/components/debate/DebateSetupPanel";

export default function DebatesPage() {
  const [showSetup, setShowSetup] = useState(false);
  const [startingDebate, setStartingDebate] = useState(false);

  const { startDebate, setActiveDebate } = useDebate();
  const activeBatch = usePersonaStore((s) => {
    const batches = s.batches;
    const activeId = s.activeBatchId;
    return activeId ? batches.find((b) => b.id === activeId) : batches[0];
  });

  const availablePersonas = activeBatch?.personas ?? [];

  const handleStart = async (config: {
    proposal: string;
    participants: any[];
    totalRounds: number;
  }) => {
    setStartingDebate(true);
    try {
      const debateId = await startDebate(
        config.proposal,
        config.participants,
        config.totalRounds,
      );
      setShowSetup(false);
      setActiveDebate(debateId);
    } catch (err) {
      console.error("[DebatesPage] Failed to start debate:", err);
    } finally {
      setStartingDebate(false);
    }
  };

  return (
    <div className="flex h-full w-full animate-in fade-in duration-500">
      <DebateSidebar onNewDebate={() => setShowSetup(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        {showSetup ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-lg mx-auto">
              <DebateSetupPanel
                availablePersonas={availablePersonas}
                onStart={handleStart}
                onCancel={() => {
                  setShowSetup(false);
                }}
              />
              {startingDebate && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Starting debate...
                </div>
              )}
            </div>
          </div>
        ) : (
          <DebateRoom />
        )}
      </div>
    </div>
  );
}
```

</details>

**Verify:** `bun run dev` and navigate to `/dashboard/debates`

---

#### Task 6.2: Add Debates Link to Sidebar

**File:** `src/ui/dashboard/components/Sidebar.tsx` (MODIFY)
**Test:** none
**Depends:** 6.1 (route exists)

**Change:** Add a "Debates" nav link after "Simulations" with a `MessageSquareIcon`.

<details>
<summary>Changes to Sidebar.tsx</summary>

1. Add import: `import { MessageSquareIcon } from 'lucide-react'` at top
2. Add `const isDebates = pathname.startsWith('/dashboard/debates')` after `isSimulations`
3. Add nav link after the Simulations link:

```typescript
        <Link
          href="/dashboard/debates"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
            isDebates
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <MessageSquareIcon className="h-4 w-4" />
          Debates
        </Link>
```

**Edit instructions for implementer:**
- Read `src/ui/dashboard/components/Sidebar.tsx`
- Add `MessageSquareIcon` to the lucide-react import line
- After the Simulations `<Link>` (line ~60), add the Debates `<Link>` block shown above
- Add `const isDebates = pathname.startsWith('/dashboard/debates')` after the `isSimulations` line (~line 17)

</details>

**Verify:** Navigate to dashboard — sidebar shows "Debates" link with icon, clicking navigates to `/dashboard/debates`.

---

#### Task 6.3: Integration Entry Point in DashboardClient

**File:** `src/ui/dashboard/components/DashboardClient.tsx` (MODIFY)
**Test:** none
**Depends:** 5.2 (uses `DebateSetupPanel`)

**Design decision:** Add a "New Debate" button in the persona batch view (the area that already has "Run Pricing Simulation"). This button opens a dialog/sheet that shows the `DebateSetupPanel` pre-populated with the batch's personas.

**Change:** In the persona batch view section (after the pricing simulation section, around line 335), add a "New Debate" section:

```typescript
{/* Debate section */}
<div className="border-t border-border/40 pt-8 mt-8">
  <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold tracking-tight">Strategy Room</h3>
      <p className="text-sm text-muted-foreground">
        Have your personas debate a strategic proposal. Watch competing perspectives clash and resolve.
      </p>
    </div>
    <Link
      href="/dashboard/debates"
      className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 w-fit"
    >
      Start New Debate
    </Link>
  </div>
</div>
```

Also add `MessageSquareIcon` to lucide-react import and add import for `Link` (it's already imported in DashboardClient.tsx).

**Edit instructions for implementer:**
- Read `src/ui/dashboard/components/DashboardClient.tsx`
- Add `MessageSquareIcon` to the lucide-react import
- After the pricing simulation section (after line ~335's closing div), add the debate section shown above
- `Link` is already imported at line 15

**Verify:** Dashboard batch view shows "Start New Debate" button. Clicking navigates to `/dashboard/debates`.

---

## Success Criteria

- [ ] All 13 new files exist with complete implementations (no TODOs or placeholders)
- [ ] All 2 modified files have the correct changes applied
- [ ] All unit tests pass: `bun vitest run`
- [ ] TypeScript compiles without errors: `bun run typecheck` (or `bun tsc --noEmit`)
- [ ] Debate sidebar shows empty state when no debates exist
- [ ] "New Debate" button opens setup panel
- [ ] Setup panel enforces 2-5 persona selection
- [ ] Setup panel validates proposal is non-empty
- [ ] "Start Debate" triggers server action with streaming
- [ ] Streaming events update the debate store in real-time
- [ ] Message bubbles render correctly for participants and user
- [ ] Round separators appear between different rounds
- [ ] Progress bar shows round progress (filled/current/empty segments)
- [ ] Copy transcript button exports all messages as text
- [ ] Input bar allows user interjection during active debate
- [ ] Debate completes with `completed` status
- [ ] Errors set `error` status with message
- [ ] Sidebar lists all debates with status badges
- [ ] Clicking a debate in sidebar switches the active view
- [ ] Multi-debate: starting a second debate does not overwrite the first
- [ ] Debates persist in localStorage across page reloads (metadata only)
- [ ] Nav sidebar has "Debates" link pointing to `/dashboard/debates`
- [ ] Dashboard batch view has "Start New Debate" button
