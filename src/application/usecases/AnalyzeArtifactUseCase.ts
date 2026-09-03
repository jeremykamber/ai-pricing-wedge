import type { Persona } from "@/domain/entities/Persona";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import { validatePersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactIntake } from "@/domain/entities/ArtifactIntake";
import { AnalysisProgressStep } from "@/domain/entities/ArtifactAnalysis";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";

import { ArtifactIntakeAdapter, type ArtifactInput, type IntakeProgress } from "@/infrastructure/adapters/ArtifactIntakeAdapter";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

/** @deprecated Use AnalysisProgressStep from @/domain/entities/ArtifactAnalysis instead. */
export type PricingAnalysisProgressStep = AnalysisProgressStep;

export interface AnalysisProgress {
  step: AnalysisProgressStep;
  personaName?: string;
  completedCount?: number;
  totalCount?: number;
  error?: string;
  /** AI-generated simulation title (nice-to-have; may be absent). */
  title?: string;
}

/**
 * Canonical artifact brand name for the models: the hostname with "www."
 * stripped and the TLD dropped ("https://jobright.ai/x" -> "Jobright").
 * Injected into prompts so personas and extraction never misspell the
 * product they're evaluating ("Jobbright" hallucinations). Returns null for
 * screenshot-only inputs — prompts simply omit the brand line then.
 */
export function artifactNameFrom(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : null;
  } catch {
    return null;
  }
}

export class AnalyzeArtifactUseCase {
  constructor(
    private readonly intakeAdapter: ArtifactIntakeAdapter,
    private readonly llmService: LlmServicePort,
  ) {}

  async execute(
    input: ArtifactInput,
    personas: Persona[],
    businessGoal: string,
    researchQuestion: string,
    onProgress?: (progress: AnalysisProgress) => void,
    abortSignal?: AbortSignal,
    options: { tokenLimit?: number; runId?: string } = {},
  ): Promise<PersonaResponse[]> {
    const DEFAULT_TOKEN_LIMIT = 2000;
    const tokenLimit = options.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
    const runId = options.runId || "unknown";
    const log = AnalysisLogger.forRun(runId);
    const overallStartTime = Date.now();

    log.info("AnalyzeArtifactUseCase", "=== USE CASE EXECUTE START ===", {
      inputType: input.type,
      personaCount: personas.length,
      tokenLimit,
      businessGoal,
      researchQuestion,
    });

    // Phase 1: Intake — capture the artifact
    onProgress?.({ step: 'INTAKE' });
    log.info("AnalyzeArtifactUseCase", "Starting artifact intake...");

    let intake: ArtifactIntake;
    try {
      intake = await this.intakeAdapter.intake(
        input,
        (intakeProgress: IntakeProgress) => {
          log.trace("AnalyzeArtifactUseCase", "Intake progress", { intakeProgress });
        },
        runId,
      );
    } catch (err) {
      log.error("AnalyzeArtifactUseCase", "Artifact intake failed", { error: String(err) });
      throw new Error(`Failed to capture artifact: ${(err as Error).message}`);
    }

    log.info("AnalyzeArtifactUseCase", "Intake complete", {
      screenshotLength: intake.screenshotBase64.length,
      hasHtml: !!intake.pageHtml,
      hasSummaryPending: !!intake.summaryPromise,
      url: intake.url,
    });

    if (abortSignal?.aborted) {
      throw new Error("Request cancelled after intake");
    }

    // Phase 2: Persona analysis
    onProgress?.({ step: 'ANALYZING' });
    log.info("AnalyzeArtifactUseCase", `Starting persona analysis for ${personas.length} personas...`);

    // Nice-to-have: an AI-generated title for the simulation. Runs CONCURRENTLY
    // with persona analysis — it only needs the intake capture, it is cosmetic
    // (failure falls back to the heuristic name), and inlining it before the
    // persona phase added a serial LLM round-trip (2-20s) to every run.
    void (async () => {
      try {
        const title = await this.llmService.generateSimulationTitle(
          {
            businessGoal,
            researchQuestion,
            artifactUrl: intake.url,
            pageSummary: intake.summaryPromise ? await intake.summaryPromise : undefined,
            screenshotBase64: intake.screenshotBase64,
          },
          { runId },
        );
        if (title) onProgress?.({ step: 'ANALYZING', title });
        log.info("AnalyzeArtifactUseCase", "Generated simulation title", { title });
      } catch (err) {
        log.warn("AnalyzeArtifactUseCase", "Simulation title generation failed — falling back", {
          error: String(err),
        });
      }
    })();
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(5);

    let finishedCount = 0;
    const totalCount = personas.length;

    const settledResults = await Promise.allSettled(
      personas.map((persona) =>
        limit(async () => {
          const personaStartTime = Date.now();
          const personaLog = `[${persona.name}]`;

          if (abortSignal?.aborted) throw new Error("Request cancelled during persona analysis");

          onProgress?.({
            step: "ANALYZING",
            personaName: persona.name,
            totalCount,
            completedCount: finishedCount,
          });

          log.info("AnalyzeArtifactUseCase", `${personaLog} ENTERING analysis slot`, {
            name: persona.name,
            occupation: persona.occupation,
          });

          try {
            const pipelineStart = Date.now();

            // Stage 1: visceral first-person monologue (screenshot only — no
            // page summary reaches the actor), then Stage 2: third-person
            // extraction from that monologue. businessGoal intentionally does
            // not enter the persona pipeline; identity lives in the persona.
            const streamStart = Date.now();
            const monologue = await this.llmService.generateVisceralMonologue(
              persona,
              intake,
              researchQuestion,
              { tokenLimit, runId, artifactName: artifactNameFrom(intake.url) ?? undefined },
            );
            const streamDuration = Date.now() - streamStart;
            log.info("AnalyzeArtifactUseCase", `${personaLog} Visceral monologue completed`, {
              textLength: monologue.text.length,
              durationMs: streamDuration,
            });

            if (abortSignal?.aborted) throw new Error("Request cancelled during formatting");

            const response = await this.llmService.extractPersonaResponse(
              persona,
              monologue.text,
              researchQuestion,
              { tokenLimit, runId, artifactName: artifactNameFrom(intake.url) ?? undefined },
            );

            const pipelineDuration = Date.now() - pipelineStart;
            const highestStage = response.customerJourney.findLast(s => s.outcome === "succeeded")?.stage || response.customerJourney[0]?.stage;
            log.info("AnalyzeArtifactUseCase", `${personaLog} Pipeline completed`, {
              durationMs: pipelineDuration,
              stagesCount: response.customerJourney.length,
              findingsCount: response.majorFindings.length,
              highestStage,
            });

            if (abortSignal?.aborted) throw new Error("Request cancelled during persona analysis");

            finishedCount++;
            const personaDuration = Date.now() - personaStartTime;
            log.info("AnalyzeArtifactUseCase", `${personaLog} COMPLETED (${finishedCount}/${totalCount})`, {
              durationMs: personaDuration,
            });


            // Assemble full response with metadata
            const fullResponse: PersonaResponse = {
              id: `${persona.name.replace(/[\s-]+/g, "_")}-${Date.now()}`,
              screenshotBase64: intake.screenshotBase64,
              rawAnalysis: monologue.text,
              overview: response.overview,
              customerJourney: response.customerJourney,
              researchQuestionAnswer: response.researchQuestionAnswer,
              majorFindings: response.majorFindings,
              pointsOfFriction: response.pointsOfFriction,
              unansweredQuestions: response.unansweredQuestions,
              personaProfile: {
                name: persona.name,
                occupation: persona.occupation,
                bigFive: {
                  conscientiousness: persona.conscientiousness,
                  neuroticism: persona.neuroticism,
                  openness: persona.openness,
                  extraversion: persona.extraversion,
                  agreeableness: persona.agreeableness,
                },
                values: persona.values ? [...persona.values] : [],
                fears: persona.fears ? [...persona.fears] : [],
                communicationStyle: persona.communicationStyle ?? "",
                decisionStyle: persona.decisionStyle ?? "",
              },
              personaId: persona.id,
            };

            if (!validatePersonaResponse(fullResponse)) {
              log.warn("AnalyzeArtifactUseCase", `${personaLog} Validation failed — normalizing journey outcomes`, {
                hasOverview: !!fullResponse.overview,
                stagesCount: fullResponse.customerJourney.length,
              });
              fullResponse.customerJourney = normalizeJourneyOutcomes(fullResponse.customerJourney);
            }

            return fullResponse;
          } catch (err) {
            const errMsg = (err as Error).message;
            log.error("AnalyzeArtifactUseCase", `${personaLog} Error during analysis`, {
              error: errMsg,
            });

            return {
              id: `${persona.name.replace(/[\s-]+/g, "_")}-${Date.now()}`,
              screenshotBase64: intake.screenshotBase64,
              rawAnalysis: `Analysis failed: ${errMsg}`,
              overview: "Analysis could not be completed.",
              customerJourney: [
                { stage: "interpretation", description: `Analysis failed: ${errMsg}`, sentiment: "negative", outcome: "stopped" },
                { stage: "understanding", description: "Not reached — analysis failed.", sentiment: "negative", outcome: "stopped" },
                { stage: "belief", description: "Not reached — analysis failed.", sentiment: "negative", outcome: "stopped" },
                { stage: "motivation", description: "Not reached — analysis failed.", sentiment: "negative", outcome: "stopped" },
                { stage: "action", description: "Not reached — analysis failed.", sentiment: "negative", outcome: "stopped" },
              ],
              researchQuestionAnswer: "Analysis failed — no answer available.",
              majorFindings: [],
              pointsOfFriction: [errMsg],
              unansweredQuestions: [],
            } as PersonaResponse;
          }
        }),
      ),
    );

    const responses: PersonaResponse[] = [];
    for (let i = 0; i < settledResults.length; i++) {
      const result = settledResults[i];
      if (result.status === "fulfilled") {
        responses.push(result.value);
      } else {
        log.warn("AnalyzeArtifactUseCase", `Persona ${personas[i]?.name ?? i} analysis abandoned`, {
          error: result.reason?.message ?? String(result.reason),
        });
      }
    }

    if (responses.length === 0 && personas.length > 0) {
      log.error("AnalyzeArtifactUseCase", "All persona analyses failed");
      throw new Error("All persona analyses failed");
    }

    const totalDuration = Date.now() - overallStartTime;
    log.info("AnalyzeArtifactUseCase", "=== USE CASE EXECUTE END ===", {
      totalDurationMs: totalDuration,
      responseCount: responses.length,
    });

    return responses;
  }
}

/**
 * Enforces the journey state machine in code: once a stage blocked or
 * stopped the user, every later stage is "not reached" — outcome "stopped",
 * neutral sentiment, and a description naming the abandonment point instead
 * of the model re-describing what the stage would have been about. Stages
 * before the first block are untouched, and a run that reached the end
 * passes through unchanged.
 */
function normalizeJourneyOutcomes(
  journey: PersonaResponse["customerJourney"],
): PersonaResponse["customerJourney"] {
  const blockedIndex = journey.findIndex((s) => s.outcome === "blocked" || s.outcome === "stopped");
  if (blockedIndex === -1 || blockedIndex === journey.length - 1) return journey;
  const abandonAt = journey[blockedIndex].stage;
  return journey.map((stage, i) => {
    if (i <= blockedIndex) return stage;
    return {
      ...stage,
      outcome: "stopped" as const,
      sentiment: "neutral" as const,
      description: `Not reached — abandoned at ${abandonAt}.`,
    };
  });
}
