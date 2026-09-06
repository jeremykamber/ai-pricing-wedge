"use server";

import type { Persona } from "@/domain/entities/Persona";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";
import { shouldRunLocally } from "@/infrastructure/config";
import { vpsGet } from "./vpsClient";

export interface PersonaGenerationResult {
  found: boolean;
  personas?: Persona[];
  error?: string;
  completedAt?: string;
}

export async function getPersonaGenerationResultAction(runId: string): Promise<PersonaGenerationResult> {
  if (shouldRunLocally()) {
    const result = personaGenerationStore.get(runId);
    if (!result) {
      console.log(`[PERSONA_RESULT_POLL] ${runId}: NOT FOUND`);
      return { found: false };
    }
    console.log(`[PERSONA_RESULT_POLL] ${runId}: FOUND personas=${result.personas.length}, error=${result.error ?? "none"}, completedAt=${result.completedAt}`);
    return {
      found: true,
      personas: result.personas,
      error: result.error,
      completedAt: result.completedAt,
    };
  }

  try {
    return await vpsGet("persona-result", { runId });
  } catch {
    console.error(`[PERSONA_RESULT_POLL] VPS returned error for ${runId}`);
    return { found: false };
  }
}
