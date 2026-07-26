"use server";

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

import { createStreamableValue } from "@ai-sdk/rsc";
import { headers } from 'next/headers';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '5');
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUDIT_RATE_LIMIT_WINDOW_MS || '60000');

const personasRateLimiter = new RateLimiterMemory({
  keyPrefix: 'personas',
  points: AUDIT_RATE_LIMIT_MAX,
  duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";
import { storeProgress, storeCompleted } from "@/actions/getProgress";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";

function generateRunId(): string {
  return `persona-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function runLocally(personaDescription: string, count: number) {
    const runId = generateRunId();
    console.log(`generatePersonasAction called [runId=${runId}]...`);
    const stream = createStreamableValue<any>({ step: "BRAINSTORMING_PERSONAS" });

    let clientIP = 'unknown';
    try {
        const headersList = await headers();
        clientIP = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || 'unknown';
    } catch { }

    try {
        await personasRateLimiter.consume(clientIP);
    } catch (rejRes: any) {
        const msBeforeNext = rejRes.msBeforeNext;
        const retryAfter = Math.round(msBeforeNext / 1000);
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` });
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
            }, count);

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

async function runRemote(personaDescription: string, count: number) {
    const res = await fetch(`${VPS_BACKEND_URL}/api/vps/generate-personas`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getVpsAuthToken()}`,
        },
        body: JSON.stringify({ personaDescription, count }),
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`VPS persona generation failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    return { streamData: undefined as unknown as ReturnType<typeof createStreamableValue>['value'], runId: data.runId as string };
}

export async function generatePersonasAction(personaDescription: string, count: number = 5) {
    if (shouldRunLocally()) return runLocally(personaDescription, count);
    return runRemote(personaDescription, count);
}
