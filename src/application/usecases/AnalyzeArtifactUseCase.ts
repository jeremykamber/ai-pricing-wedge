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
      hasSummary: !!intake.summary,
      url: intake.url,
    });

    if (abortSignal?.aborted) {
      throw new Error("Request cancelled after intake");
    }

    // Phase 2: Persona analysis
    onProgress?.({ step: 'ANALYZING' });
    log.info("AnalyzeArtifactUseCase", `Starting persona analysis for ${personas.length} personas...`);

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

            // Stage 1: Generate cognitive stream through 5 stages
            const streamStart = Date.now();
            const stream = await this.llmService.generateCognitiveStream(
              persona,
              intake,
              businessGoal,
              researchQuestion,
              { tokenLimit, runId },
            );
            const streamDuration = Date.now() - streamStart;
            log.info("AnalyzeArtifactUseCase", `${personaLog} Cognitive stream completed`, {
              textLength: stream.text.length,
              durationMs: streamDuration,
            });

            if (abortSignal?.aborted) throw new Error("Request cancelled during formatting");

            // Stage 2a + 2b: Format response and derive signals in parallel
            const [response, signals] = await Promise.all([
              this.llmService.formatPersonaResponse(
                persona,
                stream,
                businessGoal,
                researchQuestion,
                { tokenLimit, runId },
              ),
              this.llmService.deriveResponseSignals(
                persona,
                stream,
                { runId },
              ),
            ]);

            const pipelineDuration = Date.now() - pipelineStart;
            log.info("AnalyzeArtifactUseCase", `${personaLog} Pipeline completed`, {
              durationMs: pipelineDuration,
              stagesCount: response.customerJourney.length,
              findingsCount: response.majorFindings.length,
              highestStage: signals.highestStageReached,
            });

            if (abortSignal?.aborted) throw new Error("Request cancelled during persona analysis");

            finishedCount++;
            const personaDuration = Date.now() - personaStartTime;
            log.info("AnalyzeArtifactUseCase", `${personaLog} COMPLETED (${finishedCount}/${totalCount})`, {
              durationMs: personaDuration,
            });

            onProgress?.({
              step: "ANALYZING",
              personaName: persona.name,
              totalCount,
              completedCount: finishedCount,
            });

            // Assemble full response with metadata
            const fullResponse: PersonaResponse = {
              id: `${persona.name.replace(/[\s-]+/g, "_")}-${Date.now()}`,
              screenshotBase64: intake.screenshotBase64,
              rawAnalysis: stream.text,
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
              log.warn("AnalyzeArtifactUseCase", `${personaLog} Validation failed — response may have missing fields`, {
                hasOverview: !!fullResponse.overview,
                stagesCount: fullResponse.customerJourney.length,
              });
            }

            return fullResponse;
          } catch (err) {
            log.error("AnalyzeArtifactUseCase", `${personaLog} Error during analysis`, {
              error: String(err),
            });

            return {
              id: `${persona.name.replace(/[\s-]+/g, "_")}-${Date.now()}`,
              screenshotBase64: intake.screenshotBase64,
              rawAnalysis: "Analysis failed due to an error.",
              overview: "Analysis could not be completed.",
              customerJourney: [],
              researchQuestionAnswer: "Analysis failed — no answer available.",
              majorFindings: [],
              pointsOfFriction: ["System error during analysis."],
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
