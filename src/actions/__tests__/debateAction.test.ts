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
  DebateAdapter: vi.fn(function () {
    return {
      executeDebate: vi.fn().mockImplementation(async function* () {
        yield { type: "debate_start", proposal: "Test", participants: ["Alice"] };
        yield { type: "round_start", round: 1, totalRounds: 1 };
        yield { type: "persona_start", personaId: "p1", personaName: "Alice" };
        yield { type: "chunk", personaId: "p1", text: "Hello" };
        yield { type: "persona_end", personaId: "p1" };
        yield { type: "round_end", round: 1 };
        yield { type: "debate_end" };
      }),
    };
  }),
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
