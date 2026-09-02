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
