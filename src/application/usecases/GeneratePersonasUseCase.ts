import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort, PersonaPhase, PersonaPhaseProgress } from "../../domain/ports/LlmServicePort";

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

        if (mode === 'research' || mode === 'strategy') {
            // Phased modes: the adapter reports generation phases; forward the
            // backstories phase onto the existing progress steps so the UI shows
            // per-persona ticks. The profiles phase is already announced above.
            const onPhase = (phase: PersonaPhase, progress?: PersonaPhaseProgress) => {
                if (phase === 'backstories' && progress) {
                    onProgress?.({
                        step: 'GENERATING_BACKSTORIES',
                        personaName: progress.personaName,
                        completedCount: progress.completed,
                        totalCount: progress.total,
                        streamingText: progress.completed === 0
                            ? `Building stories for ${progress.total} personas...`
                            : undefined,
                    });
                }
            };

            personas = mode === 'research'
                ? await this.llmService.generateResearchPersonas({ count: targetCount, personaDescription, contextNotes }, onPhase)
                : await this.llmService.generateStrategyPersonas(
                    { count: targetCount, personaDescription, contextNotes, allowSyntheticBackstory: true, storytellingLevel: 'moderate' },
                    onPhase,
                  );

            // PB&J rationalization for both modes; stored in pbjRationales so
            // the backstory stays clean. Failure degrades gracefully.
            await this.extractPbjRationales(personas, contextNotes);
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

        const backstoriesBeforePbj = personas.map(p => p.backstory ?? '');
        personas = await this.llmService.rationalizePersonas(personas, contextNotes);
        for (let i = 0; i < personas.length; i++) {
            const enhanced = personas[i]?.backstory ?? backstoriesBeforePbj[i];
            const pbjMatch = enhanced.match(/<<PSYCHOLOGICAL RATIONALES \(PB&J\)>>[\s\S]*$/);
            if (pbjMatch && personas[i]) {
                personas[i].pbjRationales = pbjMatch[0].trim();
                personas[i].backstory = backstoriesBeforePbj[i];
            }
        }
        console.log("[GeneratePersonasUseCase] PB&J extraction complete");

        return personas;
    }

    /**
     * PB&J (Psychology of Behavior and Judgment) pass, shared by the research
     * and strategy modes. rationalizePersonas appends the PB&J section to each
     * persona's backstory; the original backstory is captured first and
     * restored after the section is extracted into pbjRationales, so the
     * narrative stays clean and the rationales land in their own field.
     * A rationalization failure degrades gracefully: personas are returned
     * unchanged (without pbjRationales) rather than failing the run.
     */
    private async extractPbjRationales(personas: Persona[], contextNotes?: string): Promise<void> {
        const backstoriesBefore = personas.map(p => p.backstory ?? '');
        let rationalized: Persona[];
        try {
            rationalized = await this.llmService.rationalizePersonas(personas, contextNotes);
        } catch (err) {
            console.warn(`[GeneratePersonasUseCase] PB&J rationalization failed, continuing without pbjRationales: ${(err as Error).message}`);
            return;
        }
        for (let i = 0; i < personas.length; i++) {
            const enhanced = rationalized[i]?.backstory ?? backstoriesBefore[i];
            const pbjMatch = enhanced.match(/<<PSYCHOLOGICAL RATIONALES \(PB&J\)>>[\s\S]*$/);
            if (pbjMatch && personas[i]) {
                personas[i].pbjRationales = pbjMatch[0].trim();
                personas[i].backstory = backstoriesBefore[i];
            }
        }
    }
}

