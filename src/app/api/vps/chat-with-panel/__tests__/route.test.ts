import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { collectStream } from "../../__tests__/test-utils";

const mockChatWithPanelExecuteStream = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => {
  const LlmServiceImpl = class {
    static createFromEnv = vi.fn(() => new LlmServiceImpl());
  };
  return { LlmServiceImpl };
});

vi.mock("@/application/usecases/ChatWithPanelUseCase", () => ({
  ChatWithPanelUseCase: class {
    executeStream = mockChatWithPanelExecuteStream;
  },
}));

function buildResponse() {
  return {
    id: "r-1",
    screenshotBase64: "iVBOR...",
    rawAnalysis: "raw stream",
    overview: "Sarah found the pricing clear.",
    customerJourney: [
      { stage: "interpretation", description: "d", sentiment: "neutral", outcome: "succeeded" },
      { stage: "understanding", description: "d", sentiment: "positive", outcome: "succeeded" },
      { stage: "belief", description: "d", sentiment: "neutral", outcome: "succeeded" },
      { stage: "motivation", description: "d", sentiment: "positive", outcome: "succeeded" },
      { stage: "action", description: "d", sentiment: "negative", outcome: "blocked" },
    ],
    researchQuestionAnswer: "Pricing visibility is the blocker.",
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    personaProfile: {
      name: "Sarah Chen",
      occupation: "Senior Engineer",
      bigFive: { conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 50, agreeableness: 60 },
      values: ["Transparency"],
      fears: ["Hidden costs"],
      communicationStyle: "direct",
      decisionStyle: "data-driven",
    },
  };
}

describe("POST /api/vps/chat-with-panel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams a panel synthesis response", async () => {
    mockChatWithPanelExecuteStream.mockImplementation(async function* () {
      yield "A monthly plan would remove the blocker for most of your personas.";
    });

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/chat-with-panel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: [buildResponse()],
          synthesis: null,
          message: "We're thinking of adding a monthly plan — what would you all think?",
          history: [],
        }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");

    const text = await collectStream(res.body!);
    expect(text).toBe("A monthly plan would remove the blocker for most of your personas.");
    expect(mockChatWithPanelExecuteStream).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "r-1" })],
      null,
      "We're thinking of adding a monthly plan — what would you all think?",
      [],
    );
  });

  it("defaults missing responses and synthesis to empty/null", async () => {
    mockChatWithPanelExecuteStream.mockImplementation(async function* () {
      yield "ok";
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/chat-with-panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", history: [] }),
    });
    const res = await POST(req);
    const text = await collectStream(res.body!);
    expect(text).toBe("ok");
    expect(mockChatWithPanelExecuteStream).toHaveBeenCalledWith([], null, "Hello", []);
  });
});
