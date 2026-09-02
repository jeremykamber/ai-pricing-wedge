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
    const debateEndEvents = events.filter((e) => e.type === "debate_end");
    expect(debateEndEvents).toHaveLength(1);
    const personaEndEvents = events.filter((e) => e.type === "persona_end");
    expect(personaEndEvents).toHaveLength(2);
  });
});
