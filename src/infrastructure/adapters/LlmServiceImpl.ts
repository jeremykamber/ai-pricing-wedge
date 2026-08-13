import OpenAI from "openai";
import pLimit from "p-limit";
import { LlmServicePort, PricingLocation, PersonaPhaseCallback, ChatAnalysisContext } from "@/domain/ports/LlmServicePort";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { PersonaAdapter } from "./PersonaAdapter";
import { VisionAnalysisAdapter } from "./VisionAnalysisAdapter";
import { ChatAdapter } from "./ChatAdapter";
import { HtmlSummarizer } from "./HtmlSummarizer";
import { InterviewSignalExtractor } from "./InterviewSignalExtractor";
import { PsychographicRationalizer } from "./PsychographicRationalizer";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import type { ArtifactIntake } from "@/domain/entities/ArtifactIntake";
import { StreamOfConsciousness } from "@/domain/entities/StreamOfConsciousness";
import { ExtractedInterviewSignals } from "@/application/interviewPipeline/types";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";
import type { ResearchPersonaConfig, StrategyPersonaConfig, ClusterPersonaConfig } from "@/domain/dtos/PersonaGenerationConfig";

function shouldDisableThinkingForModel(model: string): boolean {
    return model.toLowerCase().includes("qwen");
}

/**
 * The AI SDK (@ai-sdk/openai) validates provider options against a fixed schema
 * and drops unknown request params, so `reasoning: { enabled: false }` cannot be
 * passed through streamObject. Injecting it at the fetch layer is the only way to
 * disable chain-of-thought on requests the SDK would otherwise build unmodified.
 *
 * This wrapper is also the single hook where OpenRouter-only request params can
 * be injected. The persona profile call (provider.chat → /chat/completions) gets
 * throughput-sorted, structured-output-guaranteed routing: OpenRouter's default
 * price-weighted routing sends deepseek to backends with 6x+ latency spread.
 */
function withReasoningDisabled(
    baseFetch: typeof fetch,
    shouldDisable: (model: string) => boolean,
): typeof fetch {
    return async (input, init) => {
        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.href
                    : input instanceof Request
                        ? input.url
                        : "";
        if (
            init?.method === "POST" &&
            typeof init.body === "string" &&
            url.includes("/chat/completions")
        ) {
            try {
                const body = JSON.parse(init.body);
                const model = String(body?.model ?? "");
                // qwen (analysis) via the global rule; deepseek on chat
                // completions is the persona profile call — its CoT explodes
                // on the demanding schema prompt (8k+ reasoning tokens,
                // 90-400s). Everything else on /responses is untouched.
                if (shouldDisable(model) || model.includes("deepseek")) {
                    body.reasoning = { enabled: false };
                }
                init = { ...init, body: JSON.stringify(body) };
            } catch {
                // Leave non-JSON bodies untouched.
            }
        }
        return baseFetch(input, init);
    };
}

export class LlmServiceImpl implements LlmServicePort {
    public client: OpenAI;
    public provider: OpenAIProvider;
    public textModel: string;
    public smallTextModel: string;
    public visionModel: string;
    public scoutVisionModel: string;
    public extractionModel: string;
    private static requestCount = 0;
    public static readonly limiter = pLimit(20);

    private personaAdapter: PersonaAdapter;
    private visionAdapter: VisionAnalysisAdapter;
    private chatAdapter: ChatAdapter;
    private htmlSummarizer: HtmlSummarizer;
    private interviewSignalExtractor: InterviewSignalExtractor;

    private static readonly OR_TEXT_MODEL = "deepseek/deepseek-v4-flash-0731";
    private static readonly OR_SMALL_TEXT_MODEL = "deepseek/deepseek-v4-flash-0731";
    private static readonly OR_VISION_MODEL = "qwen/qwen3.7-flash";
    private static readonly OR_SCOUT_MODEL = "qwen/qwen3.7-flash";
    private static readonly OR_EXTRACTION_MODEL = "deepseek/deepseek-v4-flash-0731";

    private static readonly OLLAMA_DEFAULT_MODEL = "gemma3:1b-it-qat";

    constructor(
        client: OpenAI,
        provider: OpenAIProvider,
        models: {
            text: string;
            smallText: string;
            vision: string;
            scout: string;
            extraction: string;
        },
    ) {
        this.client = client;
        this.provider = provider;
        this.textModel = models.text;
        this.smallTextModel = models.smallText;
        this.visionModel = models.vision;
        this.scoutVisionModel = models.scout;
        this.extractionModel = models.extraction;

        this.personaAdapter = new PersonaAdapter(this);
        this.visionAdapter = new VisionAnalysisAdapter(this);
        this.chatAdapter = new ChatAdapter(this);
        this.htmlSummarizer = new HtmlSummarizer(this);
        this.interviewSignalExtractor = new InterviewSignalExtractor(this);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    public async withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
        let lastError: unknown;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error: unknown) {
                lastError = error;
                const status = (error as { status?: number }).status;
                const isRetryable =
                    status === 429 || (status !== undefined && status >= 500);
                if (!isRetryable || i === maxRetries - 1) throw error;
                const waitTime = Math.pow(2, i) * 2000 + Math.random() * 1000;
                console.warn(
                    `[LlmService] Retry ${i + 1}/${maxRetries} after ${Math.round(waitTime)}ms (status=${status})`,
                );
                await this.sleep(waitTime);
            }
        }
        throw lastError;
    }

    static createFromEnv(
        provider: "ollama" | "openrouter",
        overrides?: {
            text?: string;
            smallText?: string;
            vision?: string;
            scout?: string;
            extraction?: string;
        },
    ): LlmServiceImpl {
        const baseURL =
            provider === "ollama"
                ? process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1"
                : process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

        const apiKey =
            provider === "openrouter"
                ? process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
                : process.env.OLLAMA_API_KEY || "ollama";

        const client = new OpenAI({
            baseURL,
            apiKey: apiKey as string,
            dangerouslyAllowBrowser: true,
            maxRetries: 0,
        });
        const providerInstance = createOpenAI({
            baseURL,
            apiKey: apiKey as string,
            fetch: withReasoningDisabled(globalThis.fetch, shouldDisableThinkingForModel),
        });

        const models =
            provider === "ollama"
                ? {
                    text: overrides?.text || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
                    smallText:
                        overrides?.smallText || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
                    vision: overrides?.vision || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
                    scout: overrides?.scout || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
                    extraction:
                        overrides?.extraction || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
                }
                : {
                    text: overrides?.text || LlmServiceImpl.OR_TEXT_MODEL,
                    smallText:
                        overrides?.smallText || LlmServiceImpl.OR_SMALL_TEXT_MODEL,
                    vision: overrides?.vision || LlmServiceImpl.OR_VISION_MODEL,
                    scout: overrides?.scout || LlmServiceImpl.OR_SCOUT_MODEL,
                    extraction:
                        overrides?.extraction || LlmServiceImpl.OR_EXTRACTION_MODEL,
                };

        return new LlmServiceImpl(client, providerInstance, models);
    }

    private shouldDisableThinking(model?: string): boolean {
        const modelToCheck = model || this.textModel;
        return shouldDisableThinkingForModel(modelToCheck);
    }

    public async createChatCompletion(
        messages: any,
        options: {
            temperature?: number;
            max_tokens?: number | null;
            response_format?: { type: "json_object" | "text" };
            model?: string;
            purpose?: string;
            runId?: string;
            /**
             * Disable chain-of-thought for this call even when the model's
             * reasoning is normally on (deepseek). Persona generation needs
             * direct answers — CoT burns the output budget and can return
             * empty content on reasoning-heavy calls.
             */
            disableReasoning?: boolean;
        },
    ): Promise<string> {
        return this.withRetry(async () => {
            const reqId = ++LlmServiceImpl.requestCount;
            const purpose = options.purpose || "General";
            const model = options.model || this.textModel;
            const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;

            // Log the request with input size estimate
            const messagesTotalChars = messages
                ? JSON.stringify(messages).length
                : 0;
            log?.info(
                "LlmServiceImpl",
                `[Req #${reqId}] [${purpose}] Sending request to ${model}...`,
                {
                    messagesLength: messagesTotalChars,
                    temperature: options.temperature ?? 0.7,
                    maxTokens: options.max_tokens ?? null,
                    responseFormat: options.response_format?.type ?? "text",
                },
            );

            console.log(
                `[LlmService] [Req #${reqId}] [${purpose}] Sending request to ${model}... (${messagesTotalChars} chars)`,
            );
            const startTime = Date.now();

            const requestParams: any = {
                model,
                messages,
                temperature: options.temperature ?? 0.7,
                max_tokens: options.max_tokens ?? undefined,
                response_format: options.response_format,
            };

            if (this.shouldDisableThinking(model) || options.disableReasoning) {
                requestParams.reasoning = { enabled: false };
            }

            const resp = await LlmServiceImpl.limiter(() =>
                this.client.chat.completions.create(requestParams),
            );

            const responseContent = resp?.choices?.[0]?.message?.content || "";
            const durationMs = Date.now() - startTime;

            console.log(
                `[LlmService] [Req #${reqId}] [${purpose}] Completed in ${durationMs}ms. Response: ${responseContent.length} chars.`,
            );

            log?.info("LlmServiceImpl", `[Req #${reqId}] [${purpose}] Completed`, {
                durationMs,
                responseLength: responseContent.length,
                responsePreview: responseContent.slice(0, 300),
            });

            // Capture and log reasoning tokens if present (DeepSeek V4 Flash)
            const reasoning =
                (resp?.choices?.[0]?.message as any)?.reasoning ||
                (resp?.choices?.[0]?.message as any)?.reasoning_content;
            if (reasoning) {
                console.log(
                    `[LlmService] [Req #${reqId}] [${purpose}] Reasoning (${reasoning.length} chars): ${reasoning.slice(0, 300)}...`,
                );
                log?.info("LlmServiceImpl", `[Req #${reqId}] Reasoning`, {
                    length: reasoning.length,
                    preview: reasoning.slice(0, 500),
                });
            }

            return responseContent;
        });
    }

    public async *createChatCompletionStream(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        options: {
            temperature?: number;
            max_tokens?: number | null;
            response_format?: { type: "json_object" | "text" };
            model?: string;
            purpose?: string;
            runId?: string;
        },
    ): AsyncIterable<string> {
        let reqId = 0;
        const stream = await this.withRetry(async () => {
            reqId = ++LlmServiceImpl.requestCount;
            const purpose = options.purpose || "General";
            const model = options.model || this.textModel;
            const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;

            console.log(
                `[LlmService] [Req #${reqId}] [${purpose}] Starting stream to ${model}...`,
            );
            log?.info("LlmServiceImpl", `[Req #${reqId}] [${purpose}] Starting stream`, {
                model,
                messagesLength: JSON.stringify(messages).length,
                temperature: options.temperature ?? 0.7,
            });

            const requestParams: any = {
                model,
                messages,
                temperature: options.temperature ?? 0.7,
                max_tokens: options.max_tokens ?? undefined,
                response_format: options.response_format,
                stream: true,
            };

            if (this.shouldDisableThinking(model)) {
                requestParams.reasoning = { enabled: false };
            }

            return await this.client.chat.completions.create(requestParams);
        });

        const chunkStream = stream as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
        let debugLogged = false;
        let reasoningAccum = "";
        let contentStarted = false;
        let chunkCount = 0;
        for await (const chunk of chunkStream) {
            chunkCount++;
            const delta = chunk.choices[0]?.delta as any;
            if (!debugLogged && delta && chunk.choices[0]?.finish_reason === null) {
                console.log(`[LlmService] [Req #${reqId}] FIRST RAW CHUNK:`, JSON.stringify(chunk).slice(0, 500));
                debugLogged = true;
            }

            const reasoning =
                delta?.reasoning_content ||
                delta?.reasoning ||
                (delta?.reasoning_details?.[0]?.text) ||
                (Array.isArray(delta?.reasoning_details) ? delta.reasoning_details.map((r: any) => r.text || "").join("") : null);
            if (reasoning) {
                reasoningAccum += reasoning;
            }
            const content = delta?.content;
            if (content) {
                if (reasoningAccum && !contentStarted) {
                    yield `<<REASONING>>${reasoningAccum}<</REASONING>>`;
                    reasoningAccum = "";
                    contentStarted = true;
                }
                yield content;
            }
        }
        if (reasoningAccum) {
            yield `<<REASONING>>${reasoningAccum}<</REASONING>>`;
        }

        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        log?.info("LlmServiceImpl", `[Req #${reqId}] Stream completed`, {
            totalChunks: chunkCount,
            reasoningLength: reasoningAccum.length,
        });
    }

    async isPricingVisible(screenshot: string, runId?: string): Promise<boolean> {
        return this.visionAdapter.isPricingVisible(screenshot, runId);
    }

    async isPricingVisibleInHtml(html: string, runId?: string): Promise<PricingLocation> {
        return this.visionAdapter.isPricingVisibleInHtml(html, runId);
    }

    async analyzePricingPageStream(
        persona: Persona,
        screenshot: string,
        html?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any> {
        return this.visionAdapter.analyzePricingPageStream(
            persona,
            screenshot,
            html,
            options,
        );
    }

    async analyzePricingPageCompletion(
        persona: Persona,
        screenshot: string,
        html?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any> {
        return this.visionAdapter.analyzePricingPageCompletion(
            persona,
            screenshot,
            html,
            options,
        );
    }

    async generateStreamOfConsciousness(
        persona: Persona,
        screenshot: string,
        html?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<StreamOfConsciousness> {
        return this.visionAdapter.generateStreamOfConsciousness(
            persona,
            screenshot,
            html,
            options,
        );
    }

    async formatStreamOfConsciousness(
        persona: Persona,
        stream: StreamOfConsciousness,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<PricingAnalysis> {
        return this.visionAdapter.formatStreamOfConsciousness(
            persona,
            stream,
            options,
        ) as Promise<PricingAnalysis>;
    }

    async summarizeStreamOfConsciousness(
        persona: Persona,
        stream: StreamOfConsciousness,
        options?: { runId?: string }
    ): Promise<string[]> {
        return this.visionAdapter.summarizeStreamOfConsciousness(
            persona,
            stream,
            options,
        );
    }

    async summarizeHtml(html: string, runId?: string): Promise<string> {
        return this.htmlSummarizer.summarizeHtml(html, runId);
    }

    // ─── New artifact-agnostic analysis pipeline ──────────────────

    async analyzeArtifactStream(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any> {
        return this.visionAdapter.analyzeArtifactStream(
            persona,
            context,
            businessGoal,
            researchQuestion,
            options,
        );
    }

    async analyzeArtifactCompletion(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any> {
        return this.visionAdapter.analyzeArtifactCompletion(
            persona,
            context,
            businessGoal,
            researchQuestion,
            options,
        );
    }

    async generateCognitiveStream(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<StreamOfConsciousness> {
        return this.visionAdapter.generateCognitiveStream(
            persona,
            context,
            businessGoal,
            researchQuestion,
            options,
        );
    }

    async formatPersonaResponse(
        persona: Persona,
        stream: StreamOfConsciousness,
        businessGoal: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<PersonaResponse> {
        return this.visionAdapter.formatPersonaResponse(
            persona,
            stream,
            businessGoal,
            researchQuestion,
            options,
        );
    }

    async deriveResponseSignals(
        persona: Persona,
        stream: StreamOfConsciousness,
        options?: { runId?: string }
    ): Promise<{ highestStageReached: string; finalAction: string; keySignals: string[] }> {
        return this.visionAdapter.deriveResponseSignals(
            persona,
            stream,
            options,
        );
    }

    async generateTopFindings(
        responses: import("@/domain/entities/PersonaResponse").PersonaResponse[],
        businessGoal: string,
        researchQuestion: string,
        options?: { runId?: string }
    ): Promise<import("@/domain/entities/ArtifactSynthesis").SynthesizedFinding[]> {
        return this.visionAdapter.generateTopFindings(responses, businessGoal, researchQuestion, options);
    }

    async generateDisagreements(
        responses: import("@/domain/entities/PersonaResponse").PersonaResponse[],
        options?: { runId?: string }
    ): Promise<import("@/domain/entities/ArtifactSynthesis").Disagreement[]> {
        return this.visionAdapter.generateDisagreements(responses, options);
    }

    async generateFrictions(
        responses: import("@/domain/entities/PersonaResponse").PersonaResponse[],
        options?: { runId?: string }
    ): Promise<string[]> {
        return this.visionAdapter.generateFrictions(responses, options);
    }

    async generateSynthesisOverview(
        responses: import("@/domain/entities/PersonaResponse").PersonaResponse[],
        businessGoal: string,
        researchQuestion: string,
        topFindings: import("@/domain/entities/ArtifactSynthesis").SynthesizedFinding[],
        disagreements: import("@/domain/entities/ArtifactSynthesis").Disagreement[],
        frictions: string[],
        options?: { runId?: string }
    ): Promise<{ overview: string; researchQuestionAnswer: string }> {
        return this.visionAdapter.generateSynthesisOverview(
            responses, businessGoal, researchQuestion, topFindings, disagreements, frictions, options,
        );
    }

    // --- Domain Gateways (Delegating to Adapters) ---

    async generateInitialPersonas(description: string, count?: number) {
        return this.personaAdapter.generateInitialPersonas(description, count);
    }

    async *generateInitialPersonasStream(
        description: string,
        count?: number,
    ): AsyncIterable<Partial<Persona>[]> {
        yield* this.personaAdapter.generateInitialPersonasStream(description, count);
    }

    async generatePersonaBackstory(
        persona: Persona | string,
        onProgress?: (p: number, t: number) => void,
    ): Promise<string> {
        return this.personaAdapter.generatePersonaBackstory(persona, onProgress);
    }

    async *generatePersonaBackstoryStream(
        persona: Persona | string,
    ): AsyncIterable<string> {
        yield* this.personaAdapter.generatePersonaBackstoryStream(persona);
    }

    async generateAbbreviatedBackstory(
        persona: Persona | string,
    ): Promise<string> {
        return this.personaAdapter.generateAbbreviatedBackstory(persona);
    }

    async *generateAbbreviatedBackstoryStream(
        persona: Persona | string,
    ): AsyncIterable<string> {
        yield* this.personaAdapter.generateAbbreviatedBackstoryStream(persona);
    }

    async generateAbbreviatedBackstoriesBatch(personas: Persona[]): Promise<string[]> {
        return this.personaAdapter.generateAbbreviatedBackstoriesBatch(personas);
    }

    async generateVariationPersonas(
        referencePersona: Persona,
        adjustments: { bigFive: { conscientiousness: number; neuroticism: number; openness: number; extraversion: number; agreeableness: number }; variationLevel: number },
        count: number,
    ): Promise<Persona[]> {
        return this.personaAdapter.generateVariationPersonas(referencePersona, adjustments, count);
    }

    async inferTraitsFromBackstory(backstory: string) {
        return this.personaAdapter.inferTraitsFromBackstory(backstory);
    }

    // --- Dual-Mode Persona Generation (2025 Philosophy) ---

    async generateResearchPersonas(config: ResearchPersonaConfig, onPhase?: PersonaPhaseCallback): Promise<Persona[]> {
        return this.personaAdapter.generateResearchPersonas(config, onPhase);
    }

    async generateStrategyPersonas(config: StrategyPersonaConfig, onPhase?: PersonaPhaseCallback): Promise<Persona[]> {
        return this.personaAdapter.generateStrategyPersonas(config, onPhase);
    }

    async generateClusterPersonas(config: ClusterPersonaConfig): Promise<Persona[]> {
        return this.personaAdapter.generateClusterPersonas(config);
    }

    async applyCounterfactualTest(persona: Persona): Promise<{ detail: string; reason: string; attribute?: string }[]> {
        return this.personaAdapter.applyCounterfactualTest(persona);
    }

    async rationalizePersonas(personas: Persona[], contextNotes?: string): Promise<Persona[]> {
        const enhancer = new PsychographicRationalizer(this);
        const enhanced = await Promise.allSettled(
            personas.map(async (persona) => {
                const pbjText = await enhancer.rationalizeBackstory(persona, contextNotes);
                if (pbjText) {
                    persona.backstory = (persona.backstory ?? "") + pbjText;
                }
                return persona;
            }),
        );
        return enhanced.map((r, i) => (r.status === "fulfilled" ? r.value : personas[i]));
    }

    async extractInterviewSignals(transcript: string, interviewId: string): Promise<ExtractedInterviewSignals> {
        return this.interviewSignalExtractor.extract(transcript, interviewId);
    }

    async *chatWithPersonaStream(
        persona: Persona,
        analysis: ChatAnalysisContext,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): AsyncIterable<string> {
        yield* this.chatAdapter.chatWithPersonaStream(
            persona,
            analysis,
            message,
            history,
        );
    }

    async validatePromptDomain(
        persona: Persona,
        prompt: string,
    ): Promise<{ isValid: boolean; reason?: string }> {
        return this.chatAdapter.validatePromptDomain(persona, prompt);
    }

    async *chatWithPanelStream(
        responses: PersonaResponse[],
        synthesis: ArtifactSynthesis | null,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): AsyncIterable<string> {
        yield* this.chatAdapter.chatWithPanelStream(responses, synthesis, message, history);
    }

    // --- Legacy / Compatibility ---

    async analyzeStaticPage(
        persona: Persona,
        screenshot: string,
    ): Promise<PricingAnalysis> {
        throw new Error("analyzeStaticPage is deprecated. Use analyzePricingPageStream instead.");
    }

    async *analyzeStaticPageStream(
        persona: Persona,
        screenshots: string[],
    ): AsyncIterable<string> {
        const result = await this.analyzePricingPageStream(persona, screenshots[0]);
        for await (const partial of result.partialObjectStream) {
            if (partial.thoughts) yield partial.thoughts;
        }
    }

    async extractInsights(
        persona: Persona,
        rawThoughts: string,
    ): Promise<Partial<PricingAnalysis>> {
        throw new Error("extractInsights is deprecated. Use analyzePricingPageStream for consolidated results.");
    }

    async chatWithPersona(
        persona: Persona,
        analysis: ChatAnalysisContext,
        msg: string,
        history: any,
    ): Promise<string> {
        let full = "";
        for await (const chunk of this.chatWithPersonaStream(
            persona,
            analysis,
            msg,
            history,
        )) {
            full += chunk;
        }
        return full;
    }

    async decideNextStep(): Promise<any> {
        throw new Error("decideNextStep is not implemented in this MVP branch.");
    }
}
