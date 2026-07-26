import { Persona, PersonaSchema } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { streamText, Output } from "ai";
import { z } from "zod";
import { stripCodeFence } from "./llmUtils";
import { GENDERLESS_NAMES } from "@/data/genderless_names";

export class PersonaAdapter {
  constructor(private llmService: LlmServiceImpl) { }

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
      const seedFrom = (s: string) => {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      };

      const mulberry32 = (a: number) => () => {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };

      const seededShuffle = (arr: string[], seed: number) => {
        const copy = arr.slice();
        const rnd = mulberry32(seed);
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };

      const seed = seedFrom(personaDescription || "");
      const chosenNames = seededShuffle(GENDERLESS_NAMES, seed);

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

