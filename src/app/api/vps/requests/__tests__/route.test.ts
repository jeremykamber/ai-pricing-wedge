import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCancelRequest = vi.hoisted(() => vi.fn());
const mockGetActiveRequestIds = vi.hoisted(() =>
  vi.fn(() => ["req-123", "req-456"]),
);

vi.mock("@/infrastructure/RequestCancellationManager", () => ({
  cancellationManager: {
    cancelRequest: mockCancelRequest,
    getActiveRequestIds: mockGetActiveRequestIds,
    createRequest: vi.fn(),
    clearRequest: vi.fn(),
  },
}));

describe("POST /api/vps/requests (cancel)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels an active request and returns success", async () => {
    mockCancelRequest.mockReturnValue(true);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "req-123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("message");
  });

  it("returns success with false when request was not found", async () => {
    mockCancelRequest.mockReturnValue(false);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "unknown-id" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("message");
  });

  it("returns 400 when requestId is missing", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when requestId is empty string", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("GET /api/vps/requests (list active)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list of active request IDs", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("requestIds");
    expect(Array.isArray(body.requestIds)).toBe(true);
    expect(body.requestIds).toEqual(["req-123", "req-456"]);
  });

  it("returns empty array when no active requests", async () => {
    mockGetActiveRequestIds.mockReturnValueOnce([]);

    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestIds).toEqual([]);
  });
});
