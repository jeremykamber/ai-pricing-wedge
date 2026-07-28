import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockPersona } from "../../__tests__/test-utils";

const mockRateLimiterConsume = vi.hoisted(() =>
  vi.fn(() => Promise.resolve()),
);
const mockAnalyzeArtifactExecute = vi.hoisted(() => vi.fn());

vi.mock("rate-limiter-flexible", () => ({
  RateLimiterMemory: class {
    consume = mockRateLimiterConsume;
  },
}));

vi.mock("@/infrastructure/RequestCancellationManager", () => ({
  cancellationManager: {
    createRequest: vi.fn(() => ({ signal: { aborted: false } })),
    cancelRequest: vi.fn(),
    clearRequest: vi.fn(),
    getActiveRequestIds: vi.fn(),
  },
}));

vi.mock("@/infrastructure/SimulationResultStore", () => ({
  simulationResultStore: {
    save: vi.fn(),
    saveError: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("@/infrastructure/AnalysisLogger", () => {
  const MockLogger = class {
    log = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    init = vi.fn(() => Promise.resolve());
    close = vi.fn(() => Promise.resolve());
  };
  MockLogger.forRun = vi.fn(() => new MockLogger());
  MockLogger.removeRun = vi.fn();
  return { AnalysisLogger: MockLogger };
});

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => {
  const LlmServiceImpl = class {
    createChatCompletion = vi.fn();
  };
  LlmServiceImpl.createFromEnv = vi.fn(() => new LlmServiceImpl());
  return { LlmServiceImpl };
});

vi.mock("@/infrastructure/adapters/RemotePlaywrightAdapter", () => {
  const MockAdapter = class {
    navigate = vi.fn();
    close = vi.fn();
  };
  MockAdapter.createFromEnv = vi.fn(() => new MockAdapter());
  return { RemotePlaywrightAdapter: MockAdapter };
});

vi.mock("@/infrastructure/adapters/ArtifactIntakeAdapter", () => ({
  ArtifactIntakeAdapter: class {
    intake = vi.fn(() => Promise.resolve({ screenshotBase64: "mock", url: "https://example.com" }));
  },
}));

vi.mock("@/application/usecases/AnalyzeArtifactUseCase", () => ({
  AnalyzeArtifactUseCase: class {
    execute = mockAnalyzeArtifactExecute;
  },
}));

vi.mock("@/actions/getProgress", () => ({
  storeProgress: vi.fn(),
  storeCompleted: vi.fn(),
}));

describe("POST /api/vps/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzeArtifactExecute.mockResolvedValue([]);
  });

  it("returns runId on valid URL input", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { type: "url", url: "https://example.com" },
        personas: [mockPersona],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("runId");
  });

  it("returns runId on valid screenshot input", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { type: "screenshot", imageBase64: "iVBORw0KG..." },
        personas: [mockPersona],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("runId");
  });

  it("accepts optional runId, businessGoal, researchQuestion", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { type: "url", url: "https://example.com" },
        personas: [mockPersona],
        runId: "custom-123",
        businessGoal: "Increase signups",
        researchQuestion: "Why do users leave?",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("runId");
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimiterConsume.mockRejectedValueOnce(new Error("Too fast"));
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { type: "url", url: "https://example.com" },
        personas: [mockPersona],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("runId");
  });

  it("returns 400 when personas array is empty", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { type: "url", url: "https://example.com" },
        personas: [],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("runId");
  });

  it("returns 400 when input is missing", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personas: [mockPersona],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("runId");
  });

  it("returns 400 when URL type has empty url", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { type: "url", url: "" },
        personas: [mockPersona],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("runId");
  });
});
