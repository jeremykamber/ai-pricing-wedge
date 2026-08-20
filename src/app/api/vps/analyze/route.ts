// ─── POST /api/vps/analyze ───────────────────────────────────────────────────
// Fires off an artifact analysis in the background, writes progress &
// results to the side-channel stores (shared in-memory maps on globalThis),
// and returns the runId immediately. The client polls
//   GET /api/vps/analyze-progress?runId=xxx
//   GET /api/vps/analyze-screenshot?runId=xxx
//   GET /api/vps/analyze-result?runId=xxx
// to track progress and retrieve the final results (or error).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";

import { AnalyzeArtifactUseCase } from "@/application/usecases/AnalyzeArtifactUseCase";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";
import type { ArtifactInput } from "@/infrastructure/adapters/ArtifactIntakeAdapter";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { cancellationManager } from "@/infrastructure/RequestCancellationManager";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";
import { analysisResultStore } from "@/infrastructure/AnalysisResultStore";
import { storeProgress, storeCompleted } from "@/actions/getProgress";

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || "5");
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(
    process.env.AUDIT_RATE_LIMIT_WINDOW_MS || "60000",
);

const auditRateLimiter = new RateLimiterMemory({
    keyPrefix: "audit",
    points: AUDIT_RATE_LIMIT_MAX,
    duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

const rawPersonaTokenLimit = parseInt(
    process.env.PERSONA_TOKEN_LIMIT || "2000",
    10,
);
const PERSONA_TOKEN_LIMIT =
    Number.isFinite(rawPersonaTokenLimit) && rawPersonaTokenLimit > 0
        ? rawPersonaTokenLimit
        : 2000;

export async function POST(req: NextRequest) {
    const { input, personas, runId: reqId, businessGoal, researchQuestion } = await req.json();
    const id = reqId || `analysis-${Date.now()}`;

    if (!personas || personas.length === 0) {
        return NextResponse.json({
            error: "Cannot run analysis with no selected personas.",
            runId: id,
        }, { status: 400 });
    }

    if (!input) {
        return NextResponse.json({
            error: "No artifact input provided. Supply a URL or screenshot.",
            runId: id,
        }, { status: 400 });
    }

    if (input.type === "url" && !input.url?.trim()) {
        return NextResponse.json({
            error: "URL input provided but URL is empty.",
            runId: id,
        }, { status: 400 });
    }

    if (input.type === "screenshot" && !input.imageBase64) {
        return NextResponse.json({
            error: "Screenshot input provided but image data is missing.",
            runId: id,
        }, { status: 400 });
    }

    const clientIP =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";

    try {
        await auditRateLimiter.consume(clientIP);
    } catch (rejRes: any) {
        return NextResponse.json(
            {
                error: `Rate limit exceeded. Try again in ${Math.round(rejRes.msBeforeNext / 1000)} seconds.`,
                runId: id,
            },
            { status: 429 },
        );
    }

    const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000;

    Promise.race([
        runAnalysis(id, input, personas, businessGoal, researchQuestion),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Analysis timed out after 10 minutes')), ANALYSIS_TIMEOUT_MS)
        ),
    ]).catch((err) => {
        console.error(`[analyze] Background analysis failed for ${id}:`, err);
        analysisResultStore.saveError(id, err.message);
        storeProgress(id, { step: 'ERROR', error: err.message });
    });

    return NextResponse.json({ runId: id });
}

async function runAnalysis(
    id: string,
    input: ArtifactInput,
    personas: Persona[],
    businessGoal?: string,
    researchQuestion?: string,
) {
    const startTime = Date.now();
    const log = AnalysisLogger.forRun(id);
    let abortSignal: AbortSignal = new AbortController().signal;

    try {
        await log.init();

        const abortController = cancellationManager.createRequest(id);
        abortSignal = abortController.signal;

        log.info("runAnalysis", "=== ANALYSIS START ===", {
            inputType: input?.type,
            personaCount: personas.length,
            personaNames: personas.map((p) => p.name),
            businessGoal,
            researchQuestion,
            requestId: id,
        });

        if (abortSignal.aborted) {
            log.warn("runAnalysis", "Request was already aborted before starting");
            analysisResultStore.saveError(id, "Request was cancelled");
            return;
        }

        log.info("runAnalysis", "Instantiating dependencies...");
        const browserService = RemotePlaywrightAdapter.createFromEnv();
        const llmService = LlmServiceImpl.createFromEnv("openrouter");
        const { ArtifactIntakeAdapter } = await import("@/infrastructure/adapters/ArtifactIntakeAdapter");
        const intakeAdapter = new ArtifactIntakeAdapter(browserService, llmService);
        const useCase = new AnalyzeArtifactUseCase(intakeAdapter, llmService);

        log.info("runAnalysis", "Calling useCase.execute()...");
        const responses = await useCase.execute(
            input,
            personas,
            businessGoal || "",
            researchQuestion || "",
            (progress) => {
                if (!abortSignal.aborted) {
                    if (progress.step || progress.completedCount !== undefined) {
                        storeProgress(id, {
                            step: progress.step,
                            completedResponses: progress.completedCount,
                            totalResponses: personas.length,
                        });
                    }
                }
            },
            abortSignal,
            { tokenLimit: PERSONA_TOKEN_LIMIT, runId: id },
        );

        log.info("runAnalysis", `useCase.execute() completed with ${responses.length} responses`);

        if (!abortSignal.aborted) {
            analysisResultStore.save(id, responses);
            storeCompleted(id);
            log.info("runAnalysis", "Results stored — client can now poll");
        } else {
            analysisResultStore.saveError(id, "Request was cancelled");
        }
    } catch (error) {
        if (abortSignal.aborted) {
            analysisResultStore.saveError(id, "Request was cancelled");
        } else {
            const errMsg = (error as Error).message;
            log.error("runAnalysis", "Error analyzing artifact", {
                error: errMsg,
            });
            analysisResultStore.saveError(id, errMsg);
            storeProgress(id, { error: errMsg });
        }
    } finally {
        const duration = Date.now() - startTime;
        log.info("runAnalysis", `=== ANALYSIS END (${duration}ms) ===`);
        cancellationManager.clearRequest(id);
        await log.close();
        AnalysisLogger.removeRun(id);
    }
}
