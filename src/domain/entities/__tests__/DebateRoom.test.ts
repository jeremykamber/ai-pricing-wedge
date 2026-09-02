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
