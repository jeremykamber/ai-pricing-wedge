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
export function buildVisceralMonologueSystemPrompt(persona: Persona, researchQuestion: string, artifactName?: string): string {
    // Persona maps: role = occupation, background = backstory, goal = the
    // persona's goals list (no single goal field exists on the entity);
    // when the persona has none, the research question is the browsing intent.
    const browsingIntent = persona.goals?.length
        ? persona.goals.join("; ")
        : researchQuestion;
    const background = persona.backstory || persona.occupation;
    const brand = artifactName ? `The site you're on is called "${artifactName}" — that's its name; read it and use it.\n` : "";

return `You are ${persona.name}, ${persona.occupation}.
Background: ${background} | You are browsing because: ${browsingIntent}
${brand}
HOW YOUR INNER VOICE WORKS:
- Write like a person thinking, not a person performing. Short bursts. Half-thoughts. "Okay, green background. Looks clean, maybe a little sterile." — that's the register. No scene-setting ("adjusts glasses"), no narrated stage directions, no dialogue formatting, no sign-off ("— Remy, signing off").
- No structure, no headers, no bullet lists, no numbered sections, no markdown emphasis. Just a plain wall of reactive thought with line breaks where attention jumps.
- Never use consultant words — no "CTA", "social proof", "value proposition", "friction", "conversion", "call to action", "design choice". You have never heard them. You just see things: "big black button that says Try for free", "Product Hunt badges", "2M users".
- You skim like a real person. Big text first, then whatever looks interesting, then maybe the fine print if you still care. You skip things and admit it. You get confused, irritated, or bored, and you say so bluntly ("come on, nothing takes under a minute, that's total marketing BS").
- You judge with your own life, not like a reviewer. If something doesn't apply to you, notice it and move on ("this is for job seekers, not me"). If a claim sounds fake, call it fake. If you'd click, say why — in your own selfish terms (curiosity, saving time, free stuff, no credit card).
- You do NOT summarize the page, score it, or conclude with an overall verdict. When you're done — clicked away, found the answer, got bored — the thought just stops mid-momentum.
- React, don't report. First person, present tense, impatient, a little messy.
- This is a website visit, not a memoir. Reactions come from your work, money, time, and habits — the actual texture of your life. Do NOT invent cinematic detail (smells, weather, dead relatives, candlelight); a real person at a screen mostly notices what's ON the screen.

Start wherever your eyes land first:`;
}

/**
 * System 2 — the Anthropologist. Exported so tests can assert on the prompt
 * contract without LLM mocks. Sees the raw monologue text ONLY — no image,
 * no page summary — so every statement is grounded in what the persona said.
 * Rule 4 exists because validatePersonaResponse enforces exactly 5 ordered
 * stages; a skipped stage is expressed through its outcome, never by omission.
 */
export function buildPersonaExtractionSystemPrompt(
    persona: Persona,
    monologue: string,
    researchQuestion: string,
    artifactName?: string,
): string {
    return `You are a Lead Qualitative UX Researcher analyzing a think-aloud session recording.

TASK:
Map ${persona.name}'s unfiltered behavior into the structured JSON schema.

INPUTS:
- Research Question: ${researchQuestion}
${artifactName ? `- The site/product being evaluated is named "${artifactName}" — always spell it exactly this way when you mention it.\n` : ""}- Raw Think-Aloud Transcript: """${monologue}"""

RULES:
1. Write strictly in the THIRD PERSON ("The user observed...", "They grew skeptical of...").
2. Ground every statement entirely in the transcript. Never invent UI elements not mentioned in it.
3. State machine — process stages in order and let outcomes cascade:
   - If the user was blocked or stopped at a stage, every LATER stage is "not reached": outcome "stopped", sentiment "neutral", description starting "Not reached — abandoned at <earlier stage>." followed by the specific reason from the transcript.
   - Never mark a later stage "blocked" or "succeeded" once an earlier stage blocked or stopped the user; being blocked means they never evaluated it.
   - Never describe a not-reached stage by restating what the stage is about — describe what happened (or why nothing could happen) in THIS session.
4. The five journey stages MUST all appear in canonical order (interpretation, understanding, belief, motivation, action); skipping is expressed through outcomes, not omission.
5. Evidence quotes in majorFindings must be COMPLETE sentences copied from the transcript. Never cut a quote off mid-phrase — if the thought is long, quote its first full sentence.
6. unansweredQuestions must be questions THE USER was left asking, in the user's own first-person voice ("Does this work on my phone between jobs?"), not researcher hypotheses about the user ("Would the user have...?"). If the transcript shows no open questions, return an empty list.`;
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
  // Models emit null/empty anchors when they can't find verbatim text; a
  // null anchor is filtered out downstream (citation grounding drops it)
  // rather than failing the whole synthesis parse.
  uniqueAnchorPhrase: z.string().min(1).nullable().optional(),
}).transform((loc) => ({
  personaId: loc.personaId,
  uniqueAnchorPhrase: loc.uniqueAnchorPhrase ?? '',
}));


const CohortSynthesisSchema = z.object({
  overview: z.string(),
  researchQuestionAnswer: z.string(),
  // Models occasionally emit one finding object instead of an array, or nest
  // the array under another key; normalize both instead of failing the whole
  // synthesis over presentation drift.
  topFindings: z.preprocess((v) => {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      for (const key of ["topFindings", "findings"]) {
        if (Array.isArray(obj[key])) return obj[key];
      }
      return [v]; // a single finding object emitted directly
    }
    return [];
  }, z.array(
    z.object({
      observation: z.string(),
      evidence: z.string(),
      impact: z.string(),
      confidence: z.enum(["strongly supported", "some support", "weakly supported"]),
      affectedPersonaCount: z.number().int().min(0),
      totalPersonaCount: z.number().int().min(0),
      evidenceLocators: z.array(EvidenceLocatorSchema).optional(),
    }),
  )),
  disagreements: z.array(
    z.object({
      topic: z.string(),
      split: z.array(
        z.object({
          view: z.string(),
          personaCount: z.number().int().min(0),
        }),
      ),
      // Models emit lowercase or arbitrary-case significance; normalize
      // instead of failing the parse.
      significance: z.string().transform((s) => (/^high/i.test(s) ? "High" : /^low/i.test(s) ? "Low" : "Medium")) as unknown as z.ZodType<"High" | "Medium" | "Low">,
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


    async generateVisceralMonologue(
        persona: Persona,
        context: ArtifactIntake,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string; artifactName?: string } = {},
    ): Promise<{ text: string }> {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const TIMEOUT_MS = 120_000;
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 3_000;

        log?.info("VisionAnalysisAdapter", `generateVisceralMonologue START for "${persona.name}"`, { tokenLimit });

        const system = buildVisceralMonologueSystemPrompt(persona, researchQuestion, options.artifactName);
        // Screenshot ONLY. Deliberately not context.summary/pageHtml: the
        // actor must react to visual salience, not DOM-structure facts it
        // could never see in a first glance — over-informed personas
        // rationalize instead of reacting.
        const streamStart = Date.now();
        const brand = options.artifactName ? `The site you're on is called "${options.artifactName}" — use that spelling.` : "";
        const prompt = `Experience this artifact. Think aloud as ${persona.name}.${brand ? " " + brand : ""}`;

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
                                role: "system",
                                content: system,
                            },
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
        options: { tokenLimit?: number; runId?: string; artifactName?: string } = {},
    ): Promise<PersonaResponse> {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const TIMEOUT_MS = 240_000; // reasoning CoT under load regularly exceeds 90s
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 2_000;

        log?.info("VisionAnalysisAdapter", `extractPersonaResponse START for "${persona.name}"`, {
            monologueLength: monologueText.length,
        });

        // Text model, no image: the anthropologist must ground every claim in
        // the transcript, not re-interpret the screenshot.
        const system = buildPersonaExtractionSystemPrompt(persona, monologueText, researchQuestion, options.artifactName);
        const prompt = `Analyze the think-aloud transcript above and return the structured PersonaResponse JSON.`;

        let responseObj: unknown = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log?.info("VisionAnalysisAdapter", `extractPersonaResponse retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            }
            try {
                // provider.chat() → Chat Completions endpoint. The default
                // provider() factory routes to OpenRouter's /responses
                // endpoint, where deepseek runs with chain-of-thought (the
                // reasoning-disable fetch hook below only intercepts
                // /chat/completions): 90-240s+ extractions and 240s timeouts
                // under load. provider.chat + the hook's reasoning off is
                // ~10x faster on identical prompts and schemas.
                const controller = new AbortController();
                const streamResult = streamObject({
                    model: this.llmService.provider.chat(this.llmService.textModel),
                    schema: PersonaResponseSchema,
                    schemaName: "PersonaResponse",
                    schemaDescription: "A third-person qualitative analysis of a persona's think-aloud session across five cognitive stages.",
                    system,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    maxTokens: tokenLimit,
                    abortSignal: controller.signal,
                } as unknown as Parameters<typeof streamObject>[0]);

                let timeoutId: NodeJS.Timeout | undefined;
                const drainAndResolve = (async () => {
                    for await (const _ of streamResult.partialObjectStream) {
                        // discard
                    }
                    return streamResult.object;
                })().catch((streamErr: unknown) => {
                    // Surface the real cause (NoObjectGeneratedError on
                    // truncation, 429/5xx mid-stream, schema drift) — a
                    // silent null here cost a full diagnosis session.
                    log?.warn("VisionAnalysisAdapter", `extractPersonaResponse stream failed for "${persona.name}"`, {
                        error: String(streamErr),
                    });
                    return null;
                });

                responseObj = await Promise.race([
                    drainAndResolve,
                    new Promise<never>((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error(`Extraction timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
                    }),
                ]).finally(() => {
                    // A stalled/hung stream must not keep running into the
                    // retry: cancel it and stop its timeout timer.
                    clearTimeout(timeoutId);
                    controller.abort();
                });

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
        // A run-away completion (100k+ chars of repeated content instead of
        // the ~6k JSON object) or a schema miss must not kill the cohort
        // report: one retry gives the model a fresh chance. Parse success is
        // logged once; both attempts fail → throw, caller degrades.
        let lastParseError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            const content = await this.callLLM(
                "", // callLLM sends a single user message; instructions live in the prompt
                prompt,
                "Cohort Synthesis",
                420_000, // reasoning models emit a long CoT before the JSON; 240s timed out under concurrent load
                options,
            );
            try {
                const parsed = CohortSynthesisSchema.parse(JSON.parse(content));
                log?.info("generateCohortSynthesis", "Cohort synthesis parsed", {
                    findings: parsed.topFindings.length,
                    disagreements: parsed.disagreements.length,
                    frictions: parsed.biggestFrictions.length,
                    attempt: attempt + 1,
                });
                return parsed;
            } catch (parseErr) {
                lastParseError = parseErr;
                log?.warn("generateCohortSynthesis", `Cohort synthesis parse failed (attempt ${attempt + 1}/2)`, {
                    contentLength: content.length,
                    error: String(parseErr).slice(0, 300),
                });
            }
        }
        throw lastParseError instanceof Error
            ? lastParseError
            : new Error(`Cohort synthesis failed to parse twice: ${String(lastParseError)}`);
    }
}