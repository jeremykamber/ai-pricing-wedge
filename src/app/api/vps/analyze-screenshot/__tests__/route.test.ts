import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockStoreGet = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/screenshotStore", () => ({
  screenshotStore: {
    get: mockStoreGet,
    set: vi.fn(),
  },
}));

describe("GET /api/vps/analyze-screenshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns screenshot data when runId is provided", async () => {
    mockStoreGet.mockReturnValue("iVBOR...");

    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-screenshot?runId=test-123",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ found: true, base64: "iVBOR..." });
  });

  it("returns found:false when runId is unknown", async () => {
    mockStoreGet.mockReturnValue(undefined);

    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-screenshot?runId=missing",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ found: false });
  });

  it("returns 400 when runId is missing", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/analyze-screenshot",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
