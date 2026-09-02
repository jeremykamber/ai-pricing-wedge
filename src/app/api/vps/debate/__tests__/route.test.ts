import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockPersona, collectStream } from "../../__tests__/test-utils";

const mockDebateAdapterExecute = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => {
  const LlmServiceImpl = class {
    static createFromEnv = vi.fn(() => new LlmServiceImpl());
  };
  return { LlmServiceImpl };
});

vi.mock("@/infrastructure/adapters/DebateAdapter", () => ({
  DebateAdapter: class {
    executeDebate = mockDebateAdapterExecute;
  },
}));

vi.mock("@/infrastructure/adapters/DebatePromptCompiler", () => ({
  DebatePromptCompiler: class {
    compile = vi.fn(() => "compiled prompt");
  },
}));

describe("POST /api/vps/debate (SSE)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams SSE events from debate adapter", async () => {
    mockDebateAdapterExecute.mockImplementation(async function* () {
      yield {
        type: "debate_start",
        proposal: "Test proposal",
        participants: ["Persona A"],
      };
      yield { type: "round_start", round: 1, totalRounds: 1 };
      yield { type: "persona_start", personaId: "p1", personaName: "Persona A" };
      yield { type: "chunk", personaId: "p1", text: "Hello world" };
      yield { type: "persona_end", personaId: "p1" };
      yield { type: "round_end", round: 1 };
      yield { type: "debate_end" };
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/debate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposal: "Test proposal",
        participants: [mockPersona],
        totalRounds: 1,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.body).toBeTruthy();

    const rawText = await collectStream(res.body!);
    expect(rawText).toContain('"type":"debate_start"');
    expect(rawText).toContain('"type":"round_start"');
    expect(rawText).toContain('"type":"persona_start"');
    expect(rawText).toContain('"type":"chunk"');
    expect(rawText).toContain('"type":"persona_end"');
    expect(rawText).toContain('"type":"round_end"');
    expect(rawText).toContain('"type":"debate_end"');
  });

  it("streams error event when debate adapter yields error", async () => {
    mockDebateAdapterExecute.mockImplementation(async function* () {
      yield { type: "error", message: "Debate crashed" };
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/debate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposal: "Test",
        participants: [mockPersona],
        totalRounds: 1,
      }),
    });
    const res = await POST(req);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const rawText = await collectStream(res.body!);
    expect(rawText).toContain('"type":"error"');
    expect(rawText).toContain("Debate crashed");
  });
});
