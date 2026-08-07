import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRateLimiterConsume = vi.hoisted(() =>
  vi.fn(() => Promise.resolve()),
);
const mockGeneratePersonasExecute = vi.hoisted(() => vi.fn());

vi.mock("rate-limiter-flexible", () => ({
  RateLimiterMemory: class {
    consume = mockRateLimiterConsume;
  },
}));

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => {
  const LlmServiceImpl = class {};
  LlmServiceImpl.createFromEnv = vi.fn(() => new LlmServiceImpl());
  return { LlmServiceImpl };
});

vi.mock("@/application/usecases/GeneratePersonasUseCase", () => ({
  GeneratePersonasUseCase: class {
    execute = mockGeneratePersonasExecute;
  },
}));

describe("POST /api/vps/generate-personas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns runId immediately for valid input (fire-and-forget)", async () => {
    mockGeneratePersonasExecute.mockResolvedValue([]);

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaDescription: "A tech-savvy founder" }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("runId");
    expect(typeof body.runId).toBe("string");
    expect(body.runId.length).toBeGreaterThan(0);
  });

  it("forwards mode to the use case", async () => {
    mockGeneratePersonasExecute.mockResolvedValue([]);

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaDescription: "A tech-savvy founder", mode: "strategy" }),
      },
    );
    await POST(req);
    // Generation is fire-and-forget: wait for the background IIFE to reach the use case.
    await new Promise((r) => setTimeout(r, 10));
    expect(mockGeneratePersonasExecute).toHaveBeenCalledWith(
      "A tech-savvy founder",
      expect.any(Function),
      5,
      undefined,
      "strategy",
    );
  });

  it("drops unsupported modes", async () => {
    mockGeneratePersonasExecute.mockResolvedValue([]);

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaDescription: "A tech-savvy founder", mode: "bogus" }),
      },
    );
    await POST(req);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockGeneratePersonasExecute).toHaveBeenCalledWith(
      "A tech-savvy founder",
      expect.any(Function),
      5,
      undefined,
      undefined,
    );
  });

  it("returns 400 when personaDescription is missing", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimiterConsume.mockRejectedValueOnce(new Error("Too fast"));

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaDescription: "A tech-savvy founder" }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns runId even when use case throws (error captured in background)", async () => {
    mockGeneratePersonasExecute.mockRejectedValueOnce(
      new Error("Unexpected crash"),
    );

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaDescription: "A tech-savvy founder" }),
      },
    );
    const res = await POST(req);
    // POST always returns 200 with runId — errors are captured asynchronously
    // in the background IIFE and stored in PersonaGenerationStore for polling
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("runId");
  });
});
