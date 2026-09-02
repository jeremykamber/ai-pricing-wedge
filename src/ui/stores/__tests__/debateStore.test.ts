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
