"use server";

import { simulationResultStore } from "@/infrastructure/SimulationResultStore";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

export async function getSimulationResultAction(runId: string): Promise<{
  found: boolean;
  analyses?: import('@/domain/entities/PersonaResponse').PersonaResponse[];
  error?: string;
  completedAt?: string;
}> {
  if (shouldRunLocally()) {
    const result = simulationResultStore.get(runId);
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
    };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/analyze-result?runId=${runId}`, {
    headers: { Authorization: `Bearer ${getVpsAuthToken()}` },
  });
  if (!res.ok) {
    console.error(`[RESULT_POLL] VPS returned ${res.status} for ${runId}`);
    return { found: false };
  }
  return res.json();
}
