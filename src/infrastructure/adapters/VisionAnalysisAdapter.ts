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
Background: ${background} | You are browsing because: ${browsingIntent}

HOW YOUR INNER VOICE WORKS:
- Write like a person thinking, not a person performing. Short bursts. Half-thoughts. "Okay, green background. Looks clean, maybe a little sterile." — that's the register. No scene-setting ("adjusts glasses"), no narrated stage directions, no dialogue formatting, no sign-off ("— Remy, signing off").
- No structure, no headers, no bullet lists, no numbered sections, no markdown emphasis. Just a plain wall of reactive thought with line breaks where attention jumps.
- Never use consultant words — no "CTA", "social proof", "value proposition", "friction", "conversion", "call to action", "design choice". You have never heard them. You just see things: "big black button that says Try for free", "Product Hunt badges", "2M users".
- You skim like a real person. Big text first, then whatever looks interesting, then maybe the fine print if you still care. You skip things and admit it. You get confused, irritated, or bored, and you say so bluntly ("come on, nothing takes under a minute, that's total marketing BS").
- You judge with your own life, not like a reviewer. If something doesn't apply to you, notice it and move on ("this is for job seekers, not me"). If a claim sounds fake, call it fake. If you'd click, say why — in your own selfish terms (curiosity, saving time, free stuff, no credit card).
- You do NOT summarize the page, score it, or conclude with an overall verdict. When you're done — clicked away, found the answer, got bored — the thought just stops mid-momentum.
- React, don't report. First person, present tense, impatient, a little messy.

Start wherever your eyes land first:`;
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
  // Models sometimes emit {friction: string, why: string} objects here despite
  // the prompt; coerce any object entry to its friction string instead of
  // failing the whole synthesis over presentation drift.
  biggestFrictions: z.array(
    z.union([z.string(), z.record(z.string(), z.unknown())])
      .transform((v) => {
        if (typeof v === 'string') return v;
        const obj = v as Record<string, unknown>;
        const first = ['friction', 'issue', 'point', 'description', 'title']
          .map((k) => obj[k])
          .find((x) => typeof x === 'string' && x.trim());
        return typeof first === 'string' ? first : JSON.stringify(obj);
      }),
  ),
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

    private buildSummarizerSystemPrompt(persona: Persona): string {
        return `You are a summarizer. Given a persona's raw analysis of a pricing page, produce 3-5 concise bullet points.

Each bullet should be one sentence, capturing the most important finding.
Focus on: what the persona liked, what concerned them, and their overall recommendation.

Write all bullets in English.

Format: Return ONLY a JSON array of strings. No preamble. Example: ["Bullet 1", "Bullet 2", "Bullet 3"]`;
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
            240_000, // reasoning models emit a long CoT before the JSON; 120s timed out live
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