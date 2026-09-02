import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";

// Mock the server action at module level
vi.mock("@/actions/debateAction", () => ({
  debateAction: vi.fn(),
}));

vi.mock("@ai-sdk/rsc", () => ({
  readStreamableValue: vi.fn((streamData: any) => streamData),
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
