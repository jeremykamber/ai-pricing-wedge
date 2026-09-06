"use server";

import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import { analysisResultStore } from "@/infrastructure/AnalysisResultStore";
import { shouldRunLocally } from "@/infrastructure/config";
import { vpsGet } from "./vpsClient";

export async function getAnalysisResultAction(runId: string): Promise<{
  found: boolean;
  analyses?: PersonaResponse[];
  error?: string;
  completedAt?: string;
  synthesis?: ArtifactSynthesis | null;
}> {
  if (shouldRunLocally()) {
    const result = analysisResultStore.get(runId);
    if (!result) {
      console.log(`[RESULT_POLL] ${runId}: NOT FOUND`);
      return { found: false };
    }
    console.log(`[RESULT_POLL] ${runId}: FOUND analyses=${result.analyses.length}, error=${result.error ?? 'none'}, completedAt=${result.completedAt}`);
    return {
      found: true,
      analyses: result.analyses,
      error: result.error,
      completedAt: result.completedAt,
      synthesis: result.synthesis ?? null,
    };
  }

  try {
    return await vpsGet("analyze-result", { runId });
  } catch {
    console.error(`[RESULT_POLL] VPS returned error for ${runId}`);
    return { found: false };
  }
}
