import { Persona, PersonaSchema } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { streamText, Output } from "ai";
import { z } from "zod";
import { stripCodeFence } from "./llmUtils";
import { GENDERLESS_NAMES } from "@/data/genderless_names";
import pLimit from "p-limit";
import type { PersonaPhaseCallback } from "@/domain/ports/LlmServicePort";
import type {
  ResearchPersonaConfig,
  StrategyPersonaConfig,
  ClusterPersonaConfig,
} from "@/domain/dtos/PersonaGenerationConfig";

const attributeConfidenceSchema = z.array(z.object({
  attribute: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().optional(),
}));

/**
 * Profile-phase output schema for phased persona generation (strategy + research).
 *
 * Deliberately NOT the full PersonaSchema: the LLM only produces the profile
 * here (backstory comes per-persona in phase 2), and a tight schema matching
 * the prompt's structure block keeps the output small enough to parse
 * reliably. Everything the evidence contract needs is required except each
 * behavioral dimension's `evidence` quote — provenance marks dimensions
 * observed/0.9 when the quote is present and interpreted/0.6 when not, so
 * confidence stays honest rather than blanket-high. evidenceLinks is optional
 * in the schema: strategy enforces it via the required-fields nudge, research
 * keeps its interview-derived fallback. attributeConfidence is optional here
 * because research's prompt never produces it; strategy requires it via
 * StrategyProfileSchema.
 */
const PersonaProfileSchema = z.object({
  age: z.number().min(0).max(100),
  occupation: z.string().min(1),
  educationLevel: z.string().min(1),
  interests: z.array(z.string().min(1)),
  goals: z.array(z.string().min(1)),
  conscientiousness: z.number().min(0).max(100),
  neuroticism: z.number().min(0).max(100),
  openness: z.number().min(0).max(100),
  extraversion: z.number().min(0).max(100),
  agreeableness: z.number().min(0).max(100),
  values: z.array(z.string().min(1)),
  // Entries may be empty: on a terse input there are not enough distinct
  // verbatim fragments for every value/fear, and "omit rather than invent"
  // requires an empty slot to be representable (the verbatim + distinct
  // checks accept empties; the UI renders no disclosure line for them).
  valueEvidence: z.array(z.string()),
  fears: z.array(z.string().min(1)),
  fearEvidence: z.array(z.string()),
  communicationStyle: z.string().min(1),
  decisionStyle: z.string().min(1),
  domainExpertise: z.array(z.string().min(1)),
  behavioralDimensions: z.array(z.object({
    name: z.string().min(1),
    score: z.number().min(0).max(100),
    context: z.string().min(1),
    description: z.string().min(1),
    evidence: z.string().optional(),
  })),
  bestFor: z.array(z.string().min(1)),
  lessReliableFor: z.array(z.string().min(1)),
  identityContext: z.string().min(1),
  situationContext: z.string().min(1),
  evidenceLinks: z.array(z.object({
    transcriptId: z.string().min(1),
    excerpt: z.string().min(1),
    attribute: z.string().min(1),
  })).optional(),
  // LLM-decided per-attribute confidence (strategy only; optional so the
  // shared schema tolerates research, whose prompt never asks for it).
  // Strategy enforces presence via StrategyProfileSchema + the coverage check.
  attributeConfidence: attributeConfidenceSchema.optional(),
});

/**
 * Strategy profile schema: attributeConfidence is REQUIRED (min 1 entry).
 * Empirically, when the schema left it optional the model could drop the
 * whole block on a retry after a verbatim-nudge (over-correction), failing
 * the run via the coverage check; a required field turns that silent drop
 * into a parse rejection the model self-corrects on the next attempt.
 */
const StrategyProfileSchema = PersonaProfileSchema.extend({
  attributeConfidence: attributeConfidenceSchema.min(1),
});

export class PersonaAdapter {
  constructor(private llmService: LlmServiceImpl) { }

  /**
   * Shared helper: parse LLM JSON response into persona records.
   * Validates count, array shape, and extracts base fields.
   * Throws on count mismatch or malformed response.
   */
  private static parsePersonaList(
    rawContent: string,
    expectedCount: number,
    context: string,
  ): Record<string, unknown>[] {
    const cleaned = stripCodeFence(rawContent);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`[PersonaAdapter] Failed to parse ${context} personas: invalid JSON`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`[PersonaAdapter] Expected JSON array for ${context} personas, got ${typeof parsed}`);
    }
    if (parsed.length < expectedCount) {
      throw new Error(
        `[PersonaAdapter] ${context} persona count mismatch: expected ${expectedCount}, got ${parsed.length}. The generation will be retried automatically.`
      );
    }
    if (parsed.length > expectedCount) {
      console.warn(`[PersonaAdapter] ${context} returned ${parsed.length} personas, truncating to ${expectedCount}`);
    }
    return parsed.slice(0, expectedCount) as Record<string, unknown>[];
  }

  /**
   * Deterministic, seed-stable assignment of curated gender-neutral names
   * (see PR #27). FNV-1a hash of the seed text + mulberry32 shuffle so the
   * same seed yields the same name order. Returns the first `count` names.
   */
  private static neutralNames(seedText: string, count: number): string[] {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const rnd = (() => {
      let a = h >>> 0;
      return () => {
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    })();
    const copy = GENDERLESS_NAMES.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }

  /**
   * Normalizes a quote or source text for the verbatim substring check:
   * lowercase, whitespace collapsed, surrounding quotation marks stripped.
   * The prompt asks the model to wrap fragments in quotes — the marks (and
   * any padding between them and the fragment) are formatting, not content,
   * and must not cause a false rejection.
   */
  private static normalizeVerbatim(s: string): string {
    const collapsed = s.toLowerCase().replace(/\s+/g, ' ').trim();
    return collapsed.replace(/^["'«»“”‘’]+|["'«»“”‘’]+$/g, '').trim();
  }

  /**
   * Collects the non-empty quote values a record holds at a dot path, e.g.
   * 'valueEvidence' (top-level string array) or 'behavioralDimensions.evidence'
   * (a single string field inside each record of an array). The leaf accepts
   * both a string and an array of strings.
   */
  private static collectQuoteValues(rec: Record<string, unknown>, fieldPath: string): string[] {
    const [head, ...rest] = fieldPath.split('.');
    const value = rec[head];
    if (rest.length === 0) {
      if (typeof value === 'string') return value.trim() ? [value] : [];
      return Array.isArray(value)
        ? value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];
    }
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) =>
      item && typeof item === 'object'
        ? PersonaAdapter.collectQuoteValues(item as Record<string, unknown>, rest.join('.'))
        : [],
    );
  }

  /**
   * Builds the retry nudge for the specific client-side rule the previous
   * attempt violated (diagnostic-driven, not a static list). Empty string
   * when the failure was structural (parse/schema), where no content nudge
   * applies.
   */
  private static retryNudgeFor(
    failure: { rule: 'required' | 'distinct' | 'verbatim' | 'coverage'; detail?: string } | undefined,
    options: {
      requiredFields?: readonly string[];
      distinctFields?: readonly string[];
      verbatim?: { sourceText: string; fields: readonly string[] };
      coverage?: {
        listField: string;
        nameField: string;
        requiredNames: readonly string[];
        dynamicNamesField?: string;
      };
    },
  ): string {
    switch (failure?.rule) {
      case 'required':
        return `\n\nThe previous generation was incomplete: every persona MUST include ALL of these fields with non-empty values: ${options.requiredFields?.join(', ') ?? ''}. A persona missing any of them is invalid.`;
      case 'distinct':
        return `\n\nThe previous generation repeated the same evidence quote: quotes (${options.distinctFields?.join(', ') ?? ''}) must be DISTINCT — never repeat the same quote for two different values or fears.`;
      case 'verbatim':
        return `\n\nThe previous generation's evidence quotes were not verbatim: every quote in ${options.verbatim?.fields?.join(', ') ?? ''} MUST be a word-for-word fragment of the user's response, in quotation marks, NEVER the persona's invented voice. If no fragment of the user's response fits, omit rather than invent: leave the quote empty. This applies to evidence QUOTES only — every other field, including attributeConfidence with one entry per attribute, must remain complete.`;
      case 'coverage':
        return `\n\nThe previous generation's ${options.coverage?.listField ?? ''} was incomplete: it MUST include exactly one entry for each of ${options.coverage?.requiredNames?.join(', ') ?? ''} and for every behavioral dimension, using the EXACT attribute names from the structure. Missing entries: ${failure.detail ?? ''}.`;
      default:
        return '';
    }
  }

  /**
   * Maps each evidence quote on a strategy profile to the guided-form
   * question it answers — the label of the input section containing the
   * quote, e.g. "save time" → "Goals they are trying to accomplish". The UI
   * renders "(Answer to <question> in audience description)". Quotes in
   * unlabeled input get no entry, so the UI omits the parenthetical rather
   * than inventing a question.
   */
  private static evidenceQuestionsFor(description: string, p: Record<string, unknown>): Record<string, string> | undefined {
    const sections = description.split(/\n\s*\n/).filter(Boolean);
    const labelOf = (quote: string): string | undefined => {
      const normalized = quote.toLowerCase();
      const section = sections.find((s) => s.toLowerCase().includes(normalized));
      return section?.match(/^([^:\n]+):/)?.[1]?.trim();
    };
    const map: Record<string, string> = {};
    const add = (quote: unknown) => {
      if (typeof quote === 'string' && quote.trim()) {
        const label = labelOf(quote);
        if (label) map[quote] = label;
      }
    };
    (Array.isArray(p.valueEvidence) ? p.valueEvidence : []).forEach(add);
    (Array.isArray(p.fearEvidence) ? p.fearEvidence : []).forEach(add);
    (Array.isArray(p.behavioralDimensions) ? p.behavioralDimensions : [])
      .forEach((d) => add((d as Record<string, unknown>).evidence));
    (Array.isArray(p.evidenceLinks) ? p.evidenceLinks : [])
      .forEach((l) => add((l as Record<string, unknown>).excerpt));
    return Object.keys(map).length > 0 ? map : undefined;
  }

  /**
   * Shared helper: extract common persona fields from a raw record.
   */
  private static extractBaseFields(p: Record<string, unknown>): Record<string, unknown> {
    return {
      name: (p.name as string) ?? "Unknown",
      age: Number(p.age) || 30,
      occupation: (p.occupation as string) ?? "Unknown",
      educationLevel: (p.educationLevel as string) ?? "Unknown",
      interests: Array.isArray(p.interests) ? p.interests : [],
      goals: Array.isArray(p.goals) ? p.goals : [],
      conscientiousness: Number(p.conscientiousness) || 50,
      neuroticism: Number(p.neuroticism) || 50,
      openness: Number(p.openness) || 50,
      extraversion: Number(p.extraversion) || 50,
      agreeableness: Number(p.agreeableness) || 50,
      values: Array.isArray(p.values) ? p.values : [],
      fears: Array.isArray(p.fears) ? p.fears : [],
      valueEvidence: Array.isArray(p.valueEvidence) ? (p.valueEvidence as string[]) : undefined,
      fearEvidence: Array.isArray(p.fearEvidence) ? (p.fearEvidence as string[]) : undefined,
      communicationStyle: (p.communicationStyle as string) ?? "",
      decisionStyle: (p.decisionStyle as string) ?? "",
      pricingSensitivity: Number(p.pricingSensitivity) || 50,
      typicalBudget: (p.typicalBudget as string) ?? "",
      domainExpertise: Array.isArray(p.domainExpertise) ? p.domainExpertise : [],
      backstory: (p.backstory as string) ?? undefined,
    };
  }

  /**
   * Shared helper: extract behavioral dimensions from a raw record.
   */
  private static extractBehavioralDimensions(p: Record<string, unknown>): { name: string; score: number; context: string; description: string; evidence?: string }[] {
    if (!Array.isArray(p.behavioralDimensions)) return [];
    return p.behavioralDimensions.map((d: Record<string, unknown>) => ({
      name: String(d.name ?? ""),
      score: Number(d.score) || 50,
      context: String(d.context ?? ""),
      description: String(d.description ?? ""),
      evidence: d.evidence ? String(d.evidence) : undefined,
    }));
  }

  /**
   * Generate a persona array via schema-enforced structured output.
   *
   * Raw freeform JSON from the LLM is unreliable (deepseek occasionally emits
   * malformed JSON or burns the response budget on reasoning), and a single
   * parse failure used to fail the whole batch with no retry. Structured
   * output gives the provider a JSON schema; we additionally retry once when
   * the model still fails to produce valid output or returns too few personas
   * (the AI SDK only auto-retries HTTP errors, not output validation errors).
   *
   * The model also occasionally skips schema fields when the structure is
   * large, so callers can pass `requiredFields` to validate the content every
   * record must have and retry with a nudge rather than shipping hollow
   * personas. The phased strategy pipeline passes a profile-level set (no
   * backstory — that phase comes later); other modes omit it and keep the
   * historical lenient behavior.
   */
  private async generatePersonaArray(
    system: string,
    user: string,
    expectedCount: number,
    context: string,
    temperature: number,
    options: {
      /** Output element schema — defaults to the full PersonaSchema. */
      schema?: z.ZodType;
      /** Fields every record must have with non-empty values; absence triggers a retry with a nudge. */
      requiredFields?: readonly string[];
      /**
       * Array fields whose entries must be distinct (e.g. evidence quotes
       * reused across values); duplicates trigger a retry with a nudge.
       */
      distinctFields?: readonly string[];
      /**
       * Verbatim integrity contract: dot-path fields whose non-empty values
       * must each be a word-for-word fragment of `sourceText` (the user's
       * input). Empty/absent quotes are ACCEPTED — omitting a quote is
       * honest, inventing one is not. Supports top-level string arrays
       * ('valueEvidence') and nested record-array strings
       * ('behavioralDimensions.evidence'). Violations trigger a retry with
       * an omit-rather-than-invent nudge.
       */
      verbatim?: {
        sourceText: string;
        fields: readonly string[];
      };
      /**
       * Coverage contract: every record's list field must contain one entry
       * per required name plus one per entry in the dynamic record array
       * (matched by exact name). Used to force the LLM to rate every
       * attribute it produced. Violations trigger a retry with a
       * use-exact-names nudge.
       */
      coverage?: {
        /** Record key holding the list (e.g. 'attributeConfidence'). */
        listField: string;
        /** Name field within each list entry (e.g. 'attribute'). */
        nameField: string;
        /** Names that must be present in every record's list. */
        requiredNames: readonly string[];
        /** Record array whose entry names must also be covered (name field 'name'). */
        dynamicNamesField?: string;
      };
    } = {},
  ): Promise<Record<string, unknown>[]> {
    const { schema = PersonaSchema, requiredFields, distinctFields, verbatim, coverage } = options;
    // Three attempts, not two: a single run can fail twice in a row — e.g.
    // the model fabricates quotes (verbatim nudge), then over-corrects on the
    // retry and drops attributeConfidence (coverage nudge). A third attempt
    // absorbs that chain; it only costs an extra call on failure paths.
    const attempts = 3;
    let lastError: unknown;
    // Which client-side rule the previous attempt violated, plus the failing
    // detail; the retry nudge is built from this so it names the actual
    // failure (diagnostic-driven, not a static list).
    let lastFailure: { rule: 'required' | 'distinct' | 'verbatim' | 'coverage'; detail?: string } | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      console.log(`[PersonaAdapter] [${context}] Generating ${expectedCount} personas (attempt ${attempt}/${attempts})...`);
      try {
        const retryNudge = attempt > 1
          ? PersonaAdapter.retryNudgeFor(lastFailure, { requiredFields, distinctFields, verbatim, coverage })
          : '';
        const { output } = streamText({
          // provider.chat() → Chat Completions endpoint. The default
          // provider() factory routes to OpenRouter's /responses endpoint,
          // which is pathologically slow for deepseek (90-240s+ for this
          // call) and unreachable by the reasoning-disable fetch hook.
          model: this.llmService.provider.chat(this.llmService.smallTextModel),
          output: Output.array({ element: schema }),
          system,
          prompt: user + retryNudge,
          temperature,
        });
        const records = (await output) as unknown as Record<string, unknown>[];
        if (records.length < expectedCount) {
          throw new Error(
            `[PersonaAdapter] ${context} persona count mismatch: expected ${expectedCount}, got ${records.length}. The generation will be retried automatically.`,
          );
        }
        if (records.length > expectedCount) {
          console.warn(`[PersonaAdapter] ${context} returned ${records.length} personas, truncating to ${expectedCount}`);
        }
        const slice = records.slice(0, expectedCount);
        if (requiredFields && requiredFields.length > 0) {
          const incomplete = slice.flatMap((rec, i) => {
            const absent = requiredFields.filter((k) => {
              const v = rec[k];
              return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
            });
            return absent.length > 0 ? [`persona #${i + 1} missing: ${absent.join(', ')}`] : [];
          });
          if (incomplete.length > 0) {
            lastFailure = { rule: 'required' };
            throw new Error(`[PersonaAdapter] ${context} incomplete output: ${incomplete.join('; ')}`);
          }
        }
        if (distinctFields && distinctFields.length > 0) {
          const duplicated = slice.flatMap((rec, i) =>
            distinctFields.flatMap((k) => {
              const v = rec[k];
              if (!Array.isArray(v)) return [];
              const seen = new Set<string>();
              // Empty entries are honest omission, not duplicates.
              const dupes = (v as string[]).filter((s) => s.trim() !== '' && (seen.has(s) ? true : (seen.add(s), false)));
              return dupes.length > 0 ? [`persona #${i + 1} ${k} repeats quotes: ${dupes.join(', ')}`] : [];
            }),
          );
          if (duplicated.length > 0) {
            lastFailure = { rule: 'distinct' };
            throw new Error(`[PersonaAdapter] ${context} duplicated evidence: ${duplicated.join('; ')}`);
          }
        }
        if (verbatim) {
          const source = PersonaAdapter.normalizeVerbatim(verbatim.sourceText);
          // An empty input cannot be quoted; skip the check rather than
          // retry-looping over something the model had no text to quote.
          if (source.length > 0) {
            const nonVerbatim = slice.flatMap((rec, i) =>
              verbatim.fields.flatMap((field) =>
                PersonaAdapter.collectQuoteValues(rec, field)
                  .filter((q) => !source.includes(PersonaAdapter.normalizeVerbatim(q)))
                  .map((q) => `persona #${i + 1} ${field} "${q}" is not a verbatim fragment of the input`),
              ),
            );
            if (nonVerbatim.length > 0) {
              lastFailure = { rule: 'verbatim' };
              throw new Error(`[PersonaAdapter] ${context} non-verbatim evidence: ${nonVerbatim.join('; ')}`);
            }
          }
        }
        if (coverage) {
          const missing = slice.flatMap((rec, i) => {
            const list = Array.isArray(rec[coverage.listField])
              ? rec[coverage.listField] as Record<string, unknown>[]
              : [];
            const covered = new Set(list.map((e) => String(e?.[coverage.nameField] ?? '')));
            const needed = new Set([...coverage.requiredNames]);
            if (coverage.dynamicNamesField) {
              const dims = Array.isArray(rec[coverage.dynamicNamesField])
                ? rec[coverage.dynamicNamesField] as Record<string, unknown>[]
                : [];
              for (const d of dims) needed.add(String(d?.name ?? ''));
            }
            const uncovered = [...needed].filter((n) => n && !covered.has(n));
            return uncovered.length > 0
              ? [`persona #${i + 1} ${coverage.listField} missing entries for: ${uncovered.join(', ')}`]
              : [];
          });
          if (missing.length > 0) {
            lastFailure = { rule: 'coverage', detail: missing.join('; ') };
            throw new Error(`[PersonaAdapter] ${context} incomplete coverage: ${missing.join('; ')}`);
          }
        }
        return slice;
      } catch (err) {
        lastError = err;
        console.warn(`[PersonaAdapter] [${context}] Attempt ${attempt}/${attempts} failed: ${(err as Error).message}`);
      }
    }
    throw lastError;
  }

  /**
   * Generates a set of initial buyer personas based on a customer profile description.
   * Uses research-backed psychographic framework:
   * - Big Five (OCEAN): Joshi et al. (2025) — psychometric grounding
   * - Values, fears, communication style, decision style: Wang et al. (2024b) — psychographic specification
   */
  async generateInitialPersonas(personaDescription: string, count?: number): Promise<Persona[]> {
    const personaCount = count ?? 5;
    const system = `You are a persona generator creating realistic buyer personas for SaaS pricing evaluation.

Generate a JSON array of EXACTLY ${personaCount} DISTINCT personas matching this TypeScript interface:

interface Persona {
  id: string;
  name: string;
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];
  goals: string[];

  // Big Five Personality Traits (0-100) — Joshi et al. (2025) psychometric grounding
  conscientiousness: number;
  neuroticism: number;
  openness: number;
  extraversion: number;
  agreeableness: number;

  // Psychographic Specification — Wang et al. (2024b)
  values: string[];               // Core values driving decisions (2-4 items)
  fears: string[];                // Anxieties and risk concerns (2-3 items)
  communicationStyle: string;     // How they speak (e.g. "direct", "analytical", "warm", "cautious")
  decisionStyle: string;          // Decision process (e.g. "data-driven", "gut-driven", "consensus-seeking")

  // Pricing calibration — MUST be generated based on persona's role, industry, and experience
  pricingSensitivity: number;     // 0-100: Derived from Big Five + their role. A bootstrapped founder will be higher than a well-funded VP.
  typicalBudget: string;          // What they're used to paying based on their role and experience (e.g. "Up to $20/user/month")

  // Domain knowledge
  domainExpertise: string[];      // Domains they know well (e.g. ["cloud infrastructure", "B2B SaaS", "product management"])
}

COUNT ENFORCEMENT:
- You MUST return EXACTLY ${personaCount} persona objects in the JSON array — no more, no fewer.
- Before returning, count the personas in your array. If it is not exactly ${personaCount}, adjust before responding.
- Do NOT pad with filler personas. If you find yourself generating a duplicate or low-effort persona, replace it with a genuinely distinct one.

CRITICAL REQUIREMENTS:
- BIG FIVE ROOT CAUSES: Assign high-fidelity Big Five scalars (0-100). These are the "genes" of the persona.
- PRICING CALIBRATION: Derive pricingSensitivity and typicalBudget from the persona's Big Five, role, and the target market description. A well-funded VP of Engineering at a Series B will have very different expectations than a bootstrapped indie developer. This calibration MUST be consistent with their other psychographics.
- DOMAIN EXPERTISE: Generate 2-4 relevant domains based on the persona's role and the target market.
- CONSCIENTIOUSNESS: High=Meticulous/reads everything; Low=Chaotic/skips details.
- NEUROTICISM: High=Risk-averse/anxious about contract traps; Low=Bold/adventuresome.
- OPENNESS: High=Early adopter/curious about new tools; Low=Traditional/sticks with what works.
- EXTRAVERSION: High=Collaborative/seeks peer input; Low=Independent/self-directed.
- AGREEABLENESS: High=Trusting/takes recommendations; Low=Skeptical/challenges claims.
- VALUES + FEARS: These drive motivation. Must align with Big Five and pricing calibration.
- DISTRIBUTION: Ensure the ${personaCount} personas represent a spectrum across Big Five, pricing sensitivity, and decision styles.
- REALISM: Occupations, budgets, and goals must match the description.

Return ONLY valid JSON without explanatory text or markdown code blocks.`;

    const user = `Create EXACTLY ${personaCount} diverse personas for: "${personaDescription}". The array must contain precisely ${personaCount} elements — count before returning. Ensure a spectrum of decision-making styles and value systems.`;

    const content = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.llmService.smallTextModel,
        temperature: 0.7,
        purpose: "Generate Personas",
      },
    );

    const cleaned = stripCodeFence(content);
    console.log("[PersonaAdapter] Raw LLM persona generation response (first 2000 chars):", cleaned.slice(0, 2000));
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed))
        throw new Error("Expected JSON array from LLM");
      console.log("[PersonaAdapter] Successfully parsed", parsed.length, "personas from LLM");

      // Enforce count — truncate excess silently; throw on deficit so caller can retry.
      let personas = parsed;
      if (parsed.length > personaCount) {
        console.log("[PersonaAdapter] LLM returned", parsed.length, "personas — truncating to", personaCount);
        personas = parsed.slice(0, personaCount);
      } else if (parsed.length < personaCount) {
        console.warn("[PersonaAdapter] LLM returned", parsed.length, "personas — expected", personaCount);
        throw new Error(
          `Persona count mismatch: expected ${personaCount}, got ${parsed.length}. The generation will be retried automatically.`
        );
      }
      personas.forEach((p: any, i: number) => {
        console.log(`[PersonaAdapter] Persona ${i + 1}:`, JSON.stringify({
          name: p.name,
          occupation: p.occupation,
          bigFive: { C: p.conscientiousness, N: p.neuroticism, O: p.openness, E: p.extraversion, A: p.agreeableness },
          values: p.values,
          fears: p.fears,
          commStyle: p.communicationStyle,
          decisionStyle: p.decisionStyle,
        }));
      });

      // Deterministically pick neutral, curated names from GENDERLESS_NAMES so the LLM
      // does not invent potentially biased names on the fly. We seed the shuffle
      // with the personaDescription so the same input yields stable name assignments.
      const chosenNames = PersonaAdapter.neutralNames(personaDescription || "", personas.length);

      return personas.map(
        (p: Record<string, unknown>, idx: number) =>
          ({
            id: (p.id as string) ?? `persona-${idx}`,
            name: chosenNames[idx % chosenNames.length] ?? "Persona",
            age: typeof p.age === "number" ? p.age : Number(p.age) || 30,
            occupation: (p.occupation as string) ?? "Unknown",
            educationLevel: (p.educationLevel as string) ?? (p.education as string) ?? "Unknown",
            interests: Array.isArray(p.interests)
              ? (p.interests as string[])
              : p.interests
                ? [p.interests as string]
                : [],
            goals: Array.isArray(p.goals)
              ? (p.goals as string[])
              : p.goals
                ? [p.goals as string]
                : [],

            // Big Five — Joshi et al. (2025)
            conscientiousness: Number(p.conscientiousness) || 50,
            neuroticism: Number(p.neuroticism) || 50,
            openness: Number(p.openness) || 50,
            extraversion: Number(p.extraversion) || 50,
            agreeableness: Number(p.agreeableness) || 50,

            // Psychographic Specification — Wang et al. (2024b)
            values: Array.isArray(p.values)
              ? (p.values as string[])
              : p.values
                ? [p.values as string]
                : [],
            fears: Array.isArray(p.fears)
              ? (p.fears as string[])
              : p.fears
                ? [p.fears as string]
                : [],
            communicationStyle: (p.communicationStyle as string) ?? (p.communication_style as string) ?? "",
            decisionStyle: (p.decisionStyle as string) ?? (p.decision_style as string) ?? "",

            // Pricing calibration — LLM-generated, context-dependent
            pricingSensitivity: Number(p.pricingSensitivity) || 50,
            typicalBudget: (p.typicalBudget as string) ?? (p.budget as string) ?? "",

            // Domain knowledge
            domainExpertise: Array.isArray(p.domainExpertise)
              ? (p.domainExpertise as string[])
              : p.domainExpertise
                ? [p.domainExpertise as string]
                : [],

            backstory: (p.backstory as string) ?? (p.story as string) ?? undefined,
            generationMode: 'strategy' as const,
            behavioralDimensions: PersonaAdapter.extractBehavioralDimensions(p),
            evidenceLinks: [{
              transcriptId: 'user-input',
              excerpt: personaDescription.length > 200 ? personaDescription.slice(0, 200) + "..." : personaDescription,
              attribute: 'persona-description',
            }],
            provenance: {
              attributes: [
                { attribute: 'values', tier: 'interpreted' as const, confidence: 0.7 },
                { attribute: 'fears', tier: 'interpreted' as const, confidence: 0.7 },
                { attribute: 'goals', tier: 'interpreted' as const, confidence: 0.7 },
                { attribute: 'backstory', tier: 'synthetic' as const, confidence: 0.5 },
              ],
              generationMode: 'strategy' as const,
              overallConfidence: 0.7,
            },
          }) as Persona,
      );
    } catch (err) {
      throw new Error(
        `Failed to parse personas from LLM response: ${err}\nResponse was: ${cleaned}`,
      );
    }
  }

  /**
   * Streaming version of generateInitialPersonas using Vercel AI SDK's streamObject.
   */
  async * generateInitialPersonasStream(personaDescription: string, count?: number): AsyncIterable<Partial<Persona>[]> {
    const personaCount = count ?? 5;
    const system = `You are a persona generator creating realistic buyer personas for SaaS pricing evaluation.
Generate a JSON array of ${personaCount} DISTINCT personas matching this TypeScript interface:
interface Persona {
  id: string;
  name: string;
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];
  goals: string[];
  // Big Five (0-100)
  conscientiousness: number;
  neuroticism: number;
  openness: number;
  extraversion: number;
  agreeableness: number;
  // Psychographic Specification
  values: string[];           // Core values driving decisions
  fears: string[];            // Anxieties and risk concerns
  communicationStyle: string; // direct, analytical, cautious, etc.
  decisionStyle: string;      // data-driven, gut-driven, consensus-seeking, etc.
}
CRITICAL REQUIREMENTS:
- BIG FIVE ROOT CAUSES: Assign high-fidelity Big Five scalars (0-100). These are the "genes" of the persona.
- VALUES + FEARS: These drive motivation and must align with their Big Five profile.
- COMMUNICATION + DECISION STYLE: Must be consistent with their Big Five and occupation.
- DISTRIBUTION: Ensure the ${personaCount} personas represent a spectrum across Big Five, values, and decision styles.
Return ONLY valid JSON.`;

    const { partialOutputStream } = streamText({
      model: this.llmService.provider(this.llmService.smallTextModel),
      output: Output.array({
        element: PersonaSchema,
      }),
      system,
      prompt: `Create ${personaCount} diverse personas for: "${personaDescription}". Ensure a spectrum of decision-making styles and value systems.`,
    });

    if (!partialOutputStream) {
      throw new Error("partialOutputStream is not available. Ensure the model supports tool calling/structured output.");
    }

    for await (const partialArray of partialOutputStream) {
      yield partialArray as Partial<Persona>[];
    }
  }

  /**
   * Generates an extremely detailed and long backstory for a persona.
   */
  async generatePersonaBackstory(
    personaOrDescription: string | Persona,
    onProgress?: (part: number, totalParts: number) => void,
  ): Promise<string> {
    const totalParts = 4;
    let completedParts = 0;
    const personaText = typeof personaOrDescription === "string" ? personaOrDescription : JSON.stringify(personaOrDescription);

    const system = `You are a narrative psychologist conducting a deep interview to build a comprehensive life story of a buyer persona.
Your task: Build a RICH, LENGTHY, INTERNALLY CONSISTENT interview-style backstory (8000+ tokens).

VARY THE NARRATIVE ARC: Do NOT follow a fixed chronological outline. Each persona's story should feel like a different kind of interview — some start with a childhood memory, others with a recent failure, others with a heated opinion about a tool. The structure should feel organic and surprising.

Elements to weave in (pick what fits, vary the emphasis across personas):
- Childhood and family influences on their relationship with money
- Educational background and early career lessons
- Detailed financial journey: wins, failures, lessons learned
- Past purchasing decisions and how they shaped them
- Major life events that changed their worldview
- Current economic pressures and opportunities
- How they evaluate ROI on tools and services
- Specific examples of successful and failed purchases
- Values around efficiency, risk, and spending
- Communication style and decision-making pace
- Design aesthetic and living/working environment (optional — only where it illuminates character)

CRITICAL REQUIREMENTS (Deep Binding research):
- Write 8-12 substantial paragraphs, each 150-250 words
- MULTI-TURN DEPTH: This is an extended interview, not a summary
- CONSISTENCY: Every detail aligns with established facts. Reference earlier points.
- SPECIFICITY: Actual dollar amounts, brand names, company names, real scenarios
- AUTHENTICITY: First-person voice. Natural language.
- CAUSE-AND-EFFECT: Show HOW their life experiences led to their specific psychological profile. 
- PSYCHOLOGICAL ANCHORING: Their narrative MUST explain their Root Causes. 
  * If they have High Neuroticism, describe the specific loss or anxiety that caused it. 
  * If they are Low Conscientiousness, show their history of skipping details and the consequences.
  * Their decision-making pace and tone MUST match their Cognitive Reflex (System 1 vs. System 2).
This should feel like a real person's actual life story—messy, detailed, with depth.
Return plain text only. No labels, no markdown, no metadata. NO SUMMARIES OR HEADERS.`;

    const part1 = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Generate the first 2-3 paragraphs of a detailed backstory for this persona. Focus on their childhood, family, early financial lessons, and education:
${personaText}
Start the life story from the beginning. Write in first person. Be specific with names, places, and amounts.`,
        },
      ],
      { purpose: "Backstory Part 1" },
    );
    onProgress?.(++completedParts, totalParts);

    const part2 = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Continue this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\nNow write 2-3 paragraphs about their career progression, job changes, financial wins and failures. Include specific companies, roles, and amounts of money. Show how each experience shaped their current approach to spending and evaluating tools.`,
        },
      ],
      { purpose: "Backstory Part 2" },
    );
    onProgress?.(++completedParts, totalParts);

    const part3 = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Continue this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\n${part2}\nNow write 2-3 paragraphs about recent years and current situation. Include:\n- A specific "Purchasing Trauma" (a time they were scammed, locked into a bad contract, or lost substantial money on a tool). This will be their primary trigger.\n- Specific purchasing decisions they made recently.\n- Current financial pressures and opportunities.`,
        },
      ],
      { purpose: "Backstory Part 3" },
    );
    onProgress?.(++completedParts, totalParts);

    const part4 = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Finish this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\n${part2}\n${part3}\nNow write 2-3 final paragraphs that:\n- Describe their physical world: their home or office and their design taste. Explain how their conscientiousness (or lack thereof) manifests in their environment.\n- Articulate their core values around money, efficiency, and risk based on their entire life history.\n- Explain how they evaluate ROI on new tools.\n- Describe their decision-making pace (tied to their Cognitive Reflex and Neuroticism).\n- End with their current mindset.`,
        },
      ],
      { purpose: "Backstory Part 4" },
    );
    onProgress?.(++completedParts, totalParts);

    return [part1, part2, part3, part4].map(p => stripCodeFence(p).trim()).join("\n\n");
  }

  /**
   * Streaming version of generatePersonaBackstory.
   */
  async * generatePersonaBackstoryStream(personaOrDescription: Persona | string): AsyncIterable<string> {
    const personaText = typeof personaOrDescription === "string" ? personaOrDescription : JSON.stringify(personaOrDescription);
    const system = `You are a narrative psychologist conducting a deep interview to build a comprehensive life story of a buyer persona.
Your task: Build a RICH, LENGTHY, INTERNALLY CONSISTENT interview-style backstory (8000+ tokens) that reveals:
1. Childhood and family influences on their relationship with money
2. Educational background and early career lessons
3. Detailed financial journey: wins, failures, lessons learned
4. Past purchasing decisions and how they shaped them
5. Major life events that changed their worldview
6. Current economic pressures and opportunities
7. How they evaluate ROI on tools and services
8. Specific examples of successful and failed purchases
9. Values around efficiency, risk, and spending
10. Communication style and decision-making pace
11. Design Taste: Their preferred aesthetic (Minimalist, Brutalist, etc.) and a description of their living/working environment (Is it messy? Hyper-organized? Sterile? Cozy?). Describe how this environment reflects their personality scalars.
CRITICAL REQUIREMENTS (Deep Binding research):
- Write 8-12 substantial paragraphs, each 150-250 words
- MULTI-TURN DEPTH: This is an extended interview, not a summary
- CONSISTENCY: Every detail aligns with established facts. Reference earlier points.
- SPECIFICITY: Actual dollar amounts, brand names, company names, real scenarios
- AUTHENTICITY: First-person voice. Natural language.
- CAUSE-AND-EFFECT: Show HOW their life experiences led to their specific psychological profile. 
- PSYCHOLOGICAL ANCHORING: Their narrative MUST explain their Root Causes. 
  * If they have High Neuroticism, describe the specific loss or anxiety that caused it. 
  * If they are Low Conscientiousness, show their history of skipping details and the consequences.
  * Their decision-making pace and tone MUST match their Cognitive Reflex (System 1 vs. System 2).
This should feel like a real person's actual life story—messy, detailed, with depth.
Return plain text only. No labels, no markdown, no metadata. NO SUMMARIES OR HEADERS.`;

    let part1 = "";
    for await (const chunk of this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Generate the first 2-3 paragraphs of a detailed backstory for this persona. Focus on their childhood, family, early financial lessons, and education:
${personaText}
Start the life story from the beginning. Write in first person. Be specific with names, places, and amounts.`,
        },
      ],
      { purpose: "Backstory Part 1 (Stream)" },
    )) {
      part1 += chunk;
      yield chunk;
    }
    yield "\n\n";

    let part2 = "";
    for await (const chunk of this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Continue this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\nNow write 2-3 paragraphs about their career progression, job changes, financial wins and failures. Include specific companies, roles, and amounts of money. Show how each experience shaped their current approach to spending and evaluating tools.`,
        },
      ],
      { purpose: "Backstory Part 2 (Stream)" },
    )) {
      part2 += chunk;
      yield chunk;
    }
    yield "\n\n";

    let part3 = "";
    for await (const chunk of this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Continue this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\n${part2}\nNow write 2-3 paragraphs about recent years and current situation. Include:\n- A specific "Purchasing Trauma" (a time they were scammed, locked into a bad contract, or lost substantial money on a tool). This will be their primary trigger.\n- Specific purchasing decisions they made recently.\n- Current financial pressures and opportunities.`,
        },
      ],
      { purpose: "Backstory Part 3 (Stream)" },
    )) {
      part3 += chunk;
      yield chunk;
    }
    yield "\n\n";

    for await (const chunk of this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Finish this persona's backstory.\nPREVIOUS HISTORY:\n${part1}\n${part2}\n${part3}\nNow write 2-3 final paragraphs that:\n- Describe their physical world: their home or office and their design taste. Explain how their conscientiousness (or lack thereof) manifests in their environment.\n- Articulate their core values around money, efficiency, and risk based on their entire life history.\n- Explain how they evaluate ROI on new tools.\n- Describe their decision-making pace (tied to their Cognitive Reflex and Neuroticism).\n- End with their current mindset.`,
        },
      ],
      { purpose: "Backstory Part 4 (Stream)" },
    )) {
      yield chunk;
    }
  }

  /**
   * Generates a shorter, abbreviated backstory in a single LLM call.
   */
  async generateAbbreviatedBackstory(personaOrDescription: Persona | string): Promise<string> {
    const personaText = typeof personaOrDescription === "string" ? personaOrDescription : JSON.stringify(personaOrDescription);
    const system = this.getAbbreviatedBackstorySystemPrompt();

    return await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: `Generate a rich but concise backstory for this persona:\n${personaText}` },
      ],
      { purpose: "Abbreviated Backstory" },
    );
  }

  /**
   * Streaming version of abbreviated backstory.
   */
  async * generateAbbreviatedBackstoryStream(personaOrDescription: Persona | string): AsyncIterable<string> {
    const personaText = typeof personaOrDescription === "string" ? personaOrDescription : JSON.stringify(personaOrDescription);
    const system = this.getAbbreviatedBackstorySystemPrompt();

    yield* this.llmService.createChatCompletionStream(
      [
        { role: "system", content: system },
        { role: "user", content: `Generate a rich but concise backstory for this persona:\n${personaText}` },
      ],
      { purpose: "Abbreviated Backstory (Stream)" },
    );
  }

  /**
   * Batch version - generates backstories for ALL personas in a SINGLE LLM call.
   * Much faster than calling generateAbbreviatedBackstory for each persona.
   */
  async generateAbbreviatedBackstoriesBatch(personas: Persona[]): Promise<string[]> {
    const system = `You are a narrative psychologist building concise but RICH life stories for buyer personas.
For each persona, write a 3-5 paragraph backstory in first person, blunt language.

VARY THE NARRATIVE STRUCTURE across personas — do NOT repeat the same outline. Each persona's story should feel like a different type of narrative. Some might start with childhood, others with a career failure, others with their current frustrations. Make every backstory structurally distinct.

Include specific roles, names, dollar amounts, and anchor to their personality scalars.
Living/office environment details are optional — only include when they reveal personality.

Return a JSON array of strings, one backstory per persona.`;
    
    const personasText = personas.map((p, i) => 
      `Persona ${i + 1} (${p.name}, ${p.occupation}):\n${JSON.stringify(p, null, 2)}`
    ).join('\n\n---\n\n');

    const user = `Generate backstories for ALL ${personas.length} personas. Return a JSON array of strings.

${personasText}`;

    const result = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { 
        model: this.llmService.smallTextModel,
        temperature: 0.3,
        purpose: "Batch Abbreviated Backstories",
      },
    );

    try {
      const cleaned = stripCodeFence(result);
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length === personas.length) {
        return parsed;
      }
      console.warn("[PersonaAdapter] Batch backstory result length mismatch:", parsed.length, "vs", personas.length);
      console.warn("[PersonaAdapter] Raw result:", result.slice(0, 500));
      throw new Error("Length mismatch");
    } catch (e) {
      console.warn("[PersonaAdapter] Failed to parse batch backstories:", e);
      console.warn("[PersonaAdapter] Raw result:", result.slice(0, 500));
      const fallback: string[] = [];
      for (const persona of personas) {
        fallback.push(await this.generateAbbreviatedBackstory(persona));
      }
      return fallback;
    }
  }

  /**
   * Generates persona variations based on a reference persona and adjusted Big Five traits.
   * The LLM receives the reference persona as context, the adjusted Big Five to target,
   * and a variation level (0-100) that controls creative freedom.
   * All psychographic fields (values, fears, communicationStyle, decisionStyle, backstory)
   * are freshly generated to be consistent with the adjusted traits.
   */
  async generateVariationPersonas(
    referencePersona: Persona,
    adjustments: { bigFive: { conscientiousness: number; neuroticism: number; openness: number; extraversion: number; agreeableness: number }; variationLevel: number },
    count: number,
  ): Promise<Persona[]> {
    console.log("[PersonaAdapter.generateVariationPersonas] Generating", count, "variations for reference:", referencePersona.name);
    console.log("[PersonaAdapter.generateVariationPersonas] Adjustments:", JSON.stringify(adjustments));
    const system = `You are a persona generator creating realistic buyer personas for SaaS pricing evaluation.
Each persona is a variation based on a reference persona with specific Big Five trait adjustments.

Generate a JSON array of ${count} DISTINCT persona variations matching this TypeScript interface (omit the id field — it will be assigned server-side):

interface Persona {
  name: string;
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];
  goals: string[];
  conscientiousness: number;  // 0-100
  neuroticism: number;       // 0-100
  openness: number;          // 0-100
  extraversion: number;       // 0-100
  agreeableness: number;      // 0-100
  values: string[];           // 2-4 items
  fears: string[];            // 2-3 items
  communicationStyle: string; // e.g. "direct", "analytical", "warm", "cautious"
  decisionStyle: string;      // e.g. "data-driven", "gut-driven", "consensus-seeking"
  pricingSensitivity: number; // 0-100, derived from role + Big Five
  typicalBudget: string;      // e.g. "Up to $20/user/month"
  domainExpertise: string[];  // 2-4 relevant domains
  backstory: string;          // 3-5 paragraph narrative in first person
}

REFERENCE PERSONA (use as template for context, occupation, domain):
${JSON.stringify(referencePersona, null, 2)}

TARGET BIG FIVE VALUES (adjusted by user - your generated personas must use EXACTLY these values):
- Conscientiousness: ${adjustments.bigFive.conscientiousness}
- Neuroticism: ${adjustments.bigFive.neuroticism}
- Openness: ${adjustments.bigFive.openness}
- Extraversion: ${adjustments.bigFive.extraversion}
- Agreeableness: ${adjustments.bigFive.agreeableness}

VARIATION LEVEL: ${adjustments.variationLevel}/100
- LOW variation (0-30): Keep occupation, education level, and thematic domain similar to the reference persona. Generate new backstory, values, fears, goals, interests, communication style, and decision style that align with the adjusted Big Five.
- MEDIUM variation (31-70): Moderate changes to occupation and life context. The reference serves as loose inspiration.
- HIGH variation (71-100): Full creative freedom. Only the adjusted Big Five values are fixed. Occupation, background, and story can be entirely new while remaining in the same product/market domain.

CRITICAL REQUIREMENTS:
- The Big Five values you output MUST match the TARGET values above exactly.
- All other fields (values, fears, goals, interests, backstory, etc.) must be INTERNALLY CONSISTENT with the adjusted Big Five profile.
- DISTRIBUTION: Each variation should be a distinct persona, not a copy of the reference.
- CREATIVE BACKSTORIES: Each persona needs a compelling 3-5 paragraph first-person backstory that causally explains how their life experiences shaped their Big Five profile.
- REALISM: Occupations, budgets, and goals must feel authentic and market-appropriate.

Return ONLY valid JSON array without explanatory text or markdown code blocks.`;

    const user = `Generate ${count} distinct persona variations based on the reference persona "${referencePersona.name}" (${referencePersona.occupation}) with the specified Big Five adjustments and variation level ${adjustments.variationLevel}/100.`;

    console.log("[PersonaAdapter.generateVariationPersonas] Calling LLM with temperature:", 0.7 + (adjustments.variationLevel / 100) * 0.2);
    const content = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.llmService.smallTextModel,
        temperature: 0.7 + (adjustments.variationLevel / 100) * 0.2, // Scale temp with variation
        purpose: "Generate Variation Personas",
      },
    );

    const cleaned = stripCodeFence(content);
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error("Expected JSON array from LLM");
      console.log("[PersonaAdapter.generateVariationPersonas] Successfully parsed", parsed.length, "variations from LLM response");

      return parsed.map(
        (p: Record<string, unknown>, _idx: number) =>
          ({
            // id is intentionally omitted — the client assigns its own placeholder IDs
            name: (p.name as string) ?? `Variation ${_idx + 1}`,
            age: typeof p.age === "number" ? p.age : Number(p.age) || 30,
            occupation: (p.occupation as string) ?? "Unknown",
            educationLevel: (p.educationLevel as string) ?? "Unknown",
            interests: Array.isArray(p.interests) ? (p.interests as string[]) : [],
            goals: Array.isArray(p.goals) ? (p.goals as string[]) : [],

            // Big Five - use the target values directly for precision
            conscientiousness: Number(p.conscientiousness) || 50,
            neuroticism: Number(p.neuroticism) || 50,
            openness: Number(p.openness) || 50,
            extraversion: Number(p.extraversion) || 50,
            agreeableness: Number(p.agreeableness) || 50,

            values: Array.isArray(p.values) ? (p.values as string[]) : [],
            fears: Array.isArray(p.fears) ? (p.fears as string[]) : [],
            communicationStyle: (p.communicationStyle as string) ?? "",
            decisionStyle: (p.decisionStyle as string) ?? "",

            pricingSensitivity: Number(p.pricingSensitivity) || 50,
            typicalBudget: (p.typicalBudget as string) ?? "",

            domainExpertise: Array.isArray(p.domainExpertise) ? (p.domainExpertise as string[]) : [],
            backstory: (p.backstory as string) ?? "",
            generationMode: 'strategy' as const,
            behavioralDimensions: PersonaAdapter.extractBehavioralDimensions(p),
          }      ) as Persona,
      );
    } catch (err) {
      console.error("[PersonaAdapter.generateVariationPersonas] Failed to parse LLM response");
      throw new Error(
        `Failed to parse variation personas from LLM response: ${err}\nResponse was: ${cleaned}`,
      );
    }
  }

  private getAbbreviatedBackstorySystemPrompt(): string {
    return `You are a narrative psychologist building a concise but RICH life story of a buyer persona.
Build a 3-5 paragraph "Mini-Biography" (approx 800-1200 tokens).

VARY THE NARRATIVE STRUCTURE: Do NOT follow a fixed outline. Choose a different narrative approach for each persona — sometimes start with childhood, sometimes with the purchasing trauma, sometimes with a career pivot, sometimes with their current worldview. The structure should feel organic, not templated.

ELEMENTS TO WEAVE IN (in any order, skip some if they don't fit):
- Key life experiences that shaped their relationship with money and risk
- Career journey with specific roles and decisions
- A specific "Purchasing Trauma" (a bad deal or lost money)
- Current worldview, ROI evaluation style
- Living/office environment and design aesthetic (optional — only include when it reveals something about their personality)

CONCISE REQUIREMENTS:
- Speak in FIRST PERSON. Natural, blunt language.
- SPECIFICITY: Mention real roles, names, and dollar amounts.
- PSYCHOLOGICAL BINDING: Anchor their story to their scalars (Neuroticism, Conscientiousness, Cognitive Reflex).

Return plain text only. No headers, labels, or markdown.`;
  }

  async inferTraitsFromBackstory(backstory: string): Promise<InferredTraitsResponse> {
    const system = `You are a personality psychologist. Given a persona's backstory, infer their Big Five (OCEAN) personality traits and psychographic profile.

Return a JSON object with:
- conscientiousness: number 0-100 (High=Meticulous, Low=Chaotic)
- neuroticism: number 0-100 (High=Anxious, Low=Stable)
- openness: number 0-100 (High=Curious, Low=Traditional)
- extraversion: number 0-100 (High=Outgoing, Low=Solitary)
- agreeableness: number 0-100 (High=Compassionate, Low=Competitive)
- values: string[] (2-4 core values that drive their decisions)
- fears: string[] (2-3 anxieties or risk concerns)
- communicationStyle: string (e.g. "direct", "analytical", "warm", "cautious")
- decisionStyle: string (e.g. "data-driven", "gut-driven", "consensus-seeking")

Base your analysis on explicit life experiences, attitudes toward money/risk, and personality signals in the backstory. Return ONLY valid JSON.`;

    const user = `Infer the personality traits for this backstory:\n\n${backstory}`;

    const result = await this.llmService.createChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.llmService.smallTextModel,
        temperature: 0.3,
        purpose: "Infer Traits from Backstory",
      },
    );

    try {
      const cleaned = stripCodeFence(result);
      const parsed = JSON.parse(cleaned);
      const validated = InferredTraitsSchema.parse(parsed);
      return validated;
    } catch (e) {
      console.warn("[PersonaAdapter] Failed to parse inferred traits from LLM response:", e);
      console.warn("[PersonaAdapter] Raw result:", result.slice(0, 300));
      throw new Error(`Failed to infer traits from backstory: ${e}`);
    }
  }

  // --- Dual-Mode Persona Generation (2025 Philosophy) ---

  /**
   * Research Mode: evidence-first persona generation.
   * Minimal invention, no fabricated memories, provenance tracking on all attributes.
   *
   * Phased like strategy (decisions.md — persona-a-profile-backstory): one
   * batched profile call (evidence fields included, no backstory), then
   * per-persona parallel backstories grounded in the interview evidence.
   */
  async generateResearchPersonas(
    config: ResearchPersonaConfig,
    onPhase?: PersonaPhaseCallback,
  ): Promise<Persona[]> {
    onPhase?.("profiles", { completed: 0, total: 1 });
    const records = await this.generateResearchProfiles(config);
    onPhase?.("profiles", { completed: 1, total: 1 });

    const chosenNames = PersonaAdapter.neutralNames(config.personaDescription, records.length);
    const profiles = records.map((p, idx) => ({
      ...PersonaAdapter.extractBaseFields(p),
      name: chosenNames[idx % chosenNames.length] ?? "Persona",
      id: `research-persona-${idx}`,
      generationMode: "research" as const,
      behavioralDimensions: PersonaAdapter.extractBehavioralDimensions(p),
      bestFor: Array.isArray(p.bestFor) ? p.bestFor as string[] : undefined,
      lessReliableFor: Array.isArray(p.lessReliableFor) ? p.lessReliableFor as string[] : undefined,
      identityContext: typeof p.identityContext === 'string' ? p.identityContext : undefined,
      situationContext: typeof p.situationContext === 'string' ? p.situationContext : undefined,
      evidenceLinks: Array.isArray(p.evidenceLinks)
        ? p.evidenceLinks as { transcriptId: string; excerpt: string; attribute: string }[]
        : undefined,
    })) as Persona[];

    const limit = pLimit(4);
    let completedBackstories = 0;
    onPhase?.("backstories", { completed: 0, total: profiles.length });
    const backstories = await Promise.all(
      profiles.map((profile) =>
        limit(async () => {
          const story = await this.generateResearchBackstory(profile, config);
          onPhase?.("backstories", {
            completed: ++completedBackstories,
            total: profiles.length,
            personaName: profile.name,
          });
          return story;
        }),
      ),
    );

    return profiles.map((profile, idx) => {
      const dims = profile.behavioralDimensions ?? [];
      const attrProvenance = [
        { attribute: "values", tier: "interpreted" as const, confidence: 0.7 },
        { attribute: "fears", tier: "interpreted" as const, confidence: 0.7 },
        { attribute: "backstory", tier: "synthetic" as const, confidence: 0.4 },
        ...dims.map((d) => ({
          attribute: d.name,
          tier: (d.evidence ? "observed" : "interpreted") as "observed" | "interpreted",
          confidence: d.evidence ? 0.9 : 0.6,
          evidence: d.evidence,
        })),
      ];
      const computedConfidence = attrProvenance.length > 0
        ? Math.round(attrProvenance.reduce((sum, a) => sum + a.confidence, 0) / attrProvenance.length * 10) / 10
        : 0.7;
      return {
        ...profile,
        backstory: backstories[idx],
        provenance: {
          attributes: attrProvenance,
          generationMode: "research" as const,
          overallConfidence: computedConfidence,
        },
        evidenceLinks: (profile.evidenceLinks && profile.evidenceLinks.length > 0)
          ? profile.evidenceLinks
          : config.interviewIds
            ? config.interviewIds.map((id) => ({
                transcriptId: id,
                excerpt: `Quotes from interview ${id} fed into persona generation`,
                attribute: "overall-persona",
              }))
            : [],
      } as Persona;
    });
  }

  /**
   * Phase 1 of research generation: one batched call for all profiles.
   * Same tight schema as strategy; the prompt keeps the evidence-first,
   * interview-grounded contract. evidenceLinks is NOT client-required here —
   * when the LLM omits them, the mapping falls back to interview-derived
   * links (research has real transcripts to point at; strategy doesn't).
   */
  private static readonly RESEARCH_PROFILE_REQUIRED_FIELDS = [
    'age', 'occupation', 'educationLevel', 'interests', 'goals',
    'conscientiousness', 'neuroticism', 'openness', 'extraversion', 'agreeableness',
    'values', 'fears', 'communicationStyle', 'decisionStyle',
    'behavioralDimensions', 'valueEvidence', 'fearEvidence',
    'identityContext', 'situationContext',
  ] as const;

  private async generateResearchProfiles(config: ResearchPersonaConfig): Promise<Record<string, unknown>[]> {
    const system = `You are a research-grade persona generator. Your task is to create personas grounded in evidence.

CRITICAL RULES:
- Base all claims on the provided interview/description evidence.
- Do NOT fabricate specific life events, purchases, or trauma unless explicitly stated.
- For each behavioral dimension, include a direct quote from the source material as evidence.
- If the evidence is thin, say so rather than inventing details.
- MANDATORY: every persona must include ALL fields in the structure below with non-empty values. A persona missing any field is invalid.
- Do NOT invent names — names are assigned separately from a curated pool.

Generate a JSON array of EXACTLY ${config.count} DISTINCT personas with this structure:
{
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];
  goals: string[];
  conscientiousness: number (0-100);
  neuroticism: number (0-100);
  openness: number (0-100);
  extraversion: number (0-100);
  agreeableness: number (0-100);
  values: string[];
  valueEvidence: string[]; // Evidence quote for each value, parallel to values array
  fears: string[];
  fearEvidence: string[]; // Evidence quote for each fear, parallel to fears array
  communicationStyle: string;
  decisionStyle: string;
  domainExpertise: string[];
  behavioralDimensions: { name: string; score: number (0-100); context: string; description: string; evidence: string }[];
  identityContext: string; // Stable traits that apply across domains
  situationContext: string; // Contextual behavior specific to this domain
  bestFor: string[]; // What this persona model is good at predicting (2-4 items)
  lessReliableFor: string[]; // What this persona model is less reliable for (1-3 items)
  evidenceLinks: { transcriptId: string; excerpt: string; attribute: string }[]; // Direct quotes from source material
}`;

    const user = `Generate ${config.count} research-mode personas for: "${config.personaDescription}"
${config.interviewIds ? `Base on interview IDs: ${config.interviewIds.join(", ")}` : ""}
${config.evidenceThreshold ? `Minimum evidence confidence threshold: ${config.evidenceThreshold}` : ""}
${config.contextNotes ? `\nAdditional context: ${config.contextNotes}` : ""}`;

    return this.generatePersonaArray(
      system,
      user,
      config.count,
      "research-profiles",
      0.5,
      {
        schema: PersonaProfileSchema,
        requiredFields: PersonaAdapter.RESEARCH_PROFILE_REQUIRED_FIELDS,
      },
    );
  }

  /**
   * Research backstory: grounded in the source material, no fabricated
   * events. The Moon et al. (2024) rationale for rich narratives lives here.
   */
  private async generateResearchBackstory(profile: Persona, config: ResearchPersonaConfig): Promise<string> {
    const system = `You are a narrative writer crafting the life story of a buyer persona grounded in interview evidence.
Write a RICH backstory of 6-10 substantial paragraphs, in THIRD PERSON, referring to the persona by name (${profile.name}). Research (Moon et al. 2024, Anthology framework) shows that detailed narrative backstories yield 18-27% better behavioral consistency than short summaries. The narrative must:
- Be causally coherent with the persona's psychographic profile: values, fears, goals, Big Five, communication and decision style.
- Show HOW the persona's experiences led to their current traits and decision style.
- Be grounded in the provided interview/description evidence.
- NOT fabricate specific life events, purchases, or trauma unless explicitly stated in the evidence.
- If the evidence is thin, say so rather than inventing details.
- Never contradict the profile below.
Return plain text only. No labels, no markdown, no headers.`;

    const user = `Write the backstory for this persona, grounded in the evidence:\n${JSON.stringify(profile, null, 2)}${config.interviewIds ? `\nSource interviews: ${config.interviewIds.join(", ")}` : ""}${config.contextNotes ? `\nAdditional context: ${config.contextNotes}` : ""}`;
    return this.generateBackstoryWithRetry(profile, system, user);
  }

  /**
   * Strategy Mode: richer storytelling persona generation.
   * Allows representative assumptions and controlled synthetic details.
   *
   * Phased generation (decisions.md — persona-a-profile-backstory):
   * phase 1 generates the batched profiles WITHOUT backstory (diversity needs
   * in-batch prompting — per-persona profile calls homogenize), then phase 2
   * writes each persona's backstory in a parallel per-persona call, removing
   * the single-call latency wall and the field-skipping failure surface. A
   * backstory call failing after retries fails the whole run, naming the
   * persona — no hollow personas.
   */
  async generateStrategyPersonas(
    config: StrategyPersonaConfig,
    onPhase?: PersonaPhaseCallback,
  ): Promise<Persona[]> {
    onPhase?.("profiles", { completed: 0, total: 1 });
    const records = await this.generateStrategyProfiles(config);
    onPhase?.("profiles", { completed: 1, total: 1 });

    // Names are assigned between the phases, so the backstory call knows the
    // persona's name and can write a named third-person narrative.
    const chosenNames = PersonaAdapter.neutralNames(config.personaDescription, records.length);
    const profiles = records.map((p, idx) => ({
      ...PersonaAdapter.extractBaseFields(p),
      name: chosenNames[idx % chosenNames.length] ?? "Persona",
      id: `strategy-persona-${idx}`,
      generationMode: "strategy" as const,
      behavioralDimensions: PersonaAdapter.extractBehavioralDimensions(p),
      evidenceQuestions: PersonaAdapter.evidenceQuestionsFor(config.personaDescription, p),
      bestFor: Array.isArray(p.bestFor) ? p.bestFor as string[] : undefined,
      lessReliableFor: Array.isArray(p.lessReliableFor) ? p.lessReliableFor as string[] : undefined,
      identityContext: typeof p.identityContext === 'string' ? p.identityContext : undefined,
      situationContext: typeof p.situationContext === 'string' ? p.situationContext : undefined,
      evidenceLinks: Array.isArray(p.evidenceLinks)
        ? p.evidenceLinks as { transcriptId: string; excerpt: string; attribute: string }[]
        : undefined,
    })) as Persona[];

    // Phase 2: per-persona parallel backstories. p-limit caps concurrent calls
    // so a slow provider doesn't fan out unboundedly.
    const limit = pLimit(4);
    let completedBackstories = 0;
    onPhase?.("backstories", { completed: 0, total: profiles.length });
    const backstories = await Promise.all(
      profiles.map((profile) =>
        limit(async () => {
          const story = await this.generateStrategyBackstory(profile, config);
          onPhase?.("backstories", {
            completed: ++completedBackstories,
            total: profiles.length,
            personaName: profile.name,
          });
          return story;
        }),
      ),
    );

    return profiles.map((profile, idx) => {
      const dims = profile.behavioralDimensions ?? [];
      // LLM-decided per-attribute confidence (decisions.md —
      // persona-evidence-integrity): no hardcoded bands. The tier is derived
      // from the confidence purely for UI colors. `records` and `profiles`
      // are index-aligned (profiles = records.map), so the raw record is the
      // source of attributeConfidence.
      const confidenceFor = (name: string): { confidence: number; rationale?: string } => {
        const raw = records[idx];
        const list = Array.isArray(raw?.attributeConfidence)
          ? raw.attributeConfidence as { attribute: string; confidence: number; rationale?: string }[]
          : [];
        const entry = list.find((c) => c.attribute === name);
        return entry ? { confidence: entry.confidence, rationale: entry.rationale } : { confidence: 0.5 };
      };
      const tierFor = (confidence: number): 'observed' | 'interpreted' | 'synthetic' =>
        confidence >= 0.8 ? 'observed' : confidence >= 0.6 ? 'interpreted' : 'synthetic';
      const attrProvenance = [
        ...(['values', 'fears', 'goals', 'backstory'] as const).map((name) => {
          const { confidence, rationale } = confidenceFor(name);
          const evidence = name === 'values'
            ? profile.valueEvidence?.[0]
            : name === 'fears' ? profile.fearEvidence?.[0] : undefined;
          return {
            attribute: name,
            tier: tierFor(confidence),
            confidence,
            rationale,
            evidence,
            source: evidence ? 'your response' as const : undefined,
          };
        }),
        ...dims.map((d) => {
          const { confidence, rationale } = confidenceFor(d.name);
          return {
            attribute: d.name,
            tier: tierFor(confidence),
            confidence,
            rationale,
            evidence: d.evidence,
            source: d.evidence ? 'your response' as const : undefined,
          };
        }),
      ];
      const computedConfidence = attrProvenance.length > 0
        ? Math.round(attrProvenance.reduce((sum, a) => sum + a.confidence, 0) / attrProvenance.length * 10) / 10
        : 0.7;
      return {
        ...profile,
        backstory: backstories[idx],
        valueEvidence: Array.isArray(profile.valueEvidence) ? profile.valueEvidence : undefined,
        fearEvidence: Array.isArray(profile.fearEvidence) ? profile.fearEvidence : undefined,
        bestFor: Array.isArray(profile.bestFor) ? profile.bestFor : undefined,
        lessReliableFor: Array.isArray(profile.lessReliableFor) ? profile.lessReliableFor : undefined,
        identityContext: typeof profile.identityContext === 'string' ? profile.identityContext : undefined,
        situationContext: typeof profile.situationContext === 'string' ? profile.situationContext : undefined,
        provenance: {
          attributes: attrProvenance,
          generationMode: 'strategy' as const,
          overallConfidence: computedConfidence,
        },
      };
    }) as Persona[];
  }

  /**
   * Phase 1 of strategy generation: one batched call for all profiles.
   * Schema excludes backstory (written per-persona in phase 2); required-field
   * validation covers everything the verify judge needs minus the fields
   * assigned after generation (id, name, backstory), plus behavioralDimensions
   * (must be non-empty at profile time) and the evidence contract
   * (valueEvidence/fearEvidence are NOT required here — an empty quote is an
   * honest omission under the verbatim rule; identityContext/situationContext
   * are part of research parity).
   * evidenceLinks stays optional — the mapping falls back to a whole-input
   * excerpt rather than forcing per-attribute links through a retry.
   */
  private static readonly STRATEGY_PROFILE_REQUIRED_FIELDS = [
    'age', 'occupation', 'educationLevel', 'interests', 'goals',
    'conscientiousness', 'neuroticism', 'openness', 'extraversion', 'agreeableness',
    'values', 'fears', 'communicationStyle', 'decisionStyle',
    'behavioralDimensions',
    'identityContext', 'situationContext', 'evidenceLinks',
  ] as const;

  private async generateStrategyProfiles(config: StrategyPersonaConfig): Promise<Record<string, unknown>[]> {
    const system = `You are a strategic persona generator creating buyer personas for product decision-making.

GUIDELINES:
- Create vivid, believable personas that help teams empathize with target users.
- Synthetic details are ALLOWED when they help explain behavior.
- Do NOT add details that would CHANGE product decisions if they were false (counterfactual test).
- Do NOT invent names — names are assigned separately from a curated pool.
- MANDATORY: every persona must include ALL fields in the structure below with non-empty values. A persona missing any field is invalid.
- Every persona MUST include 3-5 behavioralDimensions.
- VERBATIM EVIDENCE (non-negotiable): every evidence quote — valueEvidence, fearEvidence, behavioralDimensions[].evidence, evidenceLinks[].excerpt — MUST be a word-for-word fragment of the user's response (the text in quotes in the prompt), copied exactly, wrapped in quotation marks. NEVER write a quote in the persona's invented voice. If no fragment of the user's response fits, OMIT the quote (leave it empty) rather than invent one — an honest gap beats a fabricated quote.
- It is better to leave a quote empty than to repeat a fragment or invent one — not every value or fear needs a quote; entries in valueEvidence/fearEvidence may be empty strings.
- Each valueEvidence/fearEvidence quote MUST be DISTINCT — never reuse the same quote for two different values or fears.
- evidenceLinks MUST quote the user's response; set attribute to the persona fields the quote supports.
- attributeConfidence MUST include exactly ONE entry per attribute — values, fears, goals, backstory, and every behavioral dimension (by its EXACT name). Confidence 0-1 rates how directly the user's response supports the attribute: high (0.8+) when stated, moderate (0.6-0.8) when implied, low (<0.6) when mostly inferred. rationale: one short sentence.

Generate a JSON array of EXACTLY ${config.count} DISTINCT personas with this structure:
{
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];              // Personal interests and hobbies (2-4 items)
  goals: string[];                  // Professional or personal goals (2-4 items)
  conscientiousness: number (0-100);
  neuroticism: number (0-100);
  openness: number (0-100);
  extraversion: number (0-100);
  agreeableness: number (0-100);
  values: string[];                 // Core values driving decisions (2-4 items)
  valueEvidence: string[];          // VERBATIM fragment of the user's response per value, parallel to values; empty string when no distinct fragment fits
  fears: string[];                  // Anxieties and risk concerns (2-3 items)
  fearEvidence: string[];           // VERBATIM fragment of the user's response per fear, parallel to fears; empty string when no distinct fragment fits
  communicationStyle: string;       // e.g. "direct", "analytical", "warm", "cautious"
  decisionStyle: string;            // e.g. "data-driven", "gut-driven", "consensus-seeking"
  domainExpertise: string[];        // Domains the persona knows well
  behavioralDimensions: { name: string; score: number (0-100); context: string; description: string; evidence: string }[];  // 3-5 dimensions; evidence is a VERBATIM quote from the user's response or empty
  bestFor: string[];                // What this persona model is good at predicting (2-4 items)
  lessReliableFor: string[];        // What this persona model is less reliable for (1-3 items)
  identityContext: string;          // Stable traits that apply across domains
  situationContext: string;         // Contextual behavior specific to this domain
  evidenceLinks: { transcriptId: string; excerpt: string; attribute: string }[];  // VERBATIM quotes from the user's response; transcriptId is "user-input"
  attributeConfidence: { attribute: string; confidence: number (0-1); rationale?: string }[];  // ONE entry per attribute: values, fears, goals, backstory, and each behavioral dimension by exact name
}`;

    const user = `Generate ${config.count} strategy-mode personas for: "${config.personaDescription}"
${config.icpDescription ? `ICP context: ${config.icpDescription}` : ""}
${config.contextNotes ? `Additional context: ${config.contextNotes}` : ""}`;

    return this.generatePersonaArray(
      system,
      user,
      config.count,
      "strategy-profiles",
      0.6,
      {
        schema: StrategyProfileSchema,
        requiredFields: PersonaAdapter.STRATEGY_PROFILE_REQUIRED_FIELDS,
        distinctFields: ['valueEvidence', 'fearEvidence'],
        verbatim: {
          sourceText: config.personaDescription,
          fields: ['valueEvidence', 'fearEvidence', 'behavioralDimensions.evidence', 'evidenceLinks.excerpt'],
        },
        coverage: {
          listField: 'attributeConfidence',
          nameField: 'attribute',
          requiredNames: ['values', 'fears', 'goals', 'backstory'],
          dynamicNamesField: 'behavioralDimensions',
        },
      },
    );
  }

  /**
   * Phase 2 backstory call, shared by strategy and research modes.
   * Per-persona, third person, name included. Retries twice per persona; when
   * both attempts fail the whole run fails loudly, naming the persona.
   */
  private async generateBackstoryWithRetry(profile: Persona, system: string, user: string): Promise<string> {
    const attempts = 2;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const story = await this.llmService.createChatCompletion(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          { model: this.llmService.smallTextModel, temperature: 0.7, purpose: "Persona Backstory", disableReasoning: true },
        );
        const cleaned = stripCodeFence(story).trim();
        if (!cleaned) throw new Error("empty backstory");
        return cleaned;
      } catch (err) {
        lastError = err;
        console.warn(`[PersonaAdapter] Backstory attempt ${attempt}/${attempts} for ${profile.name} failed: ${(err as Error).message}`);
      }
    }
    throw new Error(
      `Failed to generate backstory for persona "${profile.name}" (${profile.id}): ${(lastError as Error)?.message ?? "unknown error"}`,
    );
  }

  /**
   * Strategy backstory: narrative freedom, grounded in the questionnaire
   * description. Synthetic details allowed per config.
   */
  private async generateStrategyBackstory(profile: Persona, config: StrategyPersonaConfig): Promise<string> {
    const system = `You are a narrative writer crafting the life story of a buyer persona.
Write a RICH backstory of 6-10 substantial paragraphs, in THIRD PERSON, referring to the persona by name (${profile.name}). The narrative must:
- Be causally coherent with the persona's psychographic profile: values, fears, goals, Big Five, communication and decision style.
- Show HOW the persona's experiences led to their current traits and decision style.
- ${config.allowSyntheticBackstory ? "Synthetic details are permitted when they help explain behavior." : "Stay grounded in realistic scenarios without specific invented events."}
- Never contradict the profile below.
Storytelling level: ${config.storytellingLevel ?? "moderate"}.
Return plain text only. No labels, no markdown, no headers.`;

    const user = `Write the backstory for this persona:\n${JSON.stringify(profile, null, 2)}`;
    return this.generateBackstoryWithRetry(profile, system, user);
  }

  /**
   * Cluster Mode: synthetic representative personas from multiple interview signals.
   */
  async generateClusterPersonas(config: ClusterPersonaConfig): Promise<Persona[]> {
    const system = `You are a cluster-based persona generator. You synthesize representative personas from multiple interview subjects.

CRITICAL RULES:
- Each persona represents a CLUSTER of interview subjects, not an individual.
- Every attribute should reflect the CLUSTER's central tendency, not an individual's.
- Label the persona with cluster information including source count.

Generate a JSON array of EXACTLY ${config.count} personas with the standard structure.
Include a 'clusterInfo' field on each persona with the actual source IDs and count.`;

    const user = `Generate ${config.count} cluster-mode personas for cluster: "${config.clusterLabel}"
Source interview IDs: ${config.interviewIds.join(", ")}
Minimum cluster size: ${config.minClusterSize}
${config.personaDescription ? `Description hint: ${config.personaDescription}` : ""}`;

    try {
      const content = await this.llmService.createChatCompletion(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        {
          model: this.llmService.smallTextModel,
          temperature: 0.6,
          purpose: "Generate Cluster Personas",
        },
      );

      const records = PersonaAdapter.parsePersonaList(content, config.count, "cluster");
      return records.map((p, idx) => {
        const rawCi = p.clusterInfo as Record<string, unknown> | undefined;
        return {
          ...PersonaAdapter.extractBaseFields(p),
          id: `cluster-persona-${idx}`,
          generationMode: "cluster" as const,
          behavioralDimensions: PersonaAdapter.extractBehavioralDimensions(p),
          clusterInfo: {
            representedCount: Number(rawCi?.representedCount) || config.minClusterSize,
            sourceIds: Array.isArray(rawCi?.sourceIds) && rawCi!.sourceIds.length > 0
              ? rawCi!.sourceIds as string[]
              : [],
          },
          provenance: {
            attributes: [
              { attribute: "clusterInfo", tier: "observed" as const, confidence: 0.8 },
              { attribute: "backstory", tier: "synthetic" as const, confidence: 0.5 },
            ],
            generationMode: "cluster" as const,
            overallConfidence: 0.6,
          },
        } as Persona;
      });
    } catch (err) {
      throw new Error(
        `Failed to generate cluster personas: ${err}\nCluster: ${config.clusterLabel}`,
      );
    }
  }

  /**
   * Counterfactual test: checks whether synthetic persona details would change
   * product decisions. Returns failing details.
   * Mode-aware: research personas have stricter criteria than strategy.
   */
  async applyCounterfactualTest(persona: Persona): Promise<{ detail: string; reason: string; attribute?: string }[]> {
    const mode = persona.generationMode ?? "strategy";
    const criteria = mode === "research"
      ? "STRICT: Any synthetic detail not directly supported by evidence is automatically failing."
      : "STANDARD: Flag details that would CHANGE a product decision if they were false. Safe enrichment is allowed.";

    const system = `You are a counterfactual test evaluator. Given a persona and its details, identify which synthetic details
would CHANGE a product decision if they were false.

Mode: ${mode}
Criteria: ${criteria}

Apply the counterfactual removal test: "If this detail were false, would the team make a different product decision?"
- If YES → flag it as FAILING (the detail is too influential to be unverified)
- If NO → it PASSES (the detail is safe synthetic enrichment)

Return a JSON object:
{
  "failingDetails": [
    { "detail": "string - the specific detail that failed", "reason": "string - why it would change decisions", "attribute": "string - which persona attribute it belongs to" }
  ]
}`;

    const user = `Evaluate this ${mode}-mode persona for counterfactual test failure:

${JSON.stringify(persona, null, 2)}

Return ONLY the failing details. If none fail, return { "failingDetails": [] }.`;

    try {
      const content = await this.llmService.createChatCompletion(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        {
          model: this.llmService.smallTextModel,
          temperature: 0.3,
          purpose: "Counterfactual Test",
        },
      );

      const cleaned = stripCodeFence(content);
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.failingDetails)) {
        return parsed.failingDetails;
      }
      return [];
    } catch (err) {
      console.warn("[PersonaAdapter] Counterfactual test failed for persona", persona.name, ":", err);
      return [];
    }
  }
}

const InferredTraitsSchema = z.object({
  conscientiousness: z.number().min(0).max(100),
  neuroticism: z.number().min(0).max(100),
  openness: z.number().min(0).max(100),
  extraversion: z.number().min(0).max(100),
  agreeableness: z.number().min(0).max(100),
  values: z.array(z.string()),
  fears: z.array(z.string()),
  communicationStyle: z.string(),
  decisionStyle: z.string(),
});

/** Response type for backstory-based trait inference */
interface InferredTraitsResponse {
  conscientiousness: number;
  neuroticism: number;
  openness: number;
  extraversion: number;
  agreeableness: number;
  values: string[];
  fears: string[];
  communicationStyle: string;
  decisionStyle: string;
}

