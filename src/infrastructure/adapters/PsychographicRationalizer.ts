import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "./LlmServiceImpl";

export interface PsychologicalScaffold {
  label: string;
  generate(persona: Persona, contextNotes?: string): Promise<string>;
}

export interface PbjRationale {
  scaffold: string;
  rationale: string;
}

/**
 * PB&J (Psychology of Behavior and Judgments) scaffold enhancer.
 * Implements Joshi et al. (2025): augments personas with LLM-generated
 * rationales grounded in psychological scaffolds (Big Five, Primal World
 * Beliefs) that explain WHY a persona holds specific traits and judgments.
 *
 * The generated rationales are appended to the persona's backstory as a
 * <<PSYCHOLOGICAL RATIONALES (PB&J)>> section, creating causal coherence
 * between the Big Five profile and the psychographic spec.
 *
 * Reference: Joshi et al. (2025) "Improving LLM Personas via Rationalization
 * with Psychological Scaffolds" — Findings of EMNLP 2025.
 */
export class PsychographicRationalizer {
  private scaffolds: PsychologicalScaffold[];

  constructor(private llmService: LlmServiceImpl) {
    this.scaffolds = this.buildScaffolds();
  }

  /**
   * Generate PB&J rationales for each psychological scaffold, then return
   * a combined rationale text that can be appended to the persona's backstory.
   */
  async rationalizeBackstory(persona: Persona, contextNotes?: string): Promise<string> {
    const rationales = await this.generateAllRationales(persona, contextNotes);
    return this.formatRationales(rationales);
  }

  /**
   * Generate rationales for all psychological scaffolds in parallel.
   */
  async generateAllRationales(persona: Persona, contextNotes?: string): Promise<PbjRationale[]> {
    const results = await Promise.allSettled(
      this.scaffolds.map(async (scaffold) => {
        const text = await scaffold.generate(persona, contextNotes);
        return { scaffold: scaffold.label, rationale: text };
      }),
    );

    const rationales: PbjRationale[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        rationales.push(result.value);
      }
    }
    return rationales;
  }

  private buildScaffolds(): PsychologicalScaffold[] {
    return [
      {
        label: "Big Five Personality Roots",
        generate: async (persona: Persona, contextNotes?: string) => {
          const system = "You are a personality psychologist. Given a persona's Big Five profile, explain in 2-3 sentences why they have each trait level based on plausible life experiences. Ground the explanation in the persona's actual context — use their occupation, stated values, fears, and any interview evidence provided.";
          const contextSection = contextNotes
            ? `\n\nINTERVIEW EVIDENCE (use this to ground your rationales — reference specific statements, pain points, and experiences):\n${contextNotes}`
            : "";
          const user = [
            `Persona: ${persona.name}, ${persona.occupation}`,
            `Conscientiousness: ${persona.conscientiousness}/100 (High=Meticulous, Low=Chaotic)`,
            `Neuroticism: ${persona.neuroticism}/100 (High=Anxious, Low=Stable)`,
            `Openness: ${persona.openness}/100 (High=Curious, Low=Traditional)`,
            `Extraversion: ${persona.extraversion}/100 (High=Outgoing, Low=Solitary)`,
            `Agreeableness: ${persona.agreeableness}/100 (High=Compassionate, Low=Competitive)`,
            `Values: ${(persona.values ?? []).join(", ")}`,
            `Fears: ${(persona.fears ?? []).join(", ")}`,
            contextSection,
            "",
            `Explain the psychological roots of each trait level using the Big Five framework. Focus on cause-and-effect: "This person has high X because...". Where interview evidence is available, reference specific statements or experiences that shaped these traits. Then explain how these traits connect to their stated values and fears.`,
          ].join("\n");
          return this.llmService.createChatCompletion(
            [{ role: "system", content: system }, { role: "user", content: user }],
            { purpose: "PB&J Big Five Scaffold", temperature: 0.5 },
          );
        },
      },
      {
        label: "Decision Style & Values Integration",
        generate: async (persona: Persona, contextNotes?: string) => {
          const system = "You are a behavioral economist. Explain how this persona's Big Five profile and decision style manifest in their real-world decision-making, and how their values and fears drive their choices. Reference specific evidence when available.";
          const contextSection = contextNotes
            ? `\n\nINTERVIEW EVIDENCE (ground your analysis in these actual statements):\n${contextNotes}`
            : "";
          const user = [
            `Persona: ${persona.name}, ${persona.occupation}`,
            `Conscientiousness: ${persona.conscientiousness}/100`,
            `Neuroticism: ${persona.neuroticism}/100`,
            `Openness: ${persona.openness}/100`,
            `Extraversion: ${persona.extraversion}/100`,
            `Agreeableness: ${persona.agreeableness}/100`,
            `Decision Style: ${persona.decisionStyle}`,
            `Communication Style: ${persona.communicationStyle}`,
            `Values: ${(persona.values ?? []).join(", ")}`,
            `Fears: ${(persona.fears ?? []).join(", ")}`,
            contextSection,
            "",
            `Describe their default decision-making process when evaluating a new tool or service. How do their Big Five traits drive their decision style? How do their values and fears manifest in the specific things they look for and the red flags they watch out for? Where evidence is available, reference specific statements or experiences.`,
          ].join("\n");
          return this.llmService.createChatCompletion(
            [{ role: "system", content: system }, { role: "user", content: user }],
            { purpose: "PB&J Decision Scaffold", temperature: 0.5 },
          );
        },
      },
      {
        label: "Core Values & Risk Worldview",
        generate: async (persona: Persona, contextNotes?: string) => {
          const system = "You are a values psychologist. Based on the persona's complete profile, articulate their core values around money, risk, efficiency, and trust in 2-3 sentences. Ground your analysis in the available evidence.";
          const contextSection = contextNotes
            ? `\n\nINTERVIEW EVIDENCE (use specific statements to support your analysis):\n${contextNotes}`
            : "";
          const user = [
            `Persona: ${persona.name}, ${persona.occupation}`,
            `Neuroticism: ${persona.neuroticism}/100 (High=Risk-averse)`,
            `Openness: ${persona.openness}/100 (High=Early adopter)`,
            `Agreeableness: ${persona.agreeableness}/100 (High=Trusting)`,
            `Values: ${(persona.values ?? []).join(", ")}`,
            `Fears: ${(persona.fears ?? []).join(", ")}`,
            `Goals: ${persona.goals.join(", ")}`,
            persona.backstory ? `Backstory excerpt: ${persona.backstory.slice(0, 500)}` : "",
            contextSection,
            "",
            "Explain what they fundamentally value when making decisions about tools and services. How do they weigh cost vs quality? What makes them trust (or distrust) a vendor? Connect their values and fears back to their Big Five profile. Where evidence is available, reference specific statements or experiences.",
          ].join("\n");
          return this.llmService.createChatCompletion(
            [{ role: "system", content: system }, { role: "user", content: user }],
            { purpose: "PB&J Values Scaffold", temperature: 0.5 },
          );
        },
      },
    ];
  }

  private formatRationales(rationales: PbjRationale[]): string {
    if (rationales.length === 0) return "";
    const parts = rationales.map(
      (r) => `[${r.scaffold}]\n${r.rationale.trim()}`,
    );
    return `\n\n<<PSYCHOLOGICAL RATIONALES (PB&J)>>\n${parts.join("\n\n")}`;
  }
}
