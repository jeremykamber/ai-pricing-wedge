import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { GeneratePersonasUseCase } from "./GeneratePersonasUseCase";
import { IdRagStore, Chunk } from "@/infrastructure/adapters/IdRagStore";
import { poolSignals } from "@/application/interviewPipeline/pooling";
import { samplePersonas } from "@/application/interviewPipeline/sampling";
import { chunkInterviewSignals } from "@/application/interviewPipeline/chunkInterviewSignals";
import type {
    ExtractedInterviewSignals,
    SampledPersonaSignal,
} from "@/application/interviewPipeline/types";

export type InterviewPipelineProgressStep =
    | 'EXTRACTING'
    | 'POOLING'
    | 'SAMPLING'
    | 'GENERATING'
    | 'INGESTING'
    | 'DONE'
    | 'ERROR';

export interface InterviewPipelineProgress {
    step: InterviewPipelineProgressStep;
    current?: number;
    total?: number;
    message?: string;
    personas?: Persona[];
}

function buildCoherenceValidationPrompt(personas: SampledPersonaSignal[]): string {
    const entries = personas.map((p, i) => {
        return [
            `Persona ${i}:`,
            `- Role: ${p.context.role?.text ?? 'Unknown'}, Industry: ${p.context.industry?.text ?? 'Unknown'}`,
            `- Pain Points: ${p.painPoints.map(s => s.text).join('; ')}`,
            `- Goals: ${p.goals.map(s => s.text).join('; ')}`,
            `- Values: ${p.values.map(s => s.text).join('; ')}`,
            `- Feature Desires: ${p.featureDesires.map(s => s.text).join('; ')}`,
            `- Decision Pattern: ${p.decisionPattern.text}`,
        ].join('\n');
    });

    return [
        'You are analyzing sampled persona signal sets for internal contradictions.',
        '',
        ...entries,
        '',
        'For each persona above, identify any internal contradictions between their pain points, goals, values, and decision patterns.',
        'Return a JSON object with a "contradictoryIndices" array containing the indices of any contradictory personas, or an empty array if all are coherent.',
        'Example: { "contradictoryIndices": [0, 3] } or { "contradictoryIndices": [] }',
    ].join('\n');
}

function formatPersonaDescription(signal: SampledPersonaSignal): string {
    const lines: string[] = [
        `Role: ${signal.context.role?.text ?? 'Unknown'}`,
        `Industry: ${signal.context.industry?.text ?? 'Unknown'}`,
        `Communication Style: ${signal.communicationStyle?.text ?? 'Unknown'}`,
        '',
        'Pain Points:',
        ...signal.painPoints.map(s => `- ${s.text} (quote: "${s.quote}")`),
        '',
        'Goals:',
        ...signal.goals.map(s => `- ${s.text} (quote: "${s.quote}")`),
        '',
        'Values:',
        ...signal.values.map(s => `- ${s.text} (quote: "${s.quote}")`),
        '',
        'Feature Desires:',
        ...signal.featureDesires.map(s => `- ${s.text} (quote: "${s.quote}")`),
        '',
        `Decision Pattern: ${signal.decisionPattern.text} (quote: "${signal.decisionPattern.quote}")`,
    ];

    return lines.join('\n');
}

export type InterviewGenerationMode = 'individual' | 'synthesized';

export class GeneratePersonasFromInterviewsUseCase {
    constructor(
        private llmService: LlmServicePort,
        private idRagStore: IdRagStore,
        private generatePersonasUseCase: GeneratePersonasUseCase,
    ) { }

    async execute(
        transcripts: { filename: string; content: string }[],
        onProgress?: (progress: InterviewPipelineProgress) => void,
        count: number = 5,
        mode: InterviewGenerationMode = 'synthesized',
    ): Promise<Persona[]> {
        if (transcripts.length === 0) {
            throw new Error("At least one interview transcript is required");
        }

        // Phase 1: Extract — parallel extraction from all transcripts
        onProgress?.({ step: 'EXTRACTING', total: transcripts.length, current: 0 });

        const extractionResults = await Promise.allSettled(
            transcripts.map(async (t, i) => {
                const interviewId = `interview-${i}`;
                onProgress?.({ step: 'EXTRACTING', total: transcripts.length, current: i + 1, message: t.filename });
                const signals = await this.llmService.extractInterviewSignals(t.content, interviewId);
                return { filename: t.filename, signals, content: t.content };
            }),
        );

        const unsuccessfulExtractions: { filename: string; reason: unknown }[] = [];
        const successfulExtractions: { signals: ExtractedInterviewSignals; content: string }[] = [];

        for (const result of extractionResults) {
            if (result.status === "fulfilled") {
                successfulExtractions.push(result.value);
            } else {
                console.warn(
                    `[GeneratePersonasFromInterviews] Extraction failed:`,
                    result.reason instanceof Error ? result.reason.message : String(result.reason),
                );
            }
        }

        if (successfulExtractions.length === 0) {
            throw new Error(
                `No interviews extracted successfully. At least one is required.`,
            );
        }

        // Mode: Individual — generate personas per interview
        if (mode === 'individual') {
            return this.generateIndividual(
                successfulExtractions,
                onProgress,
                count,
            );
        }

        // Mode: Synthesized — existing pool/sample/generate pipeline (default)
        return this.generateSynthesized(
            successfulExtractions.map(e => e.signals),
            onProgress,
            count,
        );
    }

    private async generateIndividual(
        successfulExtractions: { signals: ExtractedInterviewSignals; content: string }[],
        onProgress?: (progress: InterviewPipelineProgress) => void,
        personasPerInterview: number = 3,
    ): Promise<Persona[]> {
        const allPersonas: Persona[] = [];
        const totalPersonas = successfulExtractions.length * personasPerInterview;
        let completed = 0;

        for (let i = 0; i < successfulExtractions.length; i++) {
            const { signals, content } = successfulExtractions[i];
            const interviewId = `interview-${i}`;
            onProgress?.({
                step: 'GENERATING',
                message: `Generating personas from transcript ${i + 1}...`,
                current: completed,
                total: totalPersonas,
            });

            const description = `Interview transcript excerpt: ${content.slice(0, 1500)}

Key signals extracted from this interview:
Pain points:
${signals.painPoints.map(s => `- ${s.text}`).join('\n')}
Goals:
${signals.goals.map(s => `- ${s.text}`).join('\n')}
Values:
${signals.values.map(s => `- ${s.text}`).join('\n')}
Feature desires:
${signals.featureDesires.map(s => `- ${s.text}`).join('\n')}
Decision patterns:
${signals.decisionPatterns.map(s => `- ${s.text}`).join('\n')}
Context: role=${signals.context.role ?? 'unknown'}, industry=${signals.context.industry ?? 'unknown'}
Communication style: ${signals.communicationStyle}`;

            const personas = await this.llmService.generateResearchPersonas({
                count: personasPerInterview,
                personaDescription: description,
                interviewIds: [interviewId],
                evidenceThreshold: 0.7,
            });

            allPersonas.push(...personas);
            completed += personas.length;

            onProgress?.({
                step: 'GENERATING',
                message: `Generated ${completed}/${totalPersonas} personas`,
                current: completed,
                total: totalPersonas,
            });
        }

        onProgress?.({ step: 'DONE', personas: allPersonas });
        return allPersonas;
    }

    private async generateSynthesized(
        extractedSignals: ExtractedInterviewSignals[],
        onProgress?: (progress: InterviewPipelineProgress) => void,
        count: number = 5,
    ): Promise<Persona[]> {
        // Phase 2: Pool — aggregate signals into weighted distribution
        onProgress?.({ step: 'POOLING' });
        const distribution = poolSignals(extractedSignals);

        // Phase 3: Sample — weighted draw with LLM-based coherence validation
        onProgress?.({ step: 'SAMPLING' });
        const targetCount = count;

        const sampledSignals = await samplePersonas(
            distribution,
            targetCount,
            (personas) => this.validateCoherence(personas),
        );

        // Phase 4: Format — convert sampled signals into structured text descriptions
        const combinedDescription = sampledSignals
            .map(formatPersonaDescription)
            .join('\n\n---\n\n');

        // Phase 5: Generate — use research mode for evidence-grounded personas
        // Research mode keeps backstories minimal (2-3 evidence-based sentences)
        // and avoids Tier 4 fabricated memories (trauma, fake events, fake purchases)
        onProgress?.({ step: 'GENERATING', message: 'Generating evidence-grounded personas' });
        const personas = await this.llmService.generateResearchPersonas({
            count: targetCount,
            personaDescription: combinedDescription,
            interviewIds: extractedSignals.map((_, i) => `interview-${i}`),
            evidenceThreshold: 0.7,
        });

        // Phase 6: Ingest — store backstory and interview chunks in ID-RAG store
        onProgress?.({ step: 'INGESTING' });
        for (const persona of personas) {
            const backstoryChunks = this.idRagStore.chunkBackstory(
                persona.id,
                persona.backstory ?? '',
            );
            const interviewChunks = extractedSignals.flatMap(
                (signals) => chunkInterviewSignals(signals, persona.id),
            );
            const allChunks: Chunk[] = [...backstoryChunks, ...interviewChunks];
            this.idRagStore.ingestChunks(persona.id, allChunks);
        }

        onProgress?.({ step: 'DONE', personas });
        return personas;
    }

    private async validateCoherence(personas: SampledPersonaSignal[]): Promise<number[]> {
        const prompt = buildCoherenceValidationPrompt(personas);
        try {
            const response = await this.llmService.createChatCompletion(
                [{ role: 'user', content: prompt }],
                {
                    temperature: 0.1,
                    response_format: { type: 'json_object' },
                    purpose: 'Coherence validation for sampled personas',
                },
            );

            const parsed = JSON.parse(response);
            if (Array.isArray(parsed)) return parsed;
            if (Array.isArray(parsed.contradictoryIndices)) return parsed.contradictoryIndices;
            return [];
        } catch (error) {
            console.warn(
                '[GeneratePersonasFromInterviews] Coherence validation failed, assuming all coherent:',
                error instanceof Error ? error.message : String(error),
            );
            return [];
        }
    }
}
