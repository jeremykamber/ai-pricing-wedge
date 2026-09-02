// ─── POST /api/vps/record-step ──────────────────────────────────────────────
// Records a new InteractionStep in a TestingSession. Returns the updated
// session with the step appended. Used to capture user interactions during
// a persona-based testing session.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { RecordStepUseCase } from "@/application/usecases/RecordStepUseCase";
import { LlmMemoryAdapter } from "@/infrastructure/adapters/LlmMemoryAdapter";
import { TestingSession } from "@/domain/entities/TestingSession";
import { InteractionStep } from "@/domain/entities/InteractionStep";

export async function POST(req: NextRequest) {
  const { session, step } = await req.json();

  try {
    const memoryAdapter = LlmMemoryAdapter.createFromEnv();
    const useCase = new RecordStepUseCase(memoryAdapter);
    const updatedSession = await useCase.execute(
      session as TestingSession,
      step as InteractionStep,
    );

    return NextResponse.json({ success: true, session: updatedSession });
  } catch (error) {
    console.error("Error in record-step:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown error occurred while recording the step.",
      },
      { status: 500 },
    );
  }
}
