import { z } from "zod";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysisSchema } from "@/domain/entities/PricingAnalysis";
import { PersonaResponseSchema } from "@/domain/entities/PersonaResponse";
import type { ArtifactIntake } from "@/domain/entities/ArtifactIntake";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { CohortSynthesisContent } from "@/domain/entities/ArtifactSynthesis";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";
import { IdRagStore } from "./IdRagStore";
import { IdRagService } from "./IdRagService";
import { streamObject } from "ai";
import { PricingLocation } from "@/domain/ports/LlmServicePort";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

// Matches runs of CJK, Hangul, Kana, Cyrillic, Arabic, and Hebrew. Used to
// catch personas or formatters that drift out of the report language (English).
const NON_LATIN_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0600-\u06ff\u0590-\u05ff\u0400-\u04ff]{2,}/g;

function detectNonLatin(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.match(NON_LATIN_RE) ?? []) {
    found.add(m.slice(0, 24));
  }
  return [...found];
}

/**
 * System 1 — the Actor. Exported so tests can assert on the prompt
 * contract without LLM mocks. Identity comes from this small template:
 * the compartment system prompt is the over-rationalization source, so it
 * is deliberately absent from this path.
 */
export function buildVisceralMonologueSystemPrompt(persona: Persona, researchQuestion: string): string {
    // Persona maps: role = occupation, background = backstory, goal = the
    // persona's goals list (no single goal field exists on the entity);
    // when the persona has none, the research question is the browsing intent.
    const browsingIntent = persona.goals?.length
        ? persona.goals.join("; ")
        : researchQuestion;
    const background = persona.backstory || persona.occupation;

    return `You are ${persona.name}, ${persona.occupation}.
Background: ${background} | Goal: ${browsingIntent}
CRITICAL OPERATING RULES:
1. You are an impatient human browsing a website. You are NOT an AI assistant, tester, or UX consultant.
2. Never use terminology like "CTA", "social proof", "value proposition", or "friction".
3. Act with an implicit attention budget. You are easily frustrated. If you don't understand the page within seconds, say so.
4. Speak in an unfiltered, fragmented stream-of-consciousness. Narrate exactly what your eyes land on, what sounds fake, what you click, or when you abandon the page.
5. Do not justify or over-rationalize. React viscerally.

Begin your raw stream of thought now:`;
}

/**
 * System 2 — the Anthropologist. Exported so tests can assert on the prompt
 * contract without LLM mocks. Sees the raw monologue text ONLY — no image,
 * no page summary — so every statement is grounded in what the persona said.
 * Rule 4 exists because validatePersonaResponse enforces exactly 5 ordered
 * stages; a skipped stage is expressed through its outcome, never by omission.
 */
export function buildPersonaExtractionSystemPrompt(persona: Persona, monologue: string, researchQuestion: string): string {
    return `You are a Lead Qualitative UX Researcher analyzing a think-aloud session recording.

TASK:
Map ${persona.name}'s unfiltered behavior into the structured JSON schema.

INPUTS:
- Research Question: ${researchQuestion}
- Raw Think-Aloud Transcript: """${monologue}"""

RULES:
1. Write strictly in the THIRD PERSON ("The user observed...", "They grew skeptical of...").
2. DO NOT fabricate steps. If the user never reached a stage — got confused and bounced — mark that stage outcome as "blocked" or "stopped" with negative sentiment rather than inventing progress.
3. Ground every statement entirely in the transcript. Never invent UI elements not mentioned in it.
4. The five journey stages MUST all appear in canonical order (interpretation, understanding, belief, motivation, action); skipping is expressed through outcomes, not omission.`;
}

/**
 * Wire schema for the single cohort-synthesis LLM call. Evidence anchors ride
 * on each finding (one call instead of two — locators must be chosen by the
 * same pass that forms the finding); the model never emits counts of the run
 * itself, and never emits citations — those are resolved from transcripts by
 * application/synthesis/citations.ts.
 */
const EvidenceLocatorSchema = z.object({
  personaId: z.string().min(1),
  uniqueAnchorPhrase: z.string().min(1),
});


const CohortSynthesisSchema = z.object({
  overview: z.string(),
  researchQuestionAnswer: z.string(),
  topFindings: z.array(
    z.object({
      observation: z.string(),
      evidence: z.string(),
      impact: z.string(),
      confidence: z.enum(["strongly supported", "some support", "weakly supported"]),
      affectedPersonaCount: z.number().int().min(0),
      totalPersonaCount: z.number().int().min(0),
      evidenceLocators: z.array(EvidenceLocatorSchema).optional(),
    }),
  ),
  disagreements: z.array(
    z.object({
      topic: z.string(),
      split: z.array(
        z.object({
          view: z.string(),
          personaCount: z.number().int().min(0),
        }),
      ),
      significance: z.enum(["High", "Medium", "Low"]),
    }),
  ),
  biggestFrictions: z.array(z.string()),
});

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
                    reasoning: { enabled: false },
                } as any),
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

Write all bullets in English.

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

    // ─── Persona pipeline (deprecated one-pass + Observer-Actor two-stage) ───

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
1. A screenshot of what a user sees on first load.
2. A factual summary of the page's full content — including content that may be hidden behind interactions you cannot perform (expandable FAQs, dropdowns, menus, modals, pagination).

Treat the summary as the page's full content: if it mentions something not visible in the screenshot, that content exists but is behind an interaction. If you cannot tell whether something is present (for example, whether an FAQ question has an answer), say you couldn't verify it — do not claim it is absent. Only react to details you can actually see or that appear in the summary; do not invent specifics.

<<LANGUAGE>>
Write everything in English, even if the artifact or the persona's background suggests another language.

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
4. For each stage's outcome: use "succeeded" if the persona could fully process this stage and move forward; "blocked" if something specific stopped progression but the journey continued; "stopped" if they abandoned at this stage. The outcome must match the description content — if the persona found something confusing or couldn't progress, the outcome should NOT be "succeeded".
5. For each stage's sentiment: use "positive" if the persona felt good/encouraged, "neutral" if ambivalent, "negative" if frustrated/concerned. Sentiment and outcome are independent — a persona can succeed at a stage with negative feelings, or stop with positive feelings.
6. majorFindings: extract 2-4 specific observations. Each must have: observation (what happened), evidence (what the persona said or did), impact (why it matters). Do NOT include confidence — it is computed from agreement across personas. The evidence must be a direct quote or paraphrase of what the persona thought — do NOT reference any persona name.
7. Do NOT use persona traits (Big Five, values, fears) as causal explanations. Persona attributes may contextualize behavior but cannot explain it. Do NOT reference the persona's own name or traits as evidence. The persona profile is synthetic; using it as causal evidence is circular.
8. researchQuestionAnswer: describe what evidence was observed from THIS persona only, not what the company should do. Write in first person as the persona.
9. overview: one paragraph capturing the single most important takeaway from THIS persona's experience.
10. Do NOT use any persona name (neither this persona's name nor any other persona's name) anywhere in the output. The report is automatically associated with the correct persona by the system.
11. Write ALL output in English. If the raw reasoning contains another language, translate it to English.

Follow these rules strictly. Findings describe observed behavior, not inferred psychology.`;
    }

    async generateVisceralMonologue(
        persona: Persona,
        context: ArtifactIntake,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string } = {},
    ): Promise<{ text: string }> {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const TIMEOUT_MS = 120_000;
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 3_000;

        log?.info("VisionAnalysisAdapter", `generateVisceralMonologue START for "${persona.name}"`, { tokenLimit });

        const system = buildVisceralMonologueSystemPrompt(persona, researchQuestion);
        // Screenshot ONLY. Deliberately not context.summary/pageHtml: the
        // actor must react to visual salience, not DOM-structure facts it
        // could never see in a first glance — over-informed personas
        // rationalize instead of reacting.
        const streamStart = Date.now();
        const prompt = `Experience this artifact. Think aloud as ${persona.name}.`;

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log?.warn("VisionAnalysisAdapter", `generateVisceralMonologue retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
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
                            temperature: 0.7,
                            max_tokens: tokenLimit,
                            model: this.llmService.visionModel,
                            purpose: `Visceral Monologue — ${persona.name}`,
                            runId: options.runId,
                        }
                    ),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(`Visceral monologue timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
                    ),
                ]);

                log?.info("VisionAnalysisAdapter", `generateVisceralMonologue completed for "${persona.name}"`, {
                    durationMs: Date.now() - streamStart,
                    textLength: text.length,
                });

                return { text };
            } catch (e) {
                lastError = e as Error;
                log?.warn("VisionAnalysisAdapter", `generateVisceralMonologue attempt ${attempt + 1} failed for "${persona.name}"`, {
                    error: String(e),
                });
                if (attempt === MAX_RETRIES) throw lastError;
            }
        }

        throw lastError || new Error("generateVisceralMonologue failed after all retries");
    }

    async extractPersonaResponse(
        persona: Persona,
        monologueText: string,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string } = {},
    ): Promise<PersonaResponse> {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const TIMEOUT_MS = 90_000;
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 2_000;

        log?.info("VisionAnalysisAdapter", `extractPersonaResponse START for "${persona.name}"`, {
            monologueLength: monologueText.length,
        });

        // Text model, no image: the anthropologist must ground every claim in
        // the transcript, not re-interpret the screenshot.
        const system = buildPersonaExtractionSystemPrompt(persona, monologueText, researchQuestion);
        const prompt = `Analyze the think-aloud transcript above and return the structured PersonaResponse JSON.`;

        let responseObj: unknown = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log?.info("VisionAnalysisAdapter", `extractPersonaResponse retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            }

            try {
                const streamResult = streamObject({
                    model: this.llmService.provider(this.llmService.textModel),
                    schema: PersonaResponseSchema,
                    schemaName: "PersonaResponse",
                    schemaDescription: "A third-person qualitative analysis of a persona's think-aloud session across five cognitive stages.",
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
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(`Extraction timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
                    ),
                ]);

                if (responseObj) break;
            } catch (e) {
                log?.warn("VisionAnalysisAdapter", `extractPersonaResponse attempt ${attempt + 1} failed for "${persona.name}"`, {
                    error: String(e),
                });
                if (attempt === MAX_RETRIES) throw e;
            }
        }

        if (!responseObj) {
            throw new Error(`extractPersonaResponse returned null for "${persona.name}"`);
        }

        const nonLatinFields = detectNonLatin(JSON.stringify(responseObj));
        if (nonLatinFields.length > 0) {
            log?.warn("VisionAnalysisAdapter", `Non-English output detected for "${persona.name}"`, {
                samples: nonLatinFields.slice(0, 3),
            });
        }

        log?.info("VisionAnalysisAdapter", `extractPersonaResponse completed for "${persona.name}"`);

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

    /**
     * One structured LLM call over the cohort's RAW monologue transcripts.
     * Replaces the four shallow per-section calls: the model sees each
     * persona's unedited reasoning trace (source of truth) rather than
     * pre-digested summaries, so findings, disagreements and frictions come
     * from one coherent pass instead of four that never saw each other's
     * output. Findings carry evidenceLocators — anchor phrases resolved into
     * verbatim citations by application/synthesis/citations.ts, never by the
     * model. Parse failure throws: the caller decides how to degrade, and
     * partial/empty synthesis must not silently pass as data.
     */
    async generateCohortSynthesis(
        researchQuestion: string,
        transcripts: Array<{ personaId: string; personaName: string; transcript: string }>,
        options?: { runId?: string },
    ): Promise<CohortSynthesisContent> {
        const log = options?.runId ? AnalysisLogger.forRun(options.runId) : null;

        const personaSections = transcripts
            .map((t, i) =>
                `=== Persona ${i + 1}: ${t.personaName} (id: ${t.personaId}) ===\n"""${t.transcript}"""`)
            .join("\n\n");

        const prompt = `You are synthesizing simulated customer research. Below are the complete reasoning transcripts of ${transcripts.length} simulated personas who interacted with a product.

Research Question: ${researchQuestion}

Your job: produce a cross-persona synthesis of what this cohort experienced.

REQUIRED OUTPUT SHAPE (JSON object):
{
  "overview": string,
  "researchQuestionAnswer": string,
  "topFindings": [
    {
      "observation": string,
      "evidence": string,
      "impact": string,
      "confidence": "strongly supported" | "some support" | "weakly supported",
      "affectedPersonaCount": number,
      "totalPersonaCount": ${transcripts.length},
      "evidenceLocators": [
        { "personaId": string, "uniqueAnchorPhrase": string }
      ]
    }
  ],
  "disagreements": [
    {
      "topic": string,
      "split": [{ "view": string, "personaCount": number }],
      "significance": "High" | "Medium" | "Low"
    }
  ],
  "biggestFrictions": [string]
}

FIELD RULES:
- overview: one paragraph on what the GROUP collectively experienced.
- researchQuestionAnswer: one paragraph directly answering the research question from the evidence.
- topFindings: 3-5 patterns MULTIPLE personas experienced. Group language only, no persona names. evidenceLocators: 1-3 per finding, each a 5-8 word CONTINUOUS phrase copied EXACTLY (verbatim, same casing) from ONE persona's transcript that best evidences the finding, with that persona's id.
- disagreements: topics where personas' reactions genuinely DIVERGED (one acted, another bounced or doubted) — a split with each view and its persona count. Prefer 1-3 entries; empty ONLY if the transcripts show no divergence at all.
- biggestFrictions: 2-3 specific moments where personas hesitated, doubted, or nearly dropped — quote the element that caused it ("the unexplained score", "the AI-agent promise"). Every cohort has friction; if the homepage converts perfectly, name what ALMOST stopped them.
- affectedPersonaCount: honest count of personas whose transcripts show the pattern.

CRITICAL RULES:
1. Findings, overview and answers use group language ("Most personas...", "Several...") — no persona names.
2. Anchor phrases MUST be copied character-for-character from the cited persona's transcript. The user-facing quote is extracted from the transcript by code — anything not verbatim fails silently.
3. Do NOT make recommendations. Do NOT use persona traits as causal explanations.
4. Write all output in English.

${personaSections}

Return ONLY the JSON object.`;

        const content = await this.callLLM(
            "", // callLLM sends a single user message; instructions live in the prompt
            prompt,
            "Cohort Synthesis",
            120_000,
            options,
        );

        const parsed = CohortSynthesisSchema.parse(JSON.parse(content));
        log?.info("generateCohortSynthesis", "Cohort synthesis parsed", {
            findings: parsed.topFindings.length,
            disagreements: parsed.disagreements.length,
            frictions: parsed.biggestFrictions.length,
        });
        return parsed;
    }
}