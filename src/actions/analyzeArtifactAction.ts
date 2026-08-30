"use server";
import { createStreamableValue } from "@ai-sdk/rsc";
import { headers } from 'next/headers';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { AnalyzeArtifactUseCase } from "@/application/usecases/AnalyzeArtifactUseCase";
import { ArtifactIntakeAdapter, type ArtifactInput } from "@/infrastructure/adapters/ArtifactIntakeAdapter";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { cancellationManager } from "@/infrastructure/RequestCancellationManager";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";
import { analysisResultStore } from "@/infrastructure/AnalysisResultStore";
import { storeProgress, storeCompleted } from "./getProgress";
import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";
import { SynthesizeArtifactResultsUseCase } from "@/application/usecases/synthesizeArtifactResults";

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '5');
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUDIT_RATE_LIMIT_WINDOW_MS || '60000');

const auditRateLimiter = new RateLimiterMemory({
    keyPrefix: 'audit',
    points: AUDIT_RATE_LIMIT_MAX,
    duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

const rawPersonaTokenLimit = parseInt(process.env.PERSONA_TOKEN_LIMIT || '2000', 10);
const PERSONA_TOKEN_LIMIT = Number.isFinite(rawPersonaTokenLimit) && rawPersonaTokenLimit > 0
    ? rawPersonaTokenLimit
    : 2000;

export async function analyzeArtifactAction(
    input: ArtifactInput,
    personas: Persona[],
    businessGoal: string,
    researchQuestion: string,
    requestId?: string,
) {
    if (shouldRunLocally()) {
        return runLocally(input, personas, businessGoal, researchQuestion, requestId);
    }
    return runRemote(input, personas, businessGoal, researchQuestion, requestId);
}

async function runLocally(
    input: ArtifactInput,
    personas: Persona[],
    businessGoal: string,
    researchQuestion: string,
    requestId?: string,
) {
    const id = requestId || `analysis-${Date.now()}`;
    const actionStartTime = Date.now();

    const log = AnalysisLogger.forRun(id);
    await log.init();
    log.info("analyzeArtifactAction", "=== ACTION START ===", {
        inputType: input.type,
        personaCount: personas.length,
        personaNames: personas.map((p) => p.name),
        businessGoal,
        researchQuestion,
        requestId: id,
    });

    const abortController = cancellationManager.createRequest(id);
    const abortSignal = abortController.signal;
    const stream = createStreamableValue<any>({ step: "STARTING", requestId: id });

    personas.forEach((p, i) => {
        log.info("analyzeArtifactAction", `Persona[${i}]`, {
            id: p.id, name: p.name, occupation: p.occupation,
        });
    });

    // Rate limiting
    let clientIP = 'unknown';
    try {
        const headersList = await headers();
        clientIP = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || 'unknown';
    } catch { /* non-critical */ }

    try {
        await auditRateLimiter.consume(clientIP);
    } catch (rejRes: any) {
        const retryAfter = Math.round((rejRes.msBeforeNext || 60000) / 1000);
        log.warn("analyzeArtifactAction", "Rate limit exceeded", { clientIP, retryAfter });
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`, requestId: id });
        await log.close();
        AnalysisLogger.removeRun(id);
        return { streamData: stream.value, requestId: id };
    }

    (async () => {
        try {
            if (abortSignal.aborted) {
                stream.done({ step: "CANCELLED", requestId: id });
                return;
            }

            log.info("analyzeArtifactAction", "Instantiating dependencies...");
            const browserService = RemotePlaywrightAdapter.createFromEnv();
            const llmService = LlmServiceImpl.createFromEnv("openrouter");
            const intakeAdapter = new ArtifactIntakeAdapter(browserService, llmService);
            const useCase = new AnalyzeArtifactUseCase(intakeAdapter, llmService);

            log.info("analyzeArtifactAction", "Calling useCase.execute()...");

            const responses = await useCase.execute(
                input,
                personas,
                businessGoal,
                researchQuestion,
                (progress) => {
                    if (!abortSignal.aborted) {
                        if (progress.step || progress.completedCount !== undefined) {
                            storeProgress(id, {
                                step: progress.step,
                                completedResponses: progress.completedCount,
                                totalResponses: personas.length,
                                title: progress.title,
                            });
                        }
                        try { stream.update({ ...progress, requestId: id }); } catch {}
                        log.trace("analyzeArtifactAction", "Progress update", {
                            step: progress.step,
                            personaName: progress.personaName,
                            completedCount: progress.completedCount,
                        });
                    }
                },
                abortSignal,
                { tokenLimit: PERSONA_TOKEN_LIMIT, runId: id },
            );

            log.info("analyzeArtifactAction", `useCase.execute() completed with ${responses.length} responses`);

            if (!abortSignal.aborted) {
                // Generate cross-persona synthesis
                let synthesis: ArtifactSynthesis | null = null;
                const completedResponses = responses.filter(r => r.overview && r.customerJourney.length > 0);
                const failedCount = responses.length - completedResponses.length;

                try {
                    if (completedResponses.length === 0) {
                        log.warn("analyzeArtifactAction", "No completed responses — skipping synthesis");
                    } else {
                        synthesis = await new SynthesizeArtifactResultsUseCase(llmService).execute(
                            completedResponses,
                            researchQuestion,
                            { runId: id, failedCount, totalPersonaCount: responses.length },
                        );
                    }
                } catch (synthErr) {
                    log.warn("analyzeArtifactAction", "Synthesis generation failed, proceeding without", {
                        error: String(synthErr),
                    });
                }

                analysisResultStore.save(id, responses);
                storeCompleted(id);
                stream.done({
                    step: "DONE",
                    analyses: responses,
                    synthesis,
                    requestId: id,
                });
            } else {
                analysisResultStore.saveError(id, 'Request was cancelled');
                stream.done({ step: "CANCELLED", requestId: id });
            }
        } catch (error) {
            if (abortSignal.aborted) {
                analysisResultStore.saveError(id, 'Request was cancelled');
                try { stream.done({ step: "CANCELLED", requestId: id }); } catch {}
            } else {
                const errMsg = (error as Error).message;
                log.error("analyzeArtifactAction", "Error analyzing artifact", { error: errMsg });
                analysisResultStore.saveError(id, errMsg);
                storeProgress(id, { error: errMsg });
                try { stream.done({ step: "ERROR", error: errMsg, requestId: id }); } catch {}
            }
        } finally {
            log.info("analyzeArtifactAction", `=== ACTION END (${Date.now() - actionStartTime}ms) ===`);
            cancellationManager.clearRequest(id);
            await log.close();
            AnalysisLogger.removeRun(id);
        }
    })();

    return { streamData: stream.value, requestId: id };
}

async function runRemote(
    input: ArtifactInput,
    personas: Persona[],
    businessGoal: string,
    researchQuestion: string,
    requestId?: string,
) {
    const id = requestId || `analysis-${Date.now()}`;
    const res = await fetch(`${VPS_BACKEND_URL}/api/vps/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getVpsAuthToken()}`,
        },
        body: JSON.stringify({
            input,
            personas,
            businessGoal,
            researchQuestion,
            runId: id,
        }),
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`VPS analysis failed (${res.status}): ${errBody}`);
    }
    const data = await res.json();
    return { streamData: undefined as unknown as ReturnType<typeof createStreamableValue>['value'], requestId: data.runId };
}
