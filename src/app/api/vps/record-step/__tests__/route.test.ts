import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  mockSession,
  mockInteractionStep,
} from "../../__tests__/test-utils";

const mockRecordStepExecute = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/adapters/LlmMemoryAdapter", () => {
  const MockAdapter = class {
    remember = vi.fn();
    recall = vi.fn();
    static createFromEnv = vi.fn(() => new MockAdapter());
  };
  return { LlmMemoryAdapter: MockAdapter };
});

vi.mock("@/application/usecases/RecordStepUseCase", () => ({
  RecordStepUseCase: class {
    execute = mockRecordStepExecute;
  },
}));

describe("POST /api/vps/record-step", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records step and returns updated session", async () => {
    const updatedSession = { ...mockSession, steps: [mockInteractionStep] };
    mockRecordStepExecute.mockResolvedValue(updatedSession);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/record-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: mockSession, step: mockInteractionStep }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.session).toEqual(updatedSession);
  });

  it("returns 500 when use case throws", async () => {
    mockRecordStepExecute.mockRejectedValueOnce(new Error("Record failed"));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/record-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: mockSession, step: mockInteractionStep }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });
});
