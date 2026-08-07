import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockStoreGet = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/SimulationResultStore", () => ({
  simulationResultStore: {
    get: mockStoreGet,
    save: vi.fn(),
    saveError: vi.fn(),
  },
}));

describe("GET /api/vps/analyze-result", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns simulation result when runId is provided", async () => {
    mockStoreGet.mockReturnValue({
      analyses: [{ id: "a1" }],
      error: undefined,
      completedAt: "2026-01-01T00:00:00.000Z",
    });

    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-result?runId=test-123",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      found: true,
      analyses: [{ id: "a1" }],
      error: undefined,
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns found:false when runId is unknown", async () => {
    mockStoreGet.mockReturnValue(undefined);

    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-result?runId=missing",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ found: false });
  });

  it("returns 400 when runId is missing", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-result");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
