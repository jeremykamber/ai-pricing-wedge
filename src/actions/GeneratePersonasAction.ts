"use server";

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { OpenRouterAdapter } from "@/infrastructure/adapters/OpenRouterAdapter";

export async function generatePersonasAction(personaDescription: string) {
    console.log("generatePersonasAction called...");
    const llmService = OpenRouterAdapter.createFromEnv();
    const useCase = new GeneratePersonasUseCase(llmService);
    const personas = await useCase.execute(personaDescription);
    return personas;
}
