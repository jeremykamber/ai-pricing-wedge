import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// The ICP flow (usePersonaFlow) must always generate strategy-mode personas.
const mockGeneratePersonasAction = vi.hoisted(() => vi.fn());

vi.mock("@/actions/generatePersonas", () => ({
  generatePersonasAction: mockGeneratePersonasAction,
}));
vi.mock("@/actions/getPersonaGenerationResult", () => ({
  getPersonaGenerationResultAction: vi.fn(),
}));
vi.mock("@/actions/getProgress", () => ({
  getProgressAction: vi.fn(),
}));
vi.mock("@ai-sdk/rsc", () => ({
  readStreamableValue: (v: unknown) => v,
}));
vi.mock("@/lib/generationRunState", () => ({
  batchConsumedRunIds: new Set(),
}));
vi.mock("@/ui/stores/personaStore", () => ({
  usePersonaStore: {
    getState: () => ({ addBatch: vi.fn(), addActiveGeneration: vi.fn() }),
  },
}));

import { usePersonaFlow } from "../usePersonaFlow";

describe("usePersonaFlow (ICP screen)", () => {
  beforeEach(() => mockGeneratePersonasAction.mockReset());

  it("generates personas in strategy mode", async () => {
    // Fire-and-forget path: no stream, no runId — the hook just records the call.
    mockGeneratePersonasAction.mockResolvedValue({
      streamData: undefined,
      runId: undefined,
    });

    const { result } = renderHook(() => usePersonaFlow());

    // setCustomerProfile triggers a re-render; handleGeneratePersonas is a
    // useCallback that closes over customerProfile, so grab it after the update.
    await act(async () => {
      result.current.setCustomerProfile("B2B SaaS founders");
    });

    await act(async () => {
      result.current.handleGeneratePersonas();
      await Promise.resolve();
    });

    expect(mockGeneratePersonasAction).toHaveBeenCalledWith(
      "B2B SaaS founders",
      5,
      "strategy",
    );
  });
});
