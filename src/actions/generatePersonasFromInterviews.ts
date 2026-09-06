"use server";

import { GeneratePersonasFromInterviewsUseCase } from "@/application/usecases/GeneratePersonasFromInterviewsUseCase";
import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { IdRagStore } from "@/infrastructure/adapters/IdRagStore";

import { createStreamableValue } from "@ai-sdk/rsc";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";
import { storeProgress, storeCompleted } from "@/actions/getProgress";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";
import { createRateLimiter, checkRateLimit } from "./rateLimiter";

const pipelineRateLimiter = createRateLimiter('pipeline');

function generateRunId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function runLocally(formData: FormData) {
    const runId = generateRunId('pipeline');
    console.log(`generatePersonasFromInterviewsAction called [runId=${runId}]...`);
    const stream = createStreamableValue<any>({ step: "UPLOADING" });

    const rateLimit = await checkRateLimit(pipelineRateLimiter);
    if (!rateLimit.allowed) {
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${rateLimit.retryAfterSeconds} seconds.` });
        return { streamData: stream.value, runId };
    }

    await storeProgress(runId, { step: "UPLOADING" });

    const files: { filename: string; content: string }[] = [];
    let personaCount = 5;
    let generationMode: 'individual' | 'synthesized' = 'individual';
    for (const [key, value] of formData.entries()) {
        if (value instanceof File && (key === "files" || key.startsWith("file_"))) {
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
        stream.done({ step: "ERROR", error: "No transcript files provided. Please upload at least one interview transcript." });
        return { streamData: stream.value, runId };
    }

    (async () => {
        try {
            const llmService = LlmServiceImpl.createFromEnv("openrouter");
            const idRagStore = new IdRagStore();
            const generatePersonasUseCase = new GeneratePersonasUseCase(llmService);
            const useCase = new GeneratePersonasFromInterviewsUseCase(
                llmService,
                idRagStore,
                generatePersonasUseCase,
            );

            const personas = await useCase.execute(files, (progress) => {
                stream.update(progress);
                storeProgress(runId, {
                    step: progress.step,
                    streamingText: progress.message,
                    completedCount: progress.current,
                    totalCount: progress.total,
                });
            }, personaCount, generationMode);

            const finalPersonas = JSON.parse(JSON.stringify(personas));
            stream.done({ step: "DONE", personas: finalPersonas });
            personaGenerationStore.save(runId, finalPersonas);
            await storeCompleted(runId);
        } catch (error) {
            console.error("Error generating personas from interviews:", error);
            const msg = (error as Error).message;
            stream.done({ step: "ERROR", error: msg });
            personaGenerationStore.saveError(runId, msg);
            await storeCompleted(runId, msg);
        }
    })();

    return { streamData: stream.value, runId };
}

// FormData can't go through vpsPost (JSON-only); uses raw fetch with auth headers.
async function runRemote(formData: FormData) {
    const res = await fetch(`${VPS_BACKEND_URL}/api/vps/generate-personas-from-interviews`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getVpsAuthToken()}`,
        },
        body: formData,
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`VPS persona generation failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    return { streamData: undefined as unknown as ReturnType<typeof createStreamableValue>['value'], runId: data.runId as string };
}

export async function generatePersonasFromInterviewsAction(formData: FormData) {
    if (shouldRunLocally()) return runLocally(formData);
    return runRemote(formData);
}
