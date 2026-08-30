import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";

/**
 * Synthesis placeholder for analyses saved before server-side synthesis
 * existed (their ArtifactAnalysis carries no synthesis). Computes only the
 * caller-known counts; all LLM-produced content stays empty rather than
 * being faked from per-persona digests. Sections render as hidden when
 * empty, so such analyses show the completion header only.
 */
export function fallbackSynthesis(responses: PersonaResponse[]): ArtifactSynthesis {
  return {
    overview: "",
    researchQuestionAnswer: "",
    topFindings: [],
    disagreements: [],
    biggestFrictions: [],
    completedCount: responses.length,
    failedCount: 0,
    totalPersonaCount: responses.length,
  };
}
