import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockPersona } from "../../__tests__/test-utils";

const mockGenerateVariationPersonas = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => {
  const LlmServiceImpl = class {
    generateVariationPersonas = mockGenerateVariationPersonas;
    static createFromEnv = vi.fn(() => new LlmServiceImpl());
  };
  return { LlmServiceImpl };
});

describe("POST /api/vps/generate-similar-personas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns similar personas on valid input", async () => {
    mockGenerateVariationPersonas.mockResolvedValue([mockPersona]);

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-similar-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencePersona: mockPersona,
          adjustments: { openness: 10 },
          count: 3,
        }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.step).toBe("DONE");
    expect(body.personas).toHaveLength(1);
  });

  it("returns 500 when generation throws", async () => {
    mockGenerateVariationPersonas.mockRejectedValueOnce(
      new Error("LLM error"),
    );

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/generate-similar-personas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencePersona: mockPersona,
          adjustments: {},
          count: 1,
        }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.step).toBe("ERROR");
    expect(body.error).toBe("LLM error");
  });
});
