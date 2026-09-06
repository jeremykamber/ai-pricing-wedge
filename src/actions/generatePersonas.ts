"use server";

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

import { createStreamableValue } from "@ai-sdk/rsc";

import { shouldRunLocally } from "@/infrastructure/config";
import { storeProgress, storeCompleted } from "@/actions/getProgress";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";
import type { PersonaGenerationMode } from "@/domain/entities/PersonaProvenance";
import { createRateLimiter, checkRateLimit } from "./rateLimiter";
import { vpsPost } from "./vpsClient";

const personasRateLimiter = createRateLimiter('personas');

function generateRunId(): string {
  return `persona-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function runLocally(personaDescription: string, count: number, mode?: PersonaGenerationMode) {
    const runId = generateRunId();
    console.log(`generatePersonasAction called [runId=${runId}] mode=${mode ?? "default"}...`);
    const stream = createStreamableValue<any>({ step: "BRAINSTORMING_PERSONAS" });

    const rateLimit = await checkRateLimit(personasRateLimiter);
    if (!rateLimit.allowed) {
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${rateLimit.retryAfterSeconds} seconds.` });
        return { streamData: stream.value, runId };
    }

    // Initial progress
    await storeProgress(runId, { step: "BRAINSTORMING_PERSONAS" });

    (async () => {
        try {
            const llmService = LlmServiceImpl.createFromEnv("openrouter");
            const useCase = new GeneratePersonasUseCase(llmService);

            const personas = await useCase.execute(personaDescription, (progress) => {
                try { stream.update(progress); } catch {}
                // Write to progressMap for polling consumers (toast)
                storeProgress(runId, {
                    step: progress.step,
                    streamingText: progress.streamingText,
                    personaName: progress.personaName,
                    completedCount: progress.completedCount,
                    totalCount: progress.totalCount,
                });
            }, count, undefined, mode);

            const finalPersonas = JSON.parse(JSON.stringify(personas));
            stream.done({ step: "DONE", personas: finalPersonas });
            // Store final results for polling consumers
            personaGenerationStore.save(runId, finalPersonas);
            await storeCompleted(runId);
        } catch (error) {
            console.error("Error generating personas:", error);
            const msg = (error as Error).message;
            try { stream.done({ step: "ERROR", error: msg }); } catch {}
            personaGenerationStore.saveError(runId, msg);
            await storeCompleted(runId, msg);
        }
    })();

    return { streamData: stream.value, runId };
}

async function runRemote(personaDescription: string, count: number, mode?: PersonaGenerationMode) {
    const data = await vpsPost<{ runId: string }>("generate-personas", { personaDescription, count, mode });
    return { streamData: undefined as unknown as ReturnType<typeof createStreamableValue>['value'], runId: data.runId };
}

export async function generatePersonasAction(
    personaDescription: string,
    count: number = 5,
    mode?: PersonaGenerationMode,
) {
    if (shouldRunLocally()) return runLocally(personaDescription, count, mode);
    return runRemote(personaDescription, count, mode);
}
