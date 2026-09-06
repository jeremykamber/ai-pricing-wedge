import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { groundSynthesisCitations } from "@/application/synthesis/citations";

/**
 * Cross-persona cohort synthesis over RAW monologue transcripts.
 *
 * Raw monologues are the source of truth: no persona summaries, no digests.
 * One structured LLM call produces the synthesis; citation grounding is pure
 * code (citations.ts) — a quote reaches the user only if it is a verbatim
 * substring of that persona's transcript. The LLM never fabricates counts
 * (completed/failed/total come from the caller's own observations) and never
 * fabricates quotes (misses are dropped, not padded).
 */
export class SynthesizeArtifactResultsUseCase {
  constructor(private readonly llmService: LlmServicePort) {}

  async execute(
    completedResponses: PersonaResponse[],
    researchQuestion: string,
    options?: { runId?: string; failedCount?: number; totalPersonaCount?: number },
  ): Promise<ArtifactSynthesis> {
    const transcripts = completedResponses.map((r) => ({
      personaId: r.personaId ?? r.id,
      personaName: r.personaProfile?.name ?? "Unnamed persona",
      transcript: r.rawAnalysis,
    }));

    const content = await this.llmService.generateCohortSynthesis(
      researchQuestion,
      transcripts,
      options,
    );

    const groundedFindings = groundSynthesisCitations(
      content.topFindings,
      transcripts,
    );

    return {
      overview: content.overview,
      researchQuestionAnswer: content.researchQuestionAnswer,
      topFindings: groundedFindings,
      disagreements: content.disagreements,
      biggestFrictions: content.biggestFrictions,
      // Caller-computed facts, not LLM output: the action ran the analysis and
      // knows how many personas completed, failed, and were attempted.
      completedCount: completedResponses.length,
      failedCount: options?.failedCount ?? 0,
      totalPersonaCount: options?.totalPersonaCount ?? completedResponses.length,
    };
  }
}
