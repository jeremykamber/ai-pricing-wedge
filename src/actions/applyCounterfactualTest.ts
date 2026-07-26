"use server";

import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

import { shouldRunLocally } from "@/infrastructure/config";

export async function applyCounterfactualTestAction(
    persona: Persona,
): Promise<{ detail: string; reason: string; attribute?: string }[]> {
    if (!shouldRunLocally()) {
        console.warn("[applyCounterfactualTestAction] Remote mode not supported yet");
        return [];
    }

    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    return llmService.applyCounterfactualTest(persona);
}
