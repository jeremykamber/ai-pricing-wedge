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
                return { filename: t.filename, signals };
            }),
        );

        const unsuccessfulExtractions: { filename: string; reason: unknown }[] = [];
        const successfulExtractions: ExtractedInterviewSignals[] = [];

        for (const result of extractionResults) {
            if (result.status === "fulfilled") {
                successfulExtractions.push(result.value.signals);
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

        // Phase 2: Pool — aggregate signals into weighted distribution
        onProgress?.({ step: 'POOLING' });
        const distribution = poolSignals(successfulExtractions);

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

        // Phase 5: Generate — delegate to GeneratePersonasUseCase for full persona creation
        // Forward sub-step progress (backstories, behavioral depth, etc.) so the UI
        // shows actual progress during this long-running phase instead of staying stuck.
        onProgress?.({ step: 'GENERATING', message: 'Generating personas from interview signals' });
        const personas = await this.generatePersonasUseCase.execute(
            combinedDescription,
            onProgress ? (inner) => {
                onProgress({
                    step: 'GENERATING',
                    message: inner.streamingText ?? inner.step,
                    current: inner.completedCount,
                    total: inner.totalCount,
                });
            } : undefined,
            targetCount,
            combinedDescription,
        );

        // Phase 6: Ingest — store backstory and interview chunks in ID-RAG store
        onProgress?.({ step: 'INGESTING' });
        for (const persona of personas) {
            const backstoryChunks = this.idRagStore.chunkBackstory(
                persona.id,
                persona.backstory ?? '',
            );
            const interviewChunks = successfulExtractions.flatMap(
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
