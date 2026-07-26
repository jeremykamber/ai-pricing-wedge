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

export class GeneratePersonasUseCase {
    private static readonly ABBREVIATE_BACKSTORIES = true; // Toggle this for fast testing

    constructor(private llmService: LlmServicePort) { }

    async execute(
        personaDescription: string,
        onProgress?: (progress: PersonaGenerationProgress) => void,
        count?: number
    ): Promise<Persona[]> {
        console.log("Executing GeneratePersonas use case");

        // Generate personas via non-streaming call (reliable, no stream issues)
        onProgress?.({
            step: 'BRAINSTORMING_PERSONAS',
            streamingText: "Generating persona profiles..."
        });

        // Retry once on count mismatch — LLMs sometimes return wrong counts despite prompt enforcement
        let personas: Persona[] | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                personas = await this.llmService.generateInitialPersonas(personaDescription, count);
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
                throw err; // Non-count errors or second failure — propagate
            }
        }

        if (!personas || personas.length === 0) {
            throw new Error("Failed to generate any personas from the description");
        }

        console.log(`[GeneratePersonasUseCase] Generated ${personas.length} personas`);

        const abbreviate = GeneratePersonasUseCase.ABBREVIATE_BACKSTORIES;
        const subStepsPerPersona = abbreviate ? 1 : 4;

        // Broadcast initial personas immediately for UI responsiveness
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

        // OPTIMIZATION: Use batch generation instead of per-persona calls
        // This reduces 3 LLM calls to 1 for backstories
        console.log("[GeneratePersonasUseCase] Generating batch backstories...");
        onProgress?.({
            step: 'GENERATING_BACKSTORIES',
            personaName: personas[0]?.name,
            personas,
            totalCount,
            completedCount: 0,
            totalSubSteps,
            completedSubSteps: 0,
            streamingText: `Phase 2 of 4: Building stories...`,
        });

        const backstoryTexts = await (this.llmService as any).generateAbbreviatedBackstoriesBatch(personas);
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

        // Phase 3: PB&J Rationalization — causally connect Big Five to psychographics
        // Joshi et al. (2025): improves persona alignment by 6-9% over backstory-only
        console.log("[GeneratePersonasUseCase] Enhancing personas with PB&J psychological rationales...");
        onProgress?.({
            step: 'ADDING_BEHAVIORAL_DEPTH',
            personaName: personas[0]?.name,
            personas: JSON.parse(JSON.stringify(personas)),
            totalCount,
            completedCount: 0,
            streamingText: `Phase 3 of 4: Connecting traits to behavior...`,
        });

        personas = await this.llmService.rationalizePersonas(personas);
        console.log("[GeneratePersonasUseCase] PB&J enhancement complete for all personas");

        return personas;
    }
}

