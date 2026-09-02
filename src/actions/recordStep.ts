"use server";

import { RecordStepUseCase } from "@/application/usecases/RecordStepUseCase";
import { LlmMemoryAdapter } from "@/infrastructure/adapters/LlmMemoryAdapter";
import { TestingSession } from "@/domain/entities/TestingSession";
import { InteractionStep } from "@/domain/entities/InteractionStep";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

async function runLocally(
  session: TestingSession,
  step: InteractionStep
): Promise<{ success: true; session: TestingSession } | { success: false; error: string }> {
  const memoryAdapter = LlmMemoryAdapter.createFromEnv();
  const useCase = new RecordStepUseCase(memoryAdapter);
  const updatedSession = await useCase.execute(session, step);
  return { success: true, session: updatedSession };
}

async function runRemote(
  session: TestingSession,
  step: InteractionStep
): Promise<{ success: true; session: TestingSession } | { success: false; error: string }> {
  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/record-step`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getVpsAuthToken()}`,
    },
    body: JSON.stringify({ session, step }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { success: false, error: err.error || `HTTP ${res.status}` };
  }
  return res.json();
}

/**
 * Server action to record a new interaction step in a testing session.
 * Uses local execution in development, VPS remote in production.
 */
export async function recordStepAction(
  session: TestingSession,
  step: InteractionStep
): Promise<{ success: true; session: TestingSession } | { success: false; error: string }> {
  try {
    if (shouldRunLocally()) return runLocally(session, step);
    return runRemote(session, step);
  } catch (error) {
    console.error("Error in recordStepAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred while recording the step.",
    };
  }
}
