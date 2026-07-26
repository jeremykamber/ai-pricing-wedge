import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort } from "../../domain/ports/LlmServicePort";

export type PersonaGenerationProgressStep =
    | 'BRAINSTORMING_PERSONAS'
    | 'GENERATING_BACKSTORIES'
    | 'ADDING_BEHAVIORAL_DEPTH'
    | 'DONE'
    | 'ERROR';

export interface PersonaGenerationProgress {
    step: PersonaGenerationProgressStep;
    personaName?: string;
    completedCount?: number;
    totalCount?: number;
    completedSubSteps?: number;
    totalSubSteps?: number;
    error?: string;
    personas?: Persona[];
    streamingText?: string; // For live UI feedback
}

import type { PersonaGenerationMode } from "@/domain/entities/PersonaProvenance";

export class GeneratePersonasUseCase {
    private static readonly ABBREVIATE_BACKSTORIES = true;

    constructor(private llmService: LlmServicePort) { }

    async execute(
        personaDescription: string,
        onProgress?: (progress: PersonaGenerationProgress) => void,
        count?: number,
        contextNotes?: string,
        mode?: PersonaGenerationMode,
    ): Promise<Persona[]> {
        console.log(`[GeneratePersonasUseCase] Executing in ${mode ?? "strategy (default)"} mode`);

        onProgress?.({
            step: 'BRAINSTORMING_PERSONAS',
            streamingText: "Generating persona profiles..."
        });

        let personas: Persona[];
        const targetCount = count ?? 3;

        if (mode === 'research') {
            personas = await this.llmService.generateResearchPersonas({
                count: targetCount,
                personaDescription,
                contextNotes,
            });
            return personas;
        }

        if (mode === 'strategy') {
            personas = await this.llmService.generateStrategyPersonas({
                count: targetCount,
                personaDescription,
                contextNotes,
                allowSyntheticBackstory: true,
                storytellingLevel: 'moderate',
            });
            return personas;
        }

        if (mode === 'cluster') {
            throw new Error("Cluster mode requires interview IDs. Use GeneratePersonasFromInterviewsUseCase instead.");
        }

        // Default (undefined mode): legacy pipeline for backward compatibility
        // Retry once on count mismatch
        let initialPersonas: Persona[] | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                initialPersonas = await this.llmService.generateInitialPersonas(personaDescription, targetCount);
                break;
            } catch (err) {
                const msg = (err as Error).message ?? '';
                if (msg.includes('count mismatch') && attempt === 0) {
                    console.warn(`[GeneratePersonasUseCase] Attempt ${attempt + 1} failed: ${msg} — retrying`);
                    onProgress?.({
                        step: 'BRAINSTORMING_PERSONAS',
                        streamingText: "Retrying with corrected persona count..."
                    });
                    continue;
                }
                throw err;
            }
        }
        if (!initialPersonas || initialPersonas.length === 0) {
            throw new Error("Failed to generate any personas from the description");
        }
        personas = initialPersonas;

        // Legacy pipeline: add backstories + PB&J rationalization
        console.log(`[GeneratePersonasUseCase] Generated ${personas.length} personas`);

        const abbreviate = GeneratePersonasUseCase.ABBREVIATE_BACKSTORIES;
        const subStepsPerPersona = abbreviate ? 1 : 4;

        onProgress?.({
            step: 'GENERATING_BACKSTORIES',
            personaName: personas[0]?.name,
            personas,
            totalCount: personas.length,
            completedCount: 0,
            totalSubSteps: personas.length * subStepsPerPersona,
            completedSubSteps: 0,
            streamingText: `Building stories for ${personas.length} personas...`
        });

        const totalCount = personas.length;
        const totalSubSteps = totalCount * subStepsPerPersona;

        console.log("[GeneratePersonasUseCase] Generating batch backstories...");
        onProgress?.({
            step: 'GENERATING_BACKSTORIES',
            personaName: personas[0]?.name,
            personas,
            totalCount,
            completedCount: 0,
            totalSubSteps,
            completedSubSteps: 0,
            streamingText: `Phase 2 of 3: Building stories...`,
        });

        const backstoryTexts = await this.llmService.generateAbbreviatedBackstoriesBatch(personas);
        personas.forEach((persona, i) => {
            persona.backstory = backstoryTexts[i];
        });
        
        onProgress?.({
            step: 'GENERATING_BACKSTORIES',
            completedCount: totalCount,
            totalCount,
            completedSubSteps: totalSubSteps,
            totalSubSteps,
            personas: JSON.parse(JSON.stringify(personas))
        });

        console.log("[GeneratePersonasUseCase] Enhancing personas with PB&J psychological rationales...");
        onProgress?.({
            step: 'ADDING_BEHAVIORAL_DEPTH',
            personaName: personas[0]?.name,
            personas: JSON.parse(JSON.stringify(personas)),
            totalCount,
            completedCount: 0,
            streamingText: `Phase 3 of 3: Connecting traits to behavior...`,
        });

        personas = await this.llmService.rationalizePersonas(personas, contextNotes);
        console.log("[GeneratePersonasUseCase] PB&J enhancement complete for all personas");

        return personas;
    }
}

