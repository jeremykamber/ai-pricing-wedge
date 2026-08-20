// ─── POST /api/vps/generate-personas-from-interviews ────────────────────────
// Accepts interview transcript files (multipart/form-data), kicks off background
// persona generation, and returns a runId immediately. The client polls
//   GET /api/vps/analyze-progress?runId=pi-<timestamp>
//   GET /api/vps/persona-result?runId=pi-<timestamp>
// to track progress and retrieve the final personas (or error).
// Rate-limited per client IP.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { GeneratePersonasFromInterviewsUseCase } from "@/application/usecases/GeneratePersonasFromInterviewsUseCase";
import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { IdRagStore } from "@/infrastructure/adapters/IdRagStore";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";
import { storeProgress, storeCompleted } from "@/actions/getProgress";

// ── Rate Limiter ────────────────────────────────────────────────────────────

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || "5");
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(
    process.env.AUDIT_RATE_LIMIT_WINDOW_MS || "60000",
);

const pipelineRateLimiter = new RateLimiterMemory({
    keyPrefix: "pipeline",
    points: AUDIT_RATE_LIMIT_MAX,
    duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    // ── Rate limit ──────────────────────────────────────────────────────────
    const clientIP =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";

    try {
        await pipelineRateLimiter.consume(clientIP);
    } catch (rejRes: any) {
        return NextResponse.json(
            {
                error: `Rate limit exceeded. Try again in ${Math.round(rejRes.msBeforeNext / 1000)} seconds.`,
            },
            { status: 429 },
        );
    }

    // ── Parse multipart form data ───────────────────────────────────────────
    const formData = await req.formData();
    const files: { filename: string; content: string }[] = [];
    let personaCount = 5;
    let generationMode: 'individual' | 'synthesized' = 'individual';

    for (const [key, value] of formData.entries()) {
        if (
            value instanceof File &&
            (key === "files" || key.startsWith("file_"))
        ) {
            const content = await value.text();
            files.push({ filename: value.name, content });
        } else if (key === "count" && typeof value === "string") {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 1 && parsed <= 20) personaCount = parsed;
        } else if (key === "mode" && typeof value === "string") {
            if (value === 'individual' || value === 'synthesized') generationMode = value;
        }
    }

    if (files.length === 0) {
        return NextResponse.json(
            {
                error:
                    "No transcript files provided. Please upload at least one interview transcript.",
            },
            { status: 400 },
        );
    }

    // ── Generate runId and kick off background processing ───────────────────
    const runId = `pi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    runPipeline(runId, files, personaCount, generationMode).catch((err) => {
        console.error(`[generate-personas-from-interviews] Background pipeline failed for ${runId}:`, err);
    });

    return NextResponse.json({ runId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Background pipeline runner
// ─────────────────────────────────────────────────────────────────────────────

async function runPipeline(
    runId: string,
    files: { filename: string; content: string }[],
    count: number,
    generationMode: 'individual' | 'synthesized',
) {
    try {
        storeProgress(runId, { step: "PARSING_FILES" });

        const llmService = LlmServiceImpl.createFromEnv("openrouter");
        const idRagStore = new IdRagStore();
        const generatePersonasUseCase = new GeneratePersonasUseCase(llmService);
        const useCase = new GeneratePersonasFromInterviewsUseCase(
            llmService,
            idRagStore,
            generatePersonasUseCase,
        );

        const personas = await useCase.execute(files, (progress) => {
            if (progress.step === 'DONE') return;
            storeProgress(runId, {
                step: progress.step,
                streamingText: progress.message,
                completedCount: progress.current,
                totalCount: progress.total,
                completedResponses: progress.current,
                totalResponses: progress.total,
            });
        }, count, generationMode);

        const serialized = JSON.parse(JSON.stringify(personas));
        personaGenerationStore.save(runId, serialized);
        storeCompleted(runId);
        console.log(`[generate-personas-from-interviews] Completed ${runId} with ${personas.length} personas`);
    } catch (error) {
        console.error("[generate-personas-from-interviews] Failed:", error);
        const errMsg = (error as Error).message;
        personaGenerationStore.saveError(runId, errMsg);
        storeCompleted(runId, errMsg);
    }
}
