"use server";

import type { Persona } from "@/domain/entities/Persona";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

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

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/persona-result?runId=${runId}`, {
    headers: { Authorization: `Bearer ${getVpsAuthToken()}` },
  });
  if (!res.ok) {
    console.error(`[PERSONA_RESULT_POLL] VPS returned ${res.status} for ${runId}`);
    return { found: false };
  }
  return res.json();
}
