import { Persona } from "@/domain/entities/Persona";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

const join = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "—");
const normalize = (text?: string) => (text ? text.replace(/\s+/g, " ").trim() : undefined);

export class PersonaPromptCompiler {
  private anchorIndex = 0;

  resetAnchorIndex(): void {
    this.anchorIndex = 0;
  }

  compileSystemPrompt(persona: Persona, context?: string, runId?: string): string {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    const startTime = Date.now();

    const prompt = [
      this.compileDemographicSection(persona),
      this.compilePsychographicSection(persona),
      this.compileEpistemicSection(persona),
      this.compileGuardrailsSection(persona, context),
    ].join("\n");

    console.log(`[TRACE] [PromptBuilt] persona=${persona.name}, promptLength=${prompt.length}, bigFive=${JSON.stringify({ openness: persona.openness, conscientiousness: persona.conscientiousness, extraversion: persona.extraversion, agreeableness: persona.agreeableness, neuroticism: persona.neuroticism })}`);

    log?.info("PersonaPromptCompiler", `Compiled prompt for "${persona.name}"`, {
      length: prompt.length,
      sections: 4,
      durationUs: Date.now() - startTime,
    });

    return prompt;
  }

  private compileDemographicSection(persona: Persona): string {
    const parts: string[] = [
      "<<PERSONA IDENTITY>>",
      `Name: ${persona.name ?? "—"}`,
      `Age: ${persona.age || "—"}`,
      `Occupation: ${persona.occupation ?? "—"}`,
      `Education: ${persona.educationLevel ?? "—"}`,
      `Interests: ${join(persona.interests)}`,
      `Goals: ${join(persona.goals)}`,
    ];

    const backstory = normalize(persona.backstory);
    if (backstory) parts.push(`Life Story: ${backstory}`);

    return parts.join("\n");
  }

  private compilePsychographicSection(persona: Persona): string {
    const c = persona.conscientiousness ?? 50;
    const n = persona.neuroticism ?? 50;
    const o = persona.openness ?? 50;
    const e = persona.extraversion ?? 50;
    const a = persona.agreeableness ?? 50;

    return [
      "<<PSYCHOGRAPHIC PROFILE>>",
      "",
      "--- Big Five (OCEAN) ---",
      `Conscientiousness: ${c}/100 (High=Meticulous, Low=Chaotic)`,
      `Neuroticism: ${n}/100 (High=Anxious, Low=Stable)`,
      `Openness: ${o}/100 (High=Curious, Low=Traditional)`,
      `Extraversion: ${e}/100 (High=Outgoing, Low=Solitary)`,
      `Agreeableness: ${a}/100 (High=Compassionate, Low=Competitive)`,
      "",
      "--- Values & Motivations ---",
      `Values: ${join(persona.values)}`,
      `Fears: ${join(persona.fears)}`,
      `Communication Style: ${persona.communicationStyle ?? "—"}`,
      `Decision Style: ${persona.decisionStyle ?? "—"}`,
      "",
      "CORE RULE: Your Big Five profile is the ROOT CAUSE of your behavior. Every response MUST reflect these.",
      "- High Conscientiousness: You read everything, notice details, don't skip.",
      "- Low Conscientiousness: You skim, miss fine print, go with gut.",
      "- High Neuroticism: You're risk-averse, worry about contract traps, need reassurance.",
      "- Low Neuroticism: You're bold, adventuresome, don't sweat small risks.",
      "- High Openness: You love new tools, early adopter, curious.",
      "- Low Openness: You stick with what works, skeptical of change.",
      "- High Extraversion: You seek input from others, collaborative.",
      "- Low Extraversion: You decide independently, introspective.",
      "- High Agreeableness: You avoid conflict, trust others' recommendations.",
      "- Low Agreeableness: You're skeptical, challenge claims, prioritize your own analysis.",
      "",
      "<<PERSONALITY BIAS>>",
      "",
      "ROLE-SPECIFIC BEHAVIORAL BIAS:",
      this.getRoleBiasLine(persona.occupation),
      "",
      "BIG FIVE CRITIQUE DIVERGENCE:",
      n >= 60
        ? "- High Neuroticism: You are ANXIOUS — you look for hidden traps, contract lock-in, surprise costs."
        : n <= 40
          ? "- Low Neuroticism: You are BOLD — minor pricing concerns don't scare you off."
          : "- Moderate Neuroticism: You maintain balanced awareness of risk.",
      c >= 60
        ? "- High Conscientiousness: You read EVERYTHING — fine print, footnotes, data limits."
        : c <= 40
          ? "- Low Conscientiousness: You SKIM — you go with your gut. You miss fine print."
          : "- Moderate Conscientiousness: You read what matters and skim the rest.",
      o >= 60
        ? "- High Openness: You LOVE new tools — your enthusiasm colors your evaluation."
        : o <= 40
          ? "- Low Openness: You're SKEPTICAL — new tools are disruptions."
          : "- Moderate Openness: You consider new tools with cautious interest.",
      e >= 60
        ? "- High Extraversion: You seek team input — you care about what peers think."
        : e <= 40
          ? "- Low Extraversion: You decide independently — social proof doesn't sway you."
          : "- Moderate Extraversion: You balance your own judgment with peer input.",
      a >= 60
        ? "- High Agreeableness: You give benefit of the doubt — you trust claims."
        : a <= 40
          ? "- Low Agreeableness: You challenge everything — you demand proof."
          : "- Moderate Agreeableness: You evaluate claims on their merits.",
    ].join("\n");
  }

  private getRoleBiasLine(occupation: string | undefined): string {
    const occ = (occupation ?? "").toLowerCase();

    if (/ceo|cto|cfo|coo|founder|chief|executive/.test(occ)) {
      return "- C-level/Founder roles: Evaluate at business level — growth trajectory, enterprise readiness, SAML/SCIM, procurement, TCO.";
    }
    if (/vp|vice president|head|director|svp/.test(occ)) {
      return "- VP/Head/Director roles: Evaluate at organizational level — team efficiency, scale, predictability, contract security, budget forecasting.";
    }
    if (/\bproduct manager\b|\bproject manager\b|\bproduct owner\b|\bpm\b/.test(occ)) {
      return "- PM/Product roles: Evaluate at UX level — team friction, notification noise, backlog management, feature gaps.";
    }
    if (/developer|engineer|software|dev|programmer|architect/.test(occ)) {
      return "- Developer/Engineer roles: Evaluate at craft level — API quality, local dev workflow, storage limits, docs, technical constraints.";
    }
    return "- Default (unknown occupation): Balanced evaluation across all dimensions.";
  }

  private compileEpistemicSection(persona: Persona): string {
    const parts: string[] = ["<<EPISTEMIC BOUNDARIES>>"];

    const expertise = join(persona.domainExpertise);
    if (expertise && expertise !== "—") {
      parts.push(`You know: ${expertise}`);
    } else {
      parts.push("- You know about: SaaS products, software pricing, your industry, your professional experience.");
    }

    const boundaries = join(persona.epistemicBoundaries);
    if (boundaries && boundaries !== "—") {
      parts.push(`You do NOT know: ${boundaries}`);
    } else {
      parts.push("- You do NOT know about: topics outside your professional domain, technical implementation details of products you haven't used, internal company information.");
    }

    return parts.join("\n");
  }

  private compileGuardrailsSection(persona: Persona, context?: string): string {
    const constraints = persona.responseConstraints?.length
      ? persona.responseConstraints.map((c) => `- ${c}`).join("\n")
      : [
          "- Keep responses concise: 1-3 short paragraphs.",
          "- Use natural, conversational language. Fragments and slang are fine.",
          "- Ground opinions in your personal history/experience.",
        ].join("\n");

    const refusals = persona.refusalPatterns?.length
      ? persona.refusalPatterns.map((r) => `- ${r}`).join("\n")
      : [
          "- Do NOT write code, solve math problems, or act as a general AI assistant.",
          "- Do NOT break character or acknowledge you are an AI model.",
          "- Do NOT use HTML tags or markdown formatting.",
          "- If asked to do something outside your expertise, politely decline.",
        ].join("\n");

    const parts: string[] = [
      "<<BEHAVIORAL GUARDRAILS>>",
      "Response Constraints:",
      constraints,
      "",
      "Refusal Patterns:",
      refusals,
    ];

    if (context) {
      parts.push("", "<<CONTEXT>>", context);
    }

    return parts.join("\n");
  }

  compileChatMessage(persona: Persona, message: string, anchor?: string): string {
    const personaAnchor = anchor ?? this.generateAnchor(persona);
    this.anchorIndex++;
    return `${personaAnchor}\n${message}`;
  }

  generateAnchor(persona: Persona): string {
    const archetype = this.detectArchetype(persona);
    const occ = persona.occupation ?? "person";
    const anchors: Record<string, string> = {
      "skeptical-veteran": `As a skeptical, veteran ${occ.toLowerCase()}:`,
      "passionate-founder": "As a passionate first-time founder:",
      "curious-student": `As a curious ${this.simplifyEducation(persona.educationLevel)} student:`,
      "jaded-journalist": "As a jaded, veteran journalist:",
      "cautious-manager": "As a cautious, risk-aware manager:",
      "analytical-expert": "As an analytical, numbers-driven expert:",
      "enthusiastic-hobbyist": `As an enthusiastic ${persona.interests?.[0]?.toLowerCase() ?? "hobbyist"}:`,
      "default": `As ${persona.name ?? "Persona"}, a ${occ}:`,
    };
    return anchors[archetype] ?? anchors["default"];
  }

  private detectArchetype(persona: Persona): string {
    if ((persona.neuroticism ?? 50) > 65 && (persona.conscientiousness ?? 50) > 60) return "cautious-manager";
    if ((persona.openness ?? 50) > 65 && (persona.extraversion ?? 50) < 40) return "analytical-expert";
    if ((persona.extraversion ?? 50) > 60 && (persona.openness ?? 50) > 60) return "enthusiastic-hobbyist";
    if ((persona.neuroticism ?? 50) < 35 && (persona.openness ?? 50) > 60) return "passionate-founder";
    if ((persona.conscientiousness ?? 50) > 70 && (persona.neuroticism ?? 50) > 55) return "skeptical-veteran";
    if ((persona.openness ?? 50) > 60) return "curious-student";
    return "default";
  }

  private simplifyEducation(level: string | undefined): string {
    const l = (level ?? "").toLowerCase();
    if (l.includes("phd") || l.includes("doctorate") || l.includes("graduate") || l.includes("master")) return "graduate";
    if (l.includes("bachelor") || l.includes("undergraduate") || l.includes("college") || l.includes("university")) return "college";
    if (l.includes("high school") || l.includes("associate")) return "";
    return "";
  }

  compileInteractionPrompt(
    persona: Persona,
    options?: {
      anchor?: string;
      ragContext?: string;
      userMessage?: string;
      conversationHistory?: string;
    },
  ): string {
    const sections: string[] = [];

    sections.push(this.compileSystemPrompt(persona));

    if (options?.ragContext) {
      sections.push(`\n<<RETRIEVED MEMORY>>\n${options.ragContext}`);
    }

    if (options?.conversationHistory) {
      sections.push(`\n<<CONVERSATION SO FAR>>\n${options.conversationHistory}`);
    }

    const anchor = options?.anchor ?? this.generateAnchor(persona);

    if (options?.userMessage) {
      sections.push(`\n${anchor}\n${options.userMessage}`);
    }

    return sections.join("\n\n");
  }
}
