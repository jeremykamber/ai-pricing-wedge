import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockPersona, mockAnalysis } from "../../__tests__/test-utils";
import { clear } from "console";

// ── Hoisted mock functions ──────────────────────────────────────────────────
const mockRateLimiterConsume = vi.hoisted(() =>
  vi.fn(() => Promise.resolve()),
);
const mockParsePricingPageExecute = vi.hoisted(() => vi.fn());

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
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/infrastructure/AnalysisLogger", () => {
  const MockLogger = class {
    log = vi.fn();
    getLogs = vi.fn(() => []);
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
    createChatCompletionStream = vi.fn();
    generatePersonas = vi.fn();
    generateVariationPersonas = vi.fn();
  };
  LlmServiceImpl.createFromEnv = vi.fn(() => new LlmServiceImpl());
  return { LlmServiceImpl };
});

vi.mock("@/infrastructure/adapters/RemotePlaywrightAdapter", () => {
  const MockAdapter = class {
    navigate = vi.fn();
    screenshot = vi.fn();
    close = vi.fn();
  };
  MockAdapter.createFromEnv = vi.fn(() => new MockAdapter());
  return { RemotePlaywrightAdapter: MockAdapter };
});

vi.mock("@/application/usecases/ParsePricingPageUseCase", () => ({
  ParsePricingPageUseCase: class {
    execute = mockParsePricingPageExecute;
  },
}));

vi.mock("@/actions/getProgress", () => ({
  storeProgress: vi.fn(),
  storeCompleted: vi.fn(),
}));

vi.mock("@/actions/getScreenshot", () => ({
  storeScreenshot: vi.fn(),
}));

// ── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/vps/analyze-pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParsePricingPageExecute.mockResolvedValue([mockAnalysis]);
  });

  it("returns runId on valid input", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/pricing",
        personas: [mockPersona],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("runId");
    expect(typeof body.runId).toBe("string");
  });

  it("accepts optional runId and imageBase64", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/pricing",
        personas: [mockPersona],
        runId: "custom-123",
        imageBase64: "iVBORw0KG...",
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
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/pricing",
        personas: [mockPersona],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("runId");
  });

  it("returns 400 when ran with empty persona array", async () => {
      const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/pricing",
        personas: [],
      }),
    });
    const res = await POST(req);
    console.log(res);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("runId");
  });

  it("returns 400 when ran with empty url", async () => {
      const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "",
        personas: [mockPersona],
      }),
    });
    const res = await POST(req);
    console.log(res);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("runId");
  });
});
