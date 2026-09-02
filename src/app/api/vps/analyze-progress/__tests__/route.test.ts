import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const progressMap = new Map<string, any>(); // Shared mutable map for tests

vi.mock("@/infrastructure/progressStore", () => ({
  progressMap,
}));

describe("GET /api/vps/analyze-progress", () => {
  beforeEach(() => progressMap.clear());

  it("returns progress data when runId is provided", async () => {
    progressMap.set("test-123", { step: "EXTRACTING", current: 3, total: 5 });

    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-progress?runId=test-123",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      found: true,
      progress: { step: "EXTRACTING", current: 3, total: 5 },
    });
  });

  it("returns 400 when runId is missing", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/analyze-progress");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns found=false for unknown runId", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-progress?runId=nonexistent",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ found: false });
  });
});
