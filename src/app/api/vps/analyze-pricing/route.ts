// ─── POST /api/vps/analyze-pricing ──────────────────────────────────────────
// Fires off a pricing page analysis in the background, writes progress &
// results to the side-channel stores (shared in-memory maps on globalThis),
// and returns the runId immediately. The client polls
//   GET /api/vps/analyze-progress?runId=xxx
//   GET /api/vps/analyze-screenshot?runId=xxx
//   GET /api/vps/analyze-result?runId=xxx
// to track progress and retrieve the final analyses (or error).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";

import { AnalyzeArtifactUseCase } from "@/application/usecases/AnalyzeArtifactUseCase";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { cancellationManager } from "@/infrastructure/RequestCancellationManager";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";
import { simulationResultStore } from "@/infrastructure/SimulationResultStore";
import { storeProgress, storeCompleted } from "@/actions/getProgress";
import { storeScreenshot } from "@/actions/getScreenshot";

// ── Rate Limiter ────────────────────────────────────────────────────────────

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || "5");
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(
    process.env.AUDIT_RATE_LIMIT_WINDOW_MS || "60000",
);

const auditRateLimiter = new RateLimiterMemory({
    keyPrefix: "audit",
    points: AUDIT_RATE_LIMIT_MAX,
    duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

// ── Constants ───────────────────────────────────────────────────────────────

const rawPersonaTokenLimit = parseInt(
    process.env.PERSONA_TOKEN_LIMIT || "2000",
    10,
);
const PERSONA_TOKEN_LIMIT =
    Number.isFinite(rawPersonaTokenLimit) && rawPersonaTokenLimit > 0
        ? rawPersonaTokenLimit
        : 2000;

// ─────────────────────────────────────────────────────────────────────────────
// POST handler — fire-and-forget, return runId
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const { url, personas, runId: reqId, imageBase64, businessGoal, researchQuestion } = await req.json();
    const id = reqId || `pricing-${Date.now()}`;
    if (personas.length == 0) {
        return NextResponse.json({
            error: "Cannot run pricing page analysis with no selected personas. Please provide a non-zero number of personas to run the analysis with.",
            runId: id
        },
            {
                status: 400
            },
        )
    };
    if (url.length == 0) {
        return NextResponse.json({
            error: "Cannot run pricing page analysis with blank url. Please provide a valid URL.",
            runId: id
        },
            {
                status: 400
            },
        )
    };

    // ── Rate limit ──────────────────────────────────────────────────────────
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

    // ── Kick off background analysis ────────────────────────────────────────
    const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    Promise.race([
        runAnalysis(id, url, personas, imageBase64, businessGoal, researchQuestion),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Analysis timed out after 10 minutes')), ANALYSIS_TIMEOUT_MS)
        ),
    ]).catch((err) => {
        console.error(`[analyze-pricing] Background analysis failed for ${id}:`, err);
        simulationResultStore.saveError(id, err.message);
        storeProgress(id, { step: 'ERROR', error: err.message });
    });

    return NextResponse.json({ runId: id });
}

// ─────────────────────────────────────────────────────────────────────────────
// Background analysis runner — logs, executes use case, stores results
// ─────────────────────────────────────────────────────────────────────────────

async function runAnalysis(
    id: string,
    url: string,
    personas: Persona[],
    imageBase64?: string,
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
            url,
            personaCount: personas.length,
            personaNames: personas.map((p) => p.name),
            hasImage: !!imageBase64,
            requestId: id,
        });

        if (abortSignal.aborted) {
            log.warn("runAnalysis", "Request was already aborted before starting");
            simulationResultStore.saveError(id, "Request was cancelled");
            return;
        }

        log.info("runAnalysis", "Instantiating dependencies...");
        const browserService = RemotePlaywrightAdapter.createFromEnv();
        const llmService = LlmServiceImpl.createFromEnv("openrouter");
        const { ArtifactIntakeAdapter } = await import("@/infrastructure/adapters/ArtifactIntakeAdapter");
        const intakeAdapter = new ArtifactIntakeAdapter(browserService, llmService);
        const useCase = new AnalyzeArtifactUseCase(intakeAdapter, llmService);

        log.info("runAnalysis", "Calling useCase.execute()...");
        const input = imageBase64
            ? { type: "screenshot" as const, imageBase64, url }
            : { type: "url" as const, url };
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
                            completedAnalyses: progress.completedCount,
                            totalAnalyses: personas.length,
                        });
                    }
                }
            },
            abortSignal,
            { tokenLimit: PERSONA_TOKEN_LIMIT, runId: id },
        );

        log.info(
            "runAnalysis",
            `useCase.execute() completed with ${responses.length} responses`,
        );

        if (!abortSignal.aborted) {
            simulationResultStore.save(id, responses);
            storeCompleted(id);
            log.info("runAnalysis", "Results stored — client can now poll");
        } else {
            simulationResultStore.saveError(id, "Request was cancelled");
        }
    } catch (error) {
        if (abortSignal.aborted) {
            simulationResultStore.saveError(id, "Request was cancelled");
        } else {
            const errMsg = (error as Error).message;
            log.error("runAnalysis", "Error analyzing pricing page", {
                error: errMsg,
                url,
            });
            simulationResultStore.saveError(id, errMsg);
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
