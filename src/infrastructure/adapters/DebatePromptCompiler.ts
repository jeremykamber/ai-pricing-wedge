import type { Persona } from "@/domain/entities/Persona";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";

/**
 * Deterministic prompt builder for debate turns.
 * Reuses PersonaPromptCompiler for identity/psychographic/epistemic/guardrail sections.
 * Adds debate-specific context (proposal, participants, transcript, round info).
 * All trait-based directives are compiled from Big Five values — no LLM calls.
 */
export class DebatePromptCompiler {
  private baseCompiler = new PersonaPromptCompiler();

  /**
   * Build a complete system prompt for one persona's turn in the debate.
   *
   * @param persona — The persona whose turn it is
   * @param participants — All debate participants (for listing opponents)
   * @param proposal — The proposal being debated
   * @param transcript — Formatted transcript of prior messages
   * @param round — Current round number (1-indexed)
   * @param totalRounds — Total rounds in this debate
   */
  buildPersonaPrompt(
    persona: Persona,
    participants: Persona[],
    proposal: string,
    transcript: string,
    round: number,
    totalRounds: number,
  ): string {
    const identitySection = this.baseCompiler.compileSystemPrompt(persona);
    const debateContext = this.buildDebateContext(persona, participants, proposal);
    const debateState = this.buildDebateState(transcript, round, totalRounds);
    const traitDirectives = this.getTraitDirectives(persona);
    const responseInstructions = this.getResponseInstructions();

    return [
      identitySection,
      "",
      "<<DEBATE CONTEXT>>",
      debateContext,
      "",
      "<<CURRENT DEBATE STATE>>",
      debateState,
      "",
      "<<TRAIT-BASED DIRECTIVES>>",
      ...traitDirectives,
      "",
      "<<YOUR RESPONSE>>",
      responseInstructions,
    ].join("\n");
  }

  private buildDebateContext(persona: Persona, participants: Persona[], proposal: string): string {
    const others = participants
      .filter((p) => p.id !== persona.id)
      .map((p) => {
        const values = p.values?.length ? p.values.slice(0, 3).join(", ") : "general business concerns";
        return `- ${p.name} (${p.occupation}): cares about ${values}`;
      })
      .join("\n");

    const roleLabel = this.deriveRoleLabel(persona);

    return [
      `Proposal: "${proposal}"`,
      "",
      "You are debating this proposal with:",
      others,
      "",
      `Your role: ${roleLabel}`,
    ].join("\n");
  }

  private deriveRoleLabel(persona: Persona): string {
    const occ = persona.occupation.toLowerCase();
    if (/ceo|cto|cfo|founder|chief|executive/.test(occ)) return "Strategic decision-maker — focused on business impact and risk";
    if (/vp|vice president|head|director|svp/.test(occ)) return "Organizational leader — balancing team capacity against business goals";
    if (/product manager|product owner|pm/.test(occ)) return "User advocate — focused on customer needs and product-market fit";
    if (/engineer|developer|architect|software/.test(occ)) return "Technical realist — focused on feasibility, complexity, and quality";
    if (/designer|ux|design/.test(occ)) return "Experience advocate — focused on user needs and design quality";
    if (/marketing|growth|sales/.test(occ)) return "Market strategist — focused on positioning, messaging, and conversion";
    return "Cross-functional stakeholder — balancing multiple perspectives";
  }

  private buildDebateState(transcript: string, round: number, totalRounds: number): string {
    const lines: string[] = [`Round ${round} of ${totalRounds}`];
    if (round === 1) {
      lines.push("Awaiting first responses.");
    } else {
      lines.push("Here is what has been said so far:");
      lines.push(transcript);
    }
    return lines.join("\n");
  }

  /**
   * Deterministic trait directives compiled from Big Five values.
   * These drive authentic disagreement without an LLM moderator.
   */
  private getTraitDirectives(persona: Persona): string[] {
    const directives: string[] = [];

    if (persona.neuroticism >= 60) {
      directives.push("- Your risk awareness is high — scrutinize optimistic claims and timelines");
    }
    if (persona.neuroticism <= 40) {
      directives.push("- You're naturally optimistic — don't let others' risk aversion dampen your openness");
    }
    if (persona.agreeableness <= 40) {
      directives.push("- Challenge assumptions others present — push for evidence");
    }
    if (persona.agreeableness >= 60) {
      directives.push("- Seek common ground, but don't sacrifice your position to avoid friction");
    }
    if (persona.openness >= 60) {
      directives.push("- You're open to new approaches — explore creative solutions even if unconventional");
    }
    if (persona.openness <= 40) {
      directives.push("- You prefer proven approaches — be skeptical of unproven ideas");
    }
    if (persona.conscientiousness >= 70) {
      directives.push("- Attend to details others may miss — timelines, costs, and dependencies matter");
    }
    if (persona.conscientiousness <= 40) {
      directives.push("- Trust your instincts over elaborate planning — speed matters");
    }
    if (persona.extraversion >= 60) {
      directives.push("- Engage actively with each participant — build on their ideas");
    }
    if (persona.extraversion <= 40) {
      directives.push("- Take time to think before responding — your reflective perspective adds depth");
    }

    return directives;
  }

  private getResponseInstructions(): string {
    return [
      "- Address specific points made by each participant who has spoken",
      "- If you disagree with something, challenge it directly using your own reasoning",
      "- Ground your position in your values, experience, and role",
      "- Keep your response to 2-3 paragraphs",
      "- Speak naturally — this is a strategy discussion among colleagues",
    ].join("\n");
  }
}
