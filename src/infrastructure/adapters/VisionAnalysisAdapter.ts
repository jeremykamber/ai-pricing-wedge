import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysisSchema } from "@/domain/entities/PricingAnalysis";
import { PersonaResponseSchema } from "@/domain/entities/PersonaResponse";
import type { ArtifactIntake } from "@/domain/entities/ArtifactIntake";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis, SynthesizedFinding, Disagreement } from "@/domain/entities/ArtifactSynthesis";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";
import { IdRagStore } from "./IdRagStore";
import { IdRagService } from "./IdRagService";
import { streamObject } from "ai";
import { PricingLocation } from "@/domain/ports/LlmServicePort";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export class VisionAnalysisAdapter {
    private promptCompiler: PersonaPromptCompiler;
    private ragStore: IdRagStore;
    private ragService: IdRagService;
    private ingestedPersonas: Set<string> = new Set();

    constructor(private llmService: LlmServiceImpl) {
        this.promptCompiler = new PersonaPromptCompiler();
        this.ragStore = new IdRagStore();
        this.ragService = new IdRagService(this.ragStore);
    }

    private ensureIngested(persona: Persona, runId?: string): void {
        if (!this.ingestedPersonas.has(persona.id) && persona.backstory) {
            this.ragStore.ingestPersona(persona);
            this.ingestedPersonas.add(persona.id);
            const log = runId ? AnalysisLogger.forRun(runId) : null;
            log?.info("VisionAnalysisAdapter", `Ingested ${persona.name} backstory into ID-RAG store`, {
                personaId: persona.id,
                backstoryLength: persona.backstory.length,
            });
        }
    }

    async analyzePricingPageStream(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options: { tokenLimit?: number; runId?: string } = {}
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const methodStart = Date.now();

        log?.info("VisionAnalysisAdapter", `analyzePricingPageStream START for "${persona.name}"`, {
            tokenLimit,
            hasHtml: !!pageHtml,
            htmlLength: pageHtml?.length || 0,
            screenshotLength: screenshotBase64.length,
        });

        this.ensureIngested(persona, options.runId);

        // Retrieve relevant memories based on the page context
        const ragStart = Date.now();
        const query = pageHtml ? `Pricing page about ${pageHtml.slice(0, 200)}` : "Evaluating a pricing page";
        const ragContext = this.ragService.retrieveContext(persona, query, 3);
        const ragDuration = Date.now() - ragStart;
        log?.info("VisionAnalysisAdapter", `ID-RAG retrieval for "${persona.name}"`, {
            query: query.slice(0, 100),
            chunkCount: ragContext.chunkCount,
            contextStringLength: ragContext.contextString.length,
            durationMs: ragDuration,
        });

        const compileStart = Date.now();
        const compartments = this.promptCompiler.compileSystemPrompt(persona);
        const personaAnchor = this.promptCompiler.generateAnchor(persona);
        const compileDuration = Date.now() - compileStart;
        log?.info("VisionAnalysisAdapter", `Prompt compilation for "${persona.name}"`, {
            compartmentsLength: compartments.length,
            anchor: personaAnchor,
            durationMs: compileDuration,
        });
        log?.debug("VisionAnalysisAdapter", `Compartmentalized prompt for "${persona.name}"`, {
            prompt: compartments.slice(0, 1000) + `...(truncated, total ${compartments.length} chars)`,
        });

        const system = `You are a specialized JSON-only agent evaluating a pricing page as a specific persona.
        
        ${compartments}
        
        <<ANALYSIS TASK>>
        You are looking at a pricing page. You have been provided with:
        1. A screenshot of the exact viewport containing the pricing.
        2. A verified factual summary of the page's HTML (including product info, tier data, and fine print).
        
        ${ragContext.contextString ? `<<RETRIEVED MEMORY>>\n${ragContext.contextString}\n` : ""}

        <<VOICE AND AUDIENCE>>
        You are writing a JSON report with two distinct audiences:
        1. MOST FIELDS (gutReaction, thoughts, risks, scores, aiSuggestion): You speak AS the persona in first person. "I think...", "This concerns me...", "I'd want to see..."
        2. RECOMMENDATIONS: You write TO the company as an external advisor. Imperative sentences, no first person. "Add a monthly billing option.", "Remove the annual lock-in.", "Publish a clear refund policy."
        
        WRONG (self-advice): "Check if the Pro plan includes a free trial."
        WRONG (self-advice): "Look for a job search section on the site."
        CORRECT (company directive): "Offer a free trial on the Pro plan."
        CORRECT (company directive): "Add a job search or career section."
        
        <<PERSONALITY BIAS APPLICATION>>
        Your personality profile drives how you evaluate. Apply it aggressively:
        - Your Neuroticism determines how many risks you flag and how severe.
        - Your Conscientiousness determines how much fine print you read.
        - Your Openness determines whether new features excite or concern you.
        - Your Extraversion determines whether you seek team validation.
        - Your Agreeableness determines whether you give benefit of doubt.
        These are WHO YOU ARE. Your scores must reflect your personality.
        
        <<OPENNESS PRIMING>>
        ${personaAnchor} You're open to this. You're approaching this as someone who COULD genuinely use a tool like this. You're not looking for reasons to reject it — you're evaluating honestly, looking for what works and what doesn't. A skeptical but fair assessment.
        
        CALIBRATION — Your evaluation should be consistent with your own pricing sensitivity and typical budget. You have real experience in your domain and know what things should cost. Let YOUR unique profile — not generic expectations — drive your reaction.
        
        STRICT OUTPUT RULES:
        - Respond ONLY with a valid JSON object following the provided schema.
        - You MUST include ALL fields: gutReaction, thoughts, scores (with reasons), risks, and recommendations.
        - NO conversational preamble. NO monologue. NO text before or after the JSON.
        - Use standard JSON double quotes (") for all keys and string values.
        - Escape any literal double quotes within strings using a backslash (\").
        - If you have nothing more to say, STOP.
        - The 'thoughts' field MUST be limited to roughly ${Math.floor(tokenLimit * 0.75)} tokens to avoid truncated JSON.
        - RISKS: Limit to 3 items. Write from your (the persona's) perspective — what concerns you about this page? Ground each risk in something specific.
        - RECOMMENDATIONS: 2-3 imperatives directed AT THE COMPANY. What should they change on their pricing page? Do NOT write as the persona reflecting on their own buying decision.
        - AI SUGGESTION: ONE persona-specific actionable insight in YOUR (the persona's) voice. THE ONE THING this company should change to win YOU over. Reference something specific on the page.
         - NO REPETITION: Do NOT repeat information across different fields. Keep 'gutReaction' short and punchy.
         
         STRUCTURED THOUGHTS FORMAT:
         Inside your 'thoughts' field, structure your analysis using these markers:
         [The Good] — What works well. Specific positive observations.
         [The Bad] — What doesn't work. Specific criticisms.
         [The Dealbreaker] — The single biggest reason you would NOT buy.
         
         SCORING: INTENT FUNNEL + RATIONALES
        For each score, you MUST provide both a number (1-10) AND a 1-2 sentence reason explaining WHY.
        
        The three intent scores form a funnel: Exploration → Analysis → Buy.
        - explorationIntent (1-10): Would you explore this further? Click around? Read docs? Compare?
          1=I'd close the tab. 10=I'm already digging into the features page.
        - analysisIntent (1-10): Would you do a deep analysis? Run a trial? Compare with alternatives?
          1=Not worth my time. 10=I'm already planning a pilot with my team.
        - buyIntent (1-10): Would you actually purchase?
          1=Never. 10=Ready to buy now.
        
        The funnel should generally narrow: explorationIntent >= analysisIntent >= buyIntent.
        If you'd explore but not buy, that's normal. A high buyIntent with low exploration is suspicious.
        
        STRUCTURE: Scores → Reasons → Narrative Thoughts
        1. Your scores come first: clarity, valuePerception, trust — each with a reason
        2. Then the intent funnel: explorationIntent, analysisIntent, buyIntent — each with a reason
        3. Then your narrative thoughts, gut reaction, risks, and recommendations
        Your reasons should be specific and grounded in what you see on the page.
        
        HYBRID GROUNDING RULES:
        - Use the screenshot to gauge visual appeal, layout, emotion, and visual hierarchy.
        - Use the HTML summary to verify specific prices, plan names, and fine print that might be cut off or hard to read in the image.
        - If there is a contradiction, trust the HTML summary for hard data (prices/features) and the screenshot for layout/emotion.
        
        SCORING LOGIC:
        - Different personas MUST give DIFFERENT scores based on their unique Big Five, values, fears, and pricing sensitivity.
        - Disagreement between score dimensions is fine: you can love the clarity but distrust the vendor.
        - Consistency is mandatory. If you feel "burned" or "skeptical", your scores must reflect that.
        - Funnel logic: low exploration → low analysis → low buy. High exploration → could go either way.
        - Score-sentiment alignment: If your gut reaction is positive, scores should be 6+. If critical, 4 or below.

        Be blunt, honest, and natural. Be your persona.`;

        const prompt = `Evaluate this pricing page. Return ONLY the JSON object. ${pageHtml ? `\n\nPAGE FACT SUMMARY:\n"""\n${pageHtml}\n"""` : ""}`;

        log?.info("VisionAnalysisAdapter", `Calling streamObject for "${persona.name}"...`, {
            model: this.llmService.visionModel,
            systemPromptLength: system.length,
            promptLength: prompt.length,
            maxTokens: tokenLimit,
        });

        const streamObjectStart = Date.now();
        const streamObjResult = streamObject({
            model: this.llmService.provider(this.llmService.visionModel),
            schema: PricingAnalysisSchema,
            schemaName: "PricingAnalysis",
            schemaDescription: "A detailed evaluation of a pricing page from a persona's perspective.",
            system,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image",
                            image: screenshotBase64,
                        },
                    ],
                },
            ],
            temperature: 0.4,
            maxTokens: tokenLimit,
        } as any);
        const streamObjectDuration = Date.now() - streamObjectStart;
        const totalDuration = Date.now() - methodStart;
        log?.info("VisionAnalysisAdapter", `streamObject() call returned for "${persona.name}"`, {
            streamObjectCallDurationMs: streamObjectDuration,
            totalAdapterDurationMs: totalDuration,
        });

        streamObjResult.object
            .then((fullObject: any) => {
                console.log(
                    `[TRACE] [AnalysisComplete] persona=${persona.name}, scores=${JSON.stringify({ clarity: fullObject.scores?.clarity, trust: fullObject.scores?.trust, buyIntent: fullObject.scores?.buyIntent })}, risks=${fullObject.risks?.length ?? 0}`
                );
            })
            .catch(() => { });
        return streamObjResult;
    }

    async isPricingVisible(screenshotBase64: string, runId?: string): Promise<boolean> {
        const log = runId ? AnalysisLogger.forRun(runId) : null;
        log?.trace("VisionAnalysisAdapter", "isPricingVisible called", {
            screenshotLength: screenshotBase64.length,
        });

        const prompt = `Can you see the pricing (tiers, dollar amounts, or plan names) in roughly the center of this screen?
            Return ONLY the word "TRUE" if it is clearly visible, or "FALSE" if it is not. No other text.`;

        const callStart = Date.now();
        const result = await this.llmService.withRetry(async () => {
            const resp = await LlmServiceImpl.limiter(() =>
                this.llmService.client.chat.completions.create({
                    model: this.llmService.scoutVisionModel,
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: prompt },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: `data:image/jpeg;base64,${screenshotBase64}`,
                                    },
                                },
                            ],
                        },
                    ],
                    max_tokens: 10,
                    temperature: 0,
                }),
            );

            const content =
                resp?.choices?.[0]?.message?.content?.toUpperCase().trim() || "FALSE";
            return content.includes("TRUE");
        });
        const duration = Date.now() - callStart;

        log?.info("VisionAnalysisAdapter", `isPricingVisible result`, {
            result,
            model: this.llmService.scoutVisionModel,
            durationMs: duration,
        });

        return result;
    }

    async isPricingVisibleInHtml(html: string, runId?: string): Promise<PricingLocation> {
        const log = runId ? AnalysisLogger.forRun(runId) : null;
        log?.trace("VisionAnalysisAdapter", "isPricingVisibleInHtml called", {
            htmlLength: html.length,
        });

        const prompt = `Analyze if the following text contains pricing information (plans, prices, etc.).
        
        TEXT:
        """\n${html}\n"""
        
        Return a JSON object with the following structure:
        {
          "found": boolean,
          "selector": string | null,
          "anchorText": string | null,
          "reasoning": string
        }
        
        Return ONLY valid JSON.`;

        const callStart = Date.now();
        const content = await this.llmService.createChatCompletion(
            [{ role: "user", content: prompt }],
            {
                temperature: 0,
                model: this.llmService.smallTextModel,
                response_format: { type: "json_object" },
                purpose: "Scouting HTML",
            },
        );

        try {
            const result = JSON.parse(content);
            const duration = Date.now() - callStart;
            log?.info("VisionAnalysisAdapter", `isPricingVisibleInHtml result`, {
                found: result.found,
                selector: result.selector || null,
                anchorText: result.anchorText || null,
                reasoning: result.reasoning,
                durationMs: duration,
            });
            return {
                found: !!result.found,
                selector: result.selector || undefined,
                anchorText: result.anchorText || undefined,
                reasoning: result.reasoning
            };
        } catch (e) {
            log?.warn("VisionAnalysisAdapter", "isPricingVisibleInHtml failed to parse LLM response", {
                error: String(e),
                contentPreview: content.slice(0, 200),
            });
            return { found: false, reasoning: "Failed to parse LLM response" };
        }
    }

    async analyzePricingPageCompletion(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options: { tokenLimit?: number; runId?: string } = {}
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const methodStart = Date.now();

        log?.info("VisionAnalysisAdapter", `analyzePricingPageCompletion (AUDIT) START for "${persona.name}"`, {
            tokenLimit,
            hasHtml: !!pageHtml,
            htmlLength: pageHtml?.length || 0,
            screenshotLength: screenshotBase64.length,
        });

        this.ensureIngested(persona, options.runId);

        const query = pageHtml ? `Pricing page about ${pageHtml.slice(0, 200)}` : "Evaluating a pricing page";
        const ragStart = Date.now();
        const ragContext = this.ragService.retrieveContext(persona, query, 3);
        const ragDuration = Date.now() - ragStart;
        log?.info("VisionAnalysisAdapter", `[AUDIT] ID-RAG retrieval for "${persona.name}"`, {
            chunkCount: ragContext.chunkCount,
            contextStringLength: ragContext.contextString.length,
            durationMs: ragDuration,
        });

        const compileStart = Date.now();
        const compartments = this.promptCompiler.compileSystemPrompt(persona);
        const personaAnchor = this.promptCompiler.generateAnchor(persona);
        const compileDuration = Date.now() - compileStart;
        log?.info("VisionAnalysisAdapter", `[AUDIT] Prompt compilation for "${persona.name}"`, {
            compartmentsLength: compartments.length,
            anchor: personaAnchor,
            durationMs: compileDuration,
        });

        const system = `You are a specialized JSON-only agent evaluating a pricing page as a specific persona.
        
        ${compartments}
        
        <<ANALYSIS TASK>>
        You are looking at a pricing page. You have been provided with:
        1. A screenshot of the exact viewport containing the pricing.
        2. A verified factual summary of the page's HTML (including product info, tier data, and fine print).
        
        ${ragContext.contextString ? `<<RETRIEVED MEMORY>>\n${ragContext.contextString}\n` : ""}

        <<VOICE AND AUDIENCE>>
        You are writing a JSON report with two distinct audiences:
        1. MOST FIELDS (gutReaction, thoughts, risks, scores, aiSuggestion): You speak AS the persona in first person. "I think...", "This concerns me...", "I'd want to see..."
        2. RECOMMENDATIONS: You write TO the company as an external advisor. Imperative sentences, no first person. "Add a monthly billing option.", "Remove the annual lock-in.", "Publish a clear refund policy."
        
        WRONG (self-advice): "Check if the Pro plan includes a free trial."
        WRONG (self-advice): "Look for a job search section on the site."
        CORRECT (company directive): "Offer a free trial on the Pro plan."
        CORRECT (company directive): "Add a job search or career section."
        
        <<PERSONALITY BIAS APPLICATION>>
        Your personality profile drives how you evaluate. Apply it aggressively:
        - Your Neuroticism determines how many risks you flag and how severe.
        - Your Conscientiousness determines how much fine print you read.
        - Your Openness determines whether new features excite or concern you.
        - Your Extraversion determines whether you seek team validation.
        - Your Agreeableness determines whether you give benefit of doubt.
        These are WHO YOU ARE. Your scores must reflect your personality.
        
        <<OPENNESS PRIMING>>
        ${personaAnchor} You're open to this. You're approaching this as someone who COULD use a tool like this. A skeptical but fair assessment.
        
        CALIBRATION — Let YOUR pricing sensitivity, domain expertise, and typical budget drive your reaction.
        
        STRICT OUTPUT RULES:
        - Respond ONLY with a valid JSON object following the PricingAnalysis schema.
        - Use standard JSON double quotes (") for all keys and string values.
        - Escape any literal double quotes within strings using a backslash (\").
        - NO conversational preamble. NO monologue. NO text before or after the JSON.
        - The 'thoughts' field MUST be limited to roughly ${Math.floor(tokenLimit * 0.75)} tokens.
        - RISKS: Limit to 3 items. Write from your (the persona's) perspective — what concerns you about this page? Ground each risk in something specific.
        - RECOMMENDATIONS: 2-3 imperatives directed AT THE COMPANY. What should they change on their pricing page? Do NOT write as the persona reflecting on their own buying decision.
        - AI SUGGESTION: ONE persona-specific actionable insight in YOUR (the persona's) voice. THE ONE THING this company should change to win YOU over. Reference something specific on the page.
        - For every score, provide both the number AND a 1-2 sentence reason.
         - NO REPETITION: Do NOT repeat information across different fields.
         
         STRUCTURED THOUGHTS FORMAT:
         Inside your 'thoughts' field, structure your analysis using these markers:
         [The Good] — What works well. Specific positive observations.
         [The Bad] — What doesn't work. Specific criticisms.
         [The Dealbreaker] — The single biggest reason you would NOT buy.
         
         INTENT FUNNEL: explorationIntent >= analysisIntent >= buyIntent.
        - explorationIntent: Would you explore this further?
        - analysisIntent: Would you deep-dive or trial it?
        - buyIntent: Would you actually purchase?
        
        SCORES → REASONS → NARRATIVE. Each score needs a rationale.
        
        Different personas MUST give DIFFERENT scores based on their unique Big Five, values, and fears.
        Consistency is mandatory. If you feel skeptical, your scores must reflect that.
        
        Be blunt, honest, and natural. Be your persona.`;

        try {
            log?.info("VisionAnalysisAdapter", `[AUDIT] Sending schema-guided completion for "${persona.name}"...`, {
                model: this.llmService.visionModel,
                systemPromptLength: system.length,
                maxTokens: tokenLimit,
            });

            const MAX_RETRIES = 2;
            const RETRY_DELAY_MS = 2_000;
            const prompt = `Evaluate this pricing page. ${pageHtml ? `\n\nPAGE FACT SUMMARY:\n"""\n${pageHtml}\n"""` : ""}`;
            const ANALYSIS_TIMEOUT_MS = 180_000;

            let analysisObj: any = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (attempt > 0) {
                    log?.info("VisionAnalysisAdapter", `[AUDIT] Retry attempt ${attempt}/${MAX_RETRIES} for "${persona.name}" — waiting ${RETRY_DELAY_MS}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
                }

                const completionStart = Date.now();
                const streamResult = streamObject({
                    model: this.llmService.provider(this.llmService.visionModel),
                    schema: PricingAnalysisSchema,
                    schemaName: "PricingAnalysis",
                    schemaDescription: "A detailed evaluation of a pricing page from a persona's perspective.",
                    system,
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: prompt },
                                { type: "image", image: screenshotBase64 },
                            ],
                        },
                    ],
                    temperature: 0.1,
                    maxTokens: tokenLimit,
                } as any);
                // Drain the partial stream (keeps the pipeline flowing — without a consumer,
                // streamObject's internal TransformStream stalls) while racing against a
                // timeout so a hanging LLM never blocks the queue permanently.
                // Drain the stream in the background WITH a catch handler — when the
                // timeout wins the race, the loser's streamResult.object must be caught
                // to prevent an unhandled promise rejection (the LLM may still respond).
                const drainAndResolve = (async () => {
                    for await (const _ of streamResult.partialObjectStream) {
                        // Discard partials — we only need the final validated object.
                    }
                    return streamResult.object;
                })().catch(() => null);
                analysisObj = await Promise.race([
                    drainAndResolve,
                    new Promise<any>((_, reject) =>
                        setTimeout(
                            () => reject(new Error(`Analysis timed out after ${ANALYSIS_TIMEOUT_MS}ms`)),
                            ANALYSIS_TIMEOUT_MS,
                        ),
                    ),
                ]);

                if (analysisObj) break;

                log?.warn("VisionAnalysisAdapter", `[AUDIT] Null result for "${persona.name}" on attempt ${attempt + 1}/${MAX_RETRIES + 1} — will ${attempt < MAX_RETRIES ? "retry" : "fall through to fallback"}`);
            }

            const completionDuration = Date.now() - methodStart;
            log?.info("VisionAnalysisAdapter", `[AUDIT] Analysis completed for "${persona.name}"`, {
                durationMs: completionDuration,
                scores: analysisObj.scores ? {
                    clarity: analysisObj.scores.clarity,
                    valuePerception: analysisObj.scores.valuePerception,
                    trust: analysisObj.scores.trust,
                    explorationIntent: analysisObj.scores.explorationIntent,
                    analysisIntent: analysisObj.scores.analysisIntent,
                    buyIntent: analysisObj.scores.buyIntent,
                } : null,
            });
            console.log(`[TRACE] [AnalysisComplete] persona=${persona.name}, scores=${JSON.stringify(analysisObj.scores)}, risks=${analysisObj.risks?.length ?? 0}`);
            return analysisObj;
        } catch (e) {
            const totalDuration = Date.now() - methodStart;
            log?.error("VisionAnalysisAdapter", `[AUDIT] Error for "${persona.name}"`, {
                error: String(e),
                totalDurationMs: totalDuration,
            });
            return {
                gutReaction:
                    "Overall, this audit could not be completed due to a system issue.",
                thoughts: "An error occurred during pricing analysis.",
                scores: {
                    clarity: 1,
                    clarityReason: "System error — analysis could not be completed.",
                    valuePerception: 1,
                    valuePerceptionReason: "System error — analysis could not be completed.",
                    trust: 1,
                    trustReason: "System error — analysis could not be completed.",
                    explorationIntent: 1,
                    explorationIntentReason: "System error — analysis could not be completed.",
                    analysisIntent: 1,
                    analysisIntentReason: "System error — analysis could not be completed.",
                    buyIntent: 1,
                    buyIntentReason: "System error — analysis could not be completed.",
                },
                risks: ["[SYSTEM] LLM completion or analysis failed"],
                recommendations: [],
                aiSuggestion: "System error — analysis could not be completed.",
            };
        }
    }

    private buildStreamOfConsciousnessSystemPrompt(
        persona: Persona,
        compartments: string,
        personaAnchor: string,
        ragContextString: string
    ): string {
        return `You are a persona evaluating a pricing page. Think aloud as this persona.

${compartments}

${ragContextString ? `<<RETRIEVED MEMORY>>\n${ragContextString}\n` : ""}

<<ANALYSIS TASK>>
You are looking at a pricing page. You have been provided with:
1. A screenshot of the exact viewport containing the pricing.
2. A verified factual summary of the page's HTML.

<<VOICE AND AUDIENCE>>
Write as the persona in FIRST PERSON. "I think...", "This concerns me...", "I'd want to see..."

<<PERSONALITY BIAS APPLICATION>>
Your personality profile drives how you evaluate. Apply it aggressively:
- Your Neuroticism determines how many risks you flag and how severe.
- Your Conscientiousness determines how much fine print you read.
- Your Openness determines whether new features excite or concern you.
- Your Extraversion determines whether you seek team validation.
- Your Agreeableness determines whether you give benefit of doubt.
These are WHO YOU ARE.

<<OPENNESS PRIMING>>
${personaAnchor} You're open to this. You're approaching this as someone who COULD genuinely use a tool like this. You're not looking for reasons to reject it — you're evaluating honestly, looking for what works and what doesn't. A skeptical but fair assessment.

CALIBRATION — Your evaluation should be consistent with your own pricing sensitivity and typical budget.

Write your raw, unfiltered stream of consciousness. Structure it using:
[The Good] — What works well. Specific positive observations.
[The Bad] — What doesn't work. Specific criticisms.
[The Dealbreaker] — The single biggest reason you would NOT buy.

Be blunt, honest, and natural. Be your persona. Write freely — no JSON, no formatting constraints.`;
    }

    async generateStreamOfConsciousness(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options: { tokenLimit?: number; runId?: string } = {}
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const methodStart = Date.now();
        const TIMEOUT_MS = 120_000;

        log?.info("VisionAnalysisAdapter", `generateStreamOfConsciousness START for "${persona.name}"`, {
            tokenLimit,
            hasHtml: !!pageHtml,
        });

        this.ensureIngested(persona, options.runId);

        const ragStart = Date.now();
        const query = pageHtml ? `Pricing page about ${pageHtml.slice(0, 200)}` : "Evaluating a pricing page";
        const ragContext = this.ragService.retrieveContext(persona, query, 3);
        const ragDuration = Date.now() - ragStart;
        log?.info("VisionAnalysisAdapter", `ID-RAG retrieval for "${persona.name}"`, {
            chunkCount: ragContext.chunkCount,
            durationMs: ragDuration,
        });

        const compartments = this.promptCompiler.compileSystemPrompt(persona);
        const personaAnchor = this.promptCompiler.generateAnchor(persona);

        const system = this.buildStreamOfConsciousnessSystemPrompt(
            persona,
            compartments,
            personaAnchor,
            ragContext.contextString
        );

        const prompt = `Evaluate this pricing page. Think aloud as ${persona.name}. ${pageHtml ? `\n\nPAGE FACT SUMMARY:\n"""\n${pageHtml}\n"""` : ""}`;

        log?.info("VisionAnalysisAdapter", `Calling LLM for stream of consciousness for "${persona.name}"...`, {
            model: this.llmService.visionModel,
            systemPromptLength: system.length,
        });

        const text = await Promise.race([
            this.llmService.createChatCompletion(
                [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` } },
                        ] as any,
                    },
                ],
                {
                    temperature: 0.4,
                    max_tokens: tokenLimit,
                    model: this.llmService.visionModel,
                    purpose: `Stream of Consciousness — ${persona.name}`,
                    runId: options.runId,
                }
            ),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`Stream of consciousness timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
            ),
        ]);

        const duration = Date.now() - methodStart;
        log?.info("VisionAnalysisAdapter", `generateStreamOfConsciousness completed for "${persona.name}"`, {
            durationMs: duration,
            textLength: text.length,
        });

        return {
            text,
            personaId: persona.id,
            personaName: persona.name,
        };
    }

    private buildFormatterSystemPrompt(
        persona: Persona,
        compartments: string
    ): string {
        return `Extract the user stream-of-consciousness into a valid PricingAnalysis object matching the schema.

${compartments}

Formatting Rules:
1. "gutReaction", "thoughts", "risks", "scores": Speak in FIRST PERSON ("I", "my") as the persona.
2. "recommendations", "aiSuggestion": Write IMPERATIVE directives for the COMPANY starting with action verbs.
3. "thoughts": Must format value as "[The Good] ... [The Bad] ... [The Dealbreaker] ...".
4. "scores": Ensure intent funnel holds: explorationIntent >= analysisIntent >= buyIntent.`;
    }

    async formatStreamOfConsciousness(
        persona: Persona,
        stream: { text: string; personaId: string; personaName: string },
        options: { tokenLimit?: number; runId?: string } = {}
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const methodStart = Date.now();
        const TIMEOUT_MS = 90_000;
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 2_000;

        log?.info("VisionAnalysisAdapter", `formatStreamOfConsciousness START for "${persona.name}"`, {
            streamLength: stream.text.length,
        });

        const compartments = this.promptCompiler.compileSystemPrompt(persona);
        const system = this.buildFormatterSystemPrompt(persona, compartments);

        const prompt = `Here is the raw stream of consciousness from ${persona.name}:

---
${stream.text}
---

Convert this into a structured PricingAnalysis JSON object. Return ONLY the JSON.`;

        let analysisObj: any = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log?.info("VisionAnalysisAdapter", `formatStreamOfConsciousness retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            }

            log?.info("VisionAnalysisAdapter", `Calling streamObject for formatter for "${persona.name}" (attempt ${attempt + 1})...`, {
                model: this.llmService.textModel,
                systemPromptLength: system.length,
            });

            try {
                const streamResult = streamObject({
                    model: this.llmService.provider(this.llmService.textModel),
                    schema: PricingAnalysisSchema,
                    schemaName: "PricingAnalysis",
                    schemaDescription: "A detailed evaluation of a pricing page from a persona's perspective.",
                    system,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    maxTokens: tokenLimit,
                } as any);

                const drainAndResolve = (async () => {
                    for await (const _ of streamResult.partialObjectStream) {
                        // discard
                    }
                    return streamResult.object;
                })().catch(() => null);

                analysisObj = await Promise.race([
                    drainAndResolve,
                    new Promise<any>((_, reject) =>
                        setTimeout(() => reject(new Error(`Formatter timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
                    ),
                ]);

                if (analysisObj) break;
            } catch (e) {
                log?.warn("VisionAnalysisAdapter", `formatStreamOfConsciousness attempt ${attempt + 1} failed for "${persona.name}"`, {
                    error: String(e),
                });
                if (attempt === MAX_RETRIES) throw e;
            }
        }

        const duration = Date.now() - methodStart;
        log?.info("VisionAnalysisAdapter", `formatStreamOfConsciousness completed for "${persona.name}"`, {
            durationMs: duration,
            scores: analysisObj?.scores,
        });

        if (!analysisObj) {
            throw new Error(`Formatter returned null for "${persona.name}"`);
        }

        return analysisObj;
    }

    private buildSummarizerSystemPrompt(persona: Persona): string {
        return `You are a summarizer. Given a persona's raw analysis of a pricing page, produce 3-5 concise bullet points.

Each bullet should be one sentence, capturing the most important finding.
Focus on: what the persona liked, what concerned them, and their overall recommendation.

Format: Return ONLY a JSON array of strings. No preamble. Example: ["Bullet 1", "Bullet 2", "Bullet 3"]`;
    }

    async summarizeStreamOfConsciousness(
        persona: Persona,
        stream: { text: string; personaId: string; personaName: string },
        options: { runId?: string } = {}
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const methodStart = Date.now();
        const TIMEOUT_MS = 60_000;

        log?.info("VisionAnalysisAdapter", `summarizeStreamOfConsciousness START for "${persona.name}"`);

        const system = this.buildSummarizerSystemPrompt(persona);

        const prompt = `Summarize this analysis from ${persona.name} into 3-5 bullet points:

---
${stream.text}
---

Return ONLY a JSON array of strings.`;

        const content = await Promise.race([
            this.llmService.createChatCompletion(
                [{ role: "user", content: prompt }],
                {
                    temperature: 0.1,
                    model: this.llmService.smallTextModel,
                    response_format: { type: "json_object" },
                    purpose: `Summarize — ${persona.name}`,
                    runId: options.runId,
                }
            ),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`Summarizer timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
            ),
        ]);

        const duration = Date.now() - methodStart;
        try {
            const parsed = JSON.parse(content);
            const bullets = Array.isArray(parsed) ? parsed : parsed.bullets || parsed.summary || [];
            log?.info("VisionAnalysisAdapter", `summarizeStreamOfConsciousness completed for "${persona.name}"`, {
                durationMs: duration,
                bulletCount: bullets.length,
            });
            return bullets.filter((b: unknown) => typeof b === "string");
        } catch {
            log?.warn("VisionAnalysisAdapter", `summarizeStreamOfConsciousness parse failed for "${persona.name}"`, {
                contentPreview: content.slice(0, 200),
            });
            return [];
        }
    }

    // ─── New artifact-agnostic pipeline (5 cognitive stages) ────────────────

    private buildCognitiveStreamSystemPrompt(
        persona: Persona,
        compartments: string,
        personaAnchor: string,
        ragContextString: string,
        businessGoal: string,
        researchQuestion: string,
    ): string {
        return `You are a persona experiencing an artifact. Think aloud as this persona.

${compartments}

${ragContextString ? `<<RETRIEVED MEMORY>>\n${ragContextString}\n` : ""}

<<ARTIFACT CONTEXT>>
You are looking at a user experience — a page, a flow, or a design. You have been provided with:
1. A screenshot of what the user sees.
2. A factual summary of the content.

<<BUSINESS CONTEXT>>
The creator of this artifact wants to accomplish: ${businessGoal}

You are not here to evaluate design. You are here to react honestly as yourself.

<<VOICE AND AUDIENCE>>
Write as the persona in FIRST PERSON. "I think...", "This concerns me...", "I'd want to see..."

<<PERSONALITY BIAS APPLICATION>>
Your personality profile drives how you react:
- Your Neuroticism determines what concerns or worries you pick up on.
- Your Conscientiousness determines how closely you examine details.
- Your Openness determines whether new concepts excite or concern you.
- Your Extraversion determines whether you think about what others would say.
- Your Agreeableness determines whether you give benefit of doubt.
These are WHO YOU ARE.

<<OPENNESS PRIMING>>
${personaAnchor} You're open to this. You're approaching this as someone who COULD genuinely engage with this. You're not looking for reasons to reject it — you're reacting honestly. A skeptical but fair assessment.

Think through your mental state as you experience this artifact. For each stage, answer the cognitive question — not what you saw, but what you thought.

1. INTERPRETATION — What did I initially believe this product or page was? (Not: what did I see first. Answer: my first impression of what this is and who it might be for.)
2. UNDERSTANDING — What became clear? What remained confusing?
3. BELIEF — Which claims, signals, or details increased or decreased trust?
4. MOTIVATION — Did this become valuable enough for me to continue? Why or why not?
5. ACTION — What exact next step would I, this persona, take?

IMPORTANT: Your personality profile (Big Five, values, fears) is synthetic. It may contextualize your reactions but it does not cause them. Describe what you observe and how you feel — do not explain your behavior using personality labels.

Think as your persona. Narrate your thinking, not your browsing. Write freely — no JSON, no formatting constraints.`;
    }

    private buildArtifactAnalysisSystemPrompt(
        persona: Persona,
        compartments: string,
        personaAnchor: string,
        ragContextString: string,
        businessGoal: string,
        researchQuestion: string,
    ): string {
        return `You are a persona reacting to an artifact. Produce a structured PersonaResponse as this persona.

${compartments}

${ragContextString ? `<<RETRIEVED MEMORY>>\n${ragContextString}\n` : ""}

<<ARTIFACT CONTEXT>>
You are looking at a user experience — a page, a flow, or a design. You have been provided with:
1. A screenshot of what the user sees.
2. A factual summary of the content.

<<BUSINESS CONTEXT>>
The creator of this artifact wants to accomplish: ${businessGoal}

You are not here to evaluate design. You are here to react honestly as yourself.

<<VOICE AND AUDIENCE>>
ALL fields are in FIRST PERSON as the persona — the report IS the persona's experience. "I think...", "This concerns me...", "I'd want to see..."

<<PERSONALITY GUIDE>>
Your personality profile (Big Five, values, fears) is synthetic. It may contextualize your reactions but does not cause them. Describe what you observe and feel — do not explain behavior using personality labels.

<<OPENNESS PRIMING>>
${personaAnchor} You're open to this. A skeptical but fair assessment.

Reason through your mental state, then output the complete PersonaResponse JSON with exactly 5 journey stages in this order:

1. interpretation — What did I initially believe this product or page was?
2. understanding — What became clear? What remained confusing?
3. belief — Which claims, signals, or details increased or decreased trust?
4. motivation — Did this become valuable enough for me to continue? Why or why not?
5. action — What exact next step would I, this persona, take?

The customerJourney array MUST have exactly one entry per stage, in this order. Do NOT repeat stages. Do NOT skip stages. Do NOT reorder them.

RESEARCH QUESTION: ${researchQuestion}

Your task is to output a valid structured JSON object matching the PersonaResponse schema.
Do NOT produce any text outside the JSON object.`;
    }

    private buildPersonaResponseFormatterSystemPrompt(
        persona: Persona,
        compartments: string,
        businessGoal: string,
        researchQuestion: string,
    ): string {
        return `Extract the persona's raw reasoning into a structured PersonaResponse object.

${compartments}

Business Goal: ${businessGoal}
Research Question: ${researchQuestion}

CRITICAL RULES — Follow these exactly:

1. ALL fields are in FIRST PERSON as the persona — the report IS the persona's experience.
2. The customerJourney array MUST have exactly 5 entries, one per cognitive stage, IN THIS EXACT ORDER: interpretation, understanding, belief, motivation, action. Do NOT repeat stages. Do NOT skip stages. Do NOT put them out of order.
3. For each stage: describe the persona's mental state — what they thought, felt, and believed at that stage. Do NOT describe what they saw chronologically.
4. majorFindings: extract 2-4 specific observations. Each must have: observation (what happened), evidence (what the persona said or did), impact (why it matters). Do NOT include confidence — it is computed from agreement across personas.
5. Do NOT use persona traits (Big Five, values, fears) as causal explanations. Persona attributes may contextualize behavior but cannot explain it. Say "Jeremy, a student persona, paused at pricing uncertainty" — NOT "Jeremy's neuroticism caused him to distrust pricing." The persona profile itself is synthetic; using it as causal evidence is circular.
6. researchQuestionAnswer: describe what evidence was observed, not what the company should do. Say "Jeremy showed interest but had insufficient pricing information to evaluate value" — NOT "They should add a pricing tier."
7. overview: one paragraph capturing the single most important takeaway.

Follow these rules strictly. Findings describe observed behavior, not inferred psychology.`;
    }

    async generateCognitiveStream(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string } = {},
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const TIMEOUT_MS = 120_000;
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 3_000;

        log?.info("VisionAnalysisAdapter", `generateCognitiveStream START for "${persona.name}"`, { tokenLimit });

        this.ensureIngested(persona, options.runId);

        const ragStart = Date.now();
        const query = context.summary ? `Artifact about ${context.summary.slice(0, 200)}` : "Experiencing an artifact";
        const ragContext = this.ragService.retrieveContext(persona, query, 3);
        log?.info("VisionAnalysisAdapter", `ID-RAG retrieval for "${persona.name}"`, {
            chunkCount: ragContext.chunkCount,
            durationMs: Date.now() - ragStart,
        });

        const compartments = this.promptCompiler.compileSystemPrompt(persona);
        const personaAnchor = this.promptCompiler.generateAnchor(persona);

        const system = this.buildCognitiveStreamSystemPrompt(
            persona, compartments, personaAnchor, ragContext.contextString, businessGoal, researchQuestion,
        );

        const prompt = `Experience this artifact. Think aloud as ${persona.name}.${context.summary ? `\n\nPAGE FACT SUMMARY:\n"""\n${context.summary}\n"""` : ""}`;

        log?.info("VisionAnalysisAdapter", `Calling LLM for cognitive stream for "${persona.name}"...`, {
            model: this.llmService.visionModel,
            systemPromptLength: system.length,
        });

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log?.warn("VisionAnalysisAdapter", `generateCognitiveStream retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            }

            try {
                const text = await Promise.race([
                    this.llmService.createChatCompletion(
                        [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: prompt },
                                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${context.screenshotBase64}` } },
                                ] as any,
                            },
                        ],
                        {
                            temperature: 0.4,
                            max_tokens: tokenLimit,
                            model: this.llmService.visionModel,
                            purpose: `Cognitive Stream — ${persona.name}`,
                            runId: options.runId,
                        }
                    ),
                    new Promise<string>((_, reject) =>
                        setTimeout(() => reject(new Error(`Cognitive stream timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
                    ),
                ]);

                log?.info("VisionAnalysisAdapter", `generateCognitiveStream completed for "${persona.name}"`, {
                    durationMs: Date.now() - ragStart,
                    textLength: text.length,
                });

                return {
                    text,
                    personaId: persona.id,
                    personaName: persona.name,
                };
            } catch (e) {
                lastError = e as Error;
                log?.warn("VisionAnalysisAdapter", `generateCognitiveStream attempt ${attempt + 1} failed for "${persona.name}"`, {
                    error: String(e),
                });
                if (attempt === MAX_RETRIES) throw lastError;
            }
        }

        throw lastError || new Error("generateCognitiveStream failed after all retries");
    }

    async formatPersonaResponse(
        persona: Persona,
        stream: { text: string; personaId: string; personaName: string },
        businessGoal: string,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string } = {},
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const TIMEOUT_MS = 90_000;
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 2_000;

        log?.info("VisionAnalysisAdapter", `formatPersonaResponse START for "${persona.name}"`, {
            streamLength: stream.text.length,
        });

        const compartments = this.promptCompiler.compileSystemPrompt(persona);
        const system = this.buildPersonaResponseFormatterSystemPrompt(persona, compartments, businessGoal, researchQuestion);

        const prompt = `Here is the raw cognitive stream from ${persona.name}:

---
${stream.text}
---

Convert this into a structured PersonaResponse JSON object. Return ONLY the JSON.`;

        let responseObj: any = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log?.info("VisionAnalysisAdapter", `formatPersonaResponse retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            }

            try {
                const streamResult = streamObject({
                    model: this.llmService.provider(this.llmService.textModel),
                    schema: PersonaResponseSchema,
                    schemaName: "PersonaResponse",
                    schemaDescription: "A persona's structured response to an artifact based on five cognitive stages.",
                    system,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    maxTokens: tokenLimit,
                } as any);

                const drainAndResolve = (async () => {
                    for await (const _ of streamResult.partialObjectStream) {
                        // discard
                    }
                    return streamResult.object;
                })().catch(() => null);

                responseObj = await Promise.race([
                    drainAndResolve,
                    new Promise<any>((_, reject) =>
                        setTimeout(() => reject(new Error(`Formatter timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
                    ),
                ]);

                if (responseObj) break;
            } catch (e) {
                log?.warn("VisionAnalysisAdapter", `formatPersonaResponse attempt ${attempt + 1} failed for "${persona.name}"`, {
                    error: String(e),
                });
                if (attempt === MAX_RETRIES) throw e;
            }
        }

        if (!responseObj) {
            throw new Error(`formatPersonaResponse returned null for "${persona.name}"`);
        }

        log?.info("VisionAnalysisAdapter", `formatPersonaResponse completed for "${persona.name}"`, {
            durationMs: Date.now() - (options.runId ? 0 : 0),
        });

        return responseObj as PersonaResponse;
    }

    async deriveResponseSignals(
        persona: Persona,
        stream: { text: string; personaId: string; personaName: string },
        options: { runId?: string } = {},
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const TIMEOUT_MS = 60_000;

        log?.info("VisionAnalysisAdapter", `deriveResponseSignals START for "${persona.name}"`);

        const system = `You are a signal extractor. Given a persona's cognitive stream about an artifact, extract key signals.

Each signal should be one concise sentence capturing what happened.

Return ONLY a JSON object:
{
  "highestStageReached": "interpretation" | "understanding" | "belief" | "motivation" | "action",
  "finalAction": "What the persona would actually do next — one sentence in first person",
  "keySignals": ["Signal 1", "Signal 2", "Signal 3"]
}`;

        const prompt = `Extract signals from this cognitive stream by ${persona.name}:

---
${stream.text}
---

Return ONLY the JSON object.`;

        const content = await Promise.race([
            this.llmService.createChatCompletion(
                [{ role: "user", content: prompt }],
                {
                    temperature: 0.1,
                    model: this.llmService.smallTextModel,
                    response_format: { type: "json_object" },
                    purpose: `Derive signals — ${persona.name}`,
                    runId: options.runId,
                }
            ),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`Signal derivation timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
            ),
        ]);

        try {
            const parsed = JSON.parse(content);
            log?.info("VisionAnalysisAdapter", `deriveResponseSignals completed for "${persona.name}"`, {
                highestStageReached: parsed.highestStageReached,
                finalAction: parsed.finalAction?.slice(0, 100),
                signalCount: parsed.keySignals?.length,
            });
            return {
                highestStageReached: parsed.highestStageReached || "unknown",
                finalAction: parsed.finalAction || "",
                keySignals: Array.isArray(parsed.keySignals) ? parsed.keySignals : [],
            };
        } catch {
            log?.warn("VisionAnalysisAdapter", `deriveResponseSignals parse failed for "${persona.name}"`, {
                contentPreview: content.slice(0, 200),
            });
            return {
                highestStageReached: "unknown",
                finalAction: "",
                keySignals: [],
            };
        }
    }

    async analyzeArtifactStream(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string } = {},
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;

        log?.info("VisionAnalysisAdapter", `analyzeArtifactStream START for "${persona.name}"`, { tokenLimit });

        this.ensureIngested(persona, options.runId);

        const ragStart = Date.now();
        const query = context.summary
            ? `Artifact about ${context.summary.slice(0, 200)}`
            : "Experiencing an artifact";
        const ragContext = this.ragService.retrieveContext(persona, query, 3);
        const ragDuration = Date.now() - ragStart;
        log?.info("VisionAnalysisAdapter", `ID-RAG retrieval for "${persona.name}"`, {
            chunkCount: ragContext.chunkCount,
            contextStringLength: ragContext.contextString.length,
            durationMs: ragDuration,
        });

        const compartments = this.promptCompiler.compileSystemPrompt(persona);
        const personaAnchor = this.promptCompiler.generateAnchor(persona);

        const system = this.buildArtifactAnalysisSystemPrompt(
            persona, compartments, personaAnchor, ragContext.contextString, businessGoal, researchQuestion,
        );

        const prompt = `Experience this artifact. Return ONLY the JSON object.${
            context.summary ? `\n\nPAGE FACT SUMMARY:\n"""\n${context.summary}\n"""` : ""
        }`;

        log?.info("VisionAnalysisAdapter", `Calling streamObject for artifact stream for "${persona.name}"...`, {
            model: this.llmService.visionModel,
            systemPromptLength: system.length,
            promptLength: prompt.length,
            maxTokens: tokenLimit,
        });

        const streamObjResult = streamObject({
            model: this.llmService.provider(this.llmService.visionModel),
            schema: PersonaResponseSchema,
            schemaName: "PersonaResponse",
            schemaDescription: "A persona's structured response to an artifact based on five cognitive stages.",
            system,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image", image: context.screenshotBase64 },
                    ],
                },
            ],
            temperature: 0.4,
            maxTokens: tokenLimit,
        } as any);

        streamObjResult.object
            .then((fullObject: any) => {
                console.log(
                    `[TRACE] [AnalysisComplete] persona=${persona.name}, stages=${fullObject.customerJourney?.length ?? 0}, findings=${fullObject.majorFindings?.length ?? 0}`
                );
            })
            .catch(() => {});

        return streamObjResult;
    }

    async analyzeArtifactCompletion(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string } = {},
    ) {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const methodStart = Date.now();

        log?.info("VisionAnalysisAdapter", `analyzeArtifactCompletion START for "${persona.name}"`, { tokenLimit });

        this.ensureIngested(persona, options.runId);

        const ragStart = Date.now();
        const query = context.summary
            ? `Artifact about ${context.summary.slice(0, 200)}`
            : "Experiencing an artifact";
        const ragContext = this.ragService.retrieveContext(persona, query, 3);
        const ragDuration = Date.now() - ragStart;
        log?.info("VisionAnalysisAdapter", `ID-RAG retrieval for "${persona.name}"`, {
            chunkCount: ragContext.chunkCount,
            durationMs: ragDuration,
        });

        const compartments = this.promptCompiler.compileSystemPrompt(persona);
        const personaAnchor = this.promptCompiler.generateAnchor(persona);

        const system = this.buildArtifactAnalysisSystemPrompt(
            persona, compartments, personaAnchor, ragContext.contextString, businessGoal, researchQuestion,
        );

        const prompt = `Experience this artifact.${
            context.summary ? `\n\nPAGE FACT SUMMARY:\n"""\n${context.summary}\n"""` : ""
        }`;

        try {
            const MAX_RETRIES = 2;
            const RETRY_DELAY_MS = 2_000;
            const ANALYSIS_TIMEOUT_MS = 180_000;

            let responseObj: any = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (attempt > 0) {
                    log?.info("VisionAnalysisAdapter", `analyzeArtifactCompletion retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
                    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
                }

                const streamResult = streamObject({
                    model: this.llmService.provider(this.llmService.visionModel),
                    schema: PersonaResponseSchema,
                    schemaName: "PersonaResponse",
                    schemaDescription: "A persona's structured response to an artifact based on five cognitive stages.",
                    system,
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: prompt },
                                { type: "image", image: context.screenshotBase64 },
                            ],
                        },
                    ],
                    temperature: 0.1,
                    maxTokens: tokenLimit,
                } as any);

                const drainAndResolve = (async () => {
                    for await (const _ of streamResult.partialObjectStream) {
                        // discard
                    }
                    return streamResult.object;
                })().catch(() => null);

                responseObj = await Promise.race([
                    drainAndResolve,
                    new Promise<any>((_, reject) =>
                        setTimeout(() => reject(new Error(`Analysis timed out after ${ANALYSIS_TIMEOUT_MS}ms`)), ANALYSIS_TIMEOUT_MS)
                    ),
                ]);

                if (responseObj) break;
            }

            const completionDuration = Date.now() - methodStart;
            log?.info("VisionAnalysisAdapter", `analyzeArtifactCompletion completed for "${persona.name}"`, {
                durationMs: completionDuration,
                stages: responseObj?.customerJourney?.length,
                findings: responseObj?.majorFindings?.length,
            });
            return responseObj as PersonaResponse;
        } catch (e) {
            log?.error("VisionAnalysisAdapter", `analyzeArtifactCompletion error for "${persona.name}"`, {
                error: String(e),
                totalDurationMs: Date.now() - methodStart,
            });
            throw e;
        }
    }

    private buildPersonaSummaries(responses: PersonaResponse[]): string {
        return responses.map((r, i) => {
            const name = r.personaProfile?.name || `Persona ${i + 1}`;
            return `=== ${name} ===
Overview: ${r.overview || "(none)"}
Journey: ${(r.customerJourney || []).map(s => `${s.stage}: ${s.outcome} (${s.sentiment})`).join(" | ") || "(none)"}
Findings: ${(r.majorFindings || []).map(f => `- ${f.observation}: ${f.evidence}`).join("\n") || "(none)"}
Friction: ${(r.pointsOfFriction || []).join("; ") || "(none)"}
Questions: ${(r.unansweredQuestions || []).join("; ") || "(none)"}
`;
        }).join("\n\n");
    }

    private async callLLM(
        system: string,
        prompt: string,
        purpose: string,
        timeoutMs: number,
        options?: { runId?: string },
    ): Promise<string> {
        return Promise.race([
            this.llmService.createChatCompletion(
                [{ role: "user", content: prompt }],
                {
                    temperature: 0.3,
                    model: this.llmService.textModel,
                    response_format: { type: "json_object" },
                    purpose,
                    runId: options?.runId,
                }
            ),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`${purpose} timed out after ${timeoutMs}ms`)), timeoutMs)
            ),
        ]);
    }

    async generateTopFindings(
        responses: PersonaResponse[],
        businessGoal: string,
        researchQuestion: string,
        options?: { runId?: string },
    ): Promise<SynthesizedFinding[]> {
        const log = options?.runId ? AnalysisLogger.forRun(options?.runId) : null;
        const summaries = this.buildPersonaSummaries(responses);

        const system = `You are analyzing simulated customer research. You have responses from ${responses.length} simulated personas.

Business Goal: ${businessGoal}
Research Question: ${researchQuestion}

Your job: Identify the top 3-5 patterns that MULTIPLE personas experienced. Each finding must describe a cross-persona pattern.

CRITICAL RULES:
1. Do NOT reference individual persona names. Use group language: "Most personas...", "Several personas...", "A majority...", "All personas..."
2. Evidence should cite what multiple personas said, not just one.
3. Do NOT assign confidence (computed externally).
4. Do NOT make recommendations.
5. Do NOT use persona traits as causal explanations.

Return a JSON array of { observation: string, evidence: string, impact: string }`;

        const prompt = `${summaries}\n\nIdentify the top patterns across these personas. Return ONLY valid JSON.`;

        const content = await this.callLLM(system, prompt, "Top Findings", 90_000, options);

        try {
            const parsed = JSON.parse(content);
            const findings = Array.isArray(parsed) ? parsed : parsed.topFindings || parsed.findings || [];
            return findings.map((f: any) => ({
                observation: f.observation || "",
                evidence: f.evidence || "",
                impact: f.impact || "",
                confidence: "Medium" as const,
                affectedPersonaCount: 0,
                totalPersonaCount: responses.length,
            }));
        } catch (e) {
            log?.error("generateTopFindings", "Parse failed", { error: String(e), preview: content.slice(0, 200) });
            return [];
        }
    }

    async generateDisagreements(
        responses: PersonaResponse[],
        options?: { runId?: string },
    ): Promise<Disagreement[]> {
        const log = options?.runId ? AnalysisLogger.forRun(options?.runId) : null;
        const summaries = this.buildPersonaSummaries(responses);

        const system = `You are analyzing simulated customer research. You have responses from ${responses.length} simulated personas.

Your job: Identify where personas had OPPOSING reactions to the same thing. A disagreement exists when some personas reacted positively and others reacted negatively to the same feature, claim, or aspect.

If most personas agreed on everything, return an empty array.

CRITICAL: Do NOT reference individual persona names. Use group language.

Return a JSON array of { topic: string, split: [{ view: string, personaCount: number }], significance: "High" | "Medium" | "Low" }`;

        const prompt = `${summaries}\n\nIdentify disagreements across these personas. Return ONLY valid JSON.`;

        const content = await this.callLLM(system, prompt, "Disagreements", 60_000, options);

        try {
            const parsed = JSON.parse(content);
            const items = Array.isArray(parsed) ? parsed : parsed.disagreements || [];
            return items.map((d: any) => ({
                topic: d.topic || "",
                split: (d.split || []).map((s: any) => ({ view: s.view || "", personaCount: s.personaCount || 0 })),
                significance: d.significance || "Medium",
            }));
        } catch (e) {
            log?.error("generateDisagreements", "Parse failed", { error: String(e), preview: content.slice(0, 200) });
            return [];
        }
    }

    async generateFrictions(
        responses: PersonaResponse[],
        options?: { runId?: string },
    ): Promise<string[]> {
        const log = options?.runId ? AnalysisLogger.forRun(options?.runId) : null;
        const summaries = this.buildPersonaSummaries(responses);

        const system = `You are analyzing simulated customer research. You have responses from ${responses.length} simulated personas.

Your job: Identify the 2-3 biggest friction points that MULTIPLE personas experienced. A friction point is something that confused, frustrated, or stopped personas.

CRITICAL: Do NOT reference individual persona names. Use group language.

Return a JSON array of strings.`;

        const prompt = `${summaries}\n\nIdentify the biggest friction points across these personas. Return ONLY valid JSON.`;

        const content = await this.callLLM(system, prompt, "Frictions", 60_000, options);

        try {
            const parsed = JSON.parse(content);
            return Array.isArray(parsed) ? parsed : parsed.frictions || parsed.biggestFrictions || [];
        } catch (e) {
            log?.error("generateFrictions", "Parse failed", { error: String(e), preview: content.slice(0, 200) });
            return [];
        }
    }

    async generateSynthesisOverview(
        responses: PersonaResponse[],
        businessGoal: string,
        researchQuestion: string,
        topFindings: SynthesizedFinding[],
        disagreements: Disagreement[],
        frictions: string[],
        options?: { runId?: string },
    ): Promise<{ overview: string; researchQuestionAnswer: string }> {
        const log = options?.runId ? AnalysisLogger.forRun(options?.runId) : null;

        const findingsText = topFindings.map(f => `- ${f.observation}`).join("\n");
        const disagreementsText = disagreements.map(d => `- ${d.topic}`).join("\n");
        const frictionsText = frictions.map(f => `- ${f}`).join("\n");

        const system = `You are synthesizing customer research findings into a final report.

Business Goal: ${businessGoal}
Research Question: ${researchQuestion}

You have been given the top findings, disagreements, and friction points identified across simulated personas.

Your job: Produce two short summaries.

1. overview: One paragraph describing what the GROUP of personas collectively experienced. Focus on the most important pattern.
2. researchQuestionAnswer: One paragraph that directly answers the research question using evidence from the findings.

CRITICAL:
- Do NOT reference individual persona names. Use group language: "Most personas...", "Several personas..."
- Do NOT make recommendations.
- Do NOT use persona traits as causal explanations.
- Keep each paragraph concise (3-5 sentences).

Return a JSON object with { overview: string, researchQuestionAnswer: string }`;

        const prompt = `Top Findings:
${findingsText || "(none found)"}

Disagreements:
${disagreementsText || "(none found)"}

Friction Points:
${frictionsText || "(none found)"}

Synthesize these into an overview and research question answer. Return ONLY valid JSON.`;

        const content = await this.callLLM(system, prompt, "Synthesis Overview", 60_000, options);

        try {
            const parsed = JSON.parse(content);
            return {
                overview: parsed.overview || "",
                researchQuestionAnswer: parsed.researchQuestionAnswer || "",
            };
        } catch (e) {
            log?.error("generateSynthesisOverview", "Parse failed", { error: String(e), preview: content.slice(0, 200) });
            return { overview: "", researchQuestionAnswer: "" };
        }
    }
}
