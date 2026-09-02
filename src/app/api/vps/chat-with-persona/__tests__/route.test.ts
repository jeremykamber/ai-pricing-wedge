import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockPersona, mockAnalysis, collectStream } from "../../__tests__/test-utils";

const mockChatWithPersonaExecuteStream = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => {
  const LlmServiceImpl = class {
    static createFromEnv = vi.fn(() => new LlmServiceImpl());
  };
  return { LlmServiceImpl };
});

vi.mock("@/application/usecases/ChatWithPersonaUseCase", () => ({
  ChatWithPersonaUseCase: class {
    executeStream = mockChatWithPersonaExecuteStream;
  },
}));

describe("POST /api/vps/chat-with-persona", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams text response from chat", async () => {
    // Route sends accumulated fullText each chunk, so single yield is correct.
    mockChatWithPersonaExecuteStream.mockImplementation(async function* () {
      yield "Hello there!";
    });

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/chat-with-persona",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: mockPersona,
          analysis: mockAnalysis,
          message: "What do you think?",
          history: [],
        }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");

    const text = await collectStream(res.body!);
    expect(text).toBe("Hello there!");
  });

  it("streams text when analysis is null", async () => {
    mockChatWithPersonaExecuteStream.mockImplementation(async function* () {
      yield "No analysis available";
    });

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/chat-with-persona",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: mockPersona,
          analysis: null,
          message: "Hello",
          history: [{ role: "user", content: "Hi" }],
        }),
      },
    );
    const res = await POST(req);
    const text = await collectStream(res.body!);
    expect(text).toBe("No analysis available");
  });
});
