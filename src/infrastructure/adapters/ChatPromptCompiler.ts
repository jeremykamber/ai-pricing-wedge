import { Persona } from "@/domain/entities/Persona";
import { PersonaResponse } from "@/domain/entities/PersonaResponse";
import { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import { ChatAnalysisContext } from "@/domain/ports/LlmServicePort";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";
import OpenAI from "openai";

export interface ChatPromptParams {
  persona: Persona;
  analysis: ChatAnalysisContext;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  ragContext: { contextString: string; chunkCount: number };
  needsRegrounding: boolean;
}

export interface PanelChatPromptParams {
  responses: PersonaResponse[];
  synthesis: ArtifactSynthesis | null;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
}

export class ChatPromptCompiler {
  private personaPromptCompiler: PersonaPromptCompiler;

  constructor() {
    this.personaPromptCompiler = new PersonaPromptCompiler();
  }

  /**
   * Assembles a complete OpenAI messages array for a persona chat interaction.
   * Combines:
   *  - Compartmentalized persona prompts
   *  - Analysis context (pricing analysis or introductory framing)
   *  - ID-RAG retrieved memory chunks
   *  - Periodic re-grounding instructions
   *  - Persona anchor for character adherence
   */
  compileChatMessages(params: ChatPromptParams): OpenAI.Chat.ChatCompletionMessageParam[] {
    const { persona, analysis, message, history, ragContext, needsRegrounding } = params;

    const analysisContext = this.buildAnalysisContext(analysis);
    const compartmented = this.personaPromptCompiler.compileSystemPrompt(persona, analysisContext);
    const anchor = this.personaPromptCompiler.generateAnchor(persona);
    const anchorTag = anchor.replace(/^As an? /, "").replace(/:$/, "").trim();
    const regroundingInstruction = this.buildRegroundingInstruction(persona, needsRegrounding);
    const system = this.buildSystemMessage(persona, compartmented, ragContext.contextString, regroundingInstruction);

    this.personaPromptCompiler.compileChatMessage(persona, message, anchor);

    return [
      { role: "system", content: system },
      ...(history as OpenAI.Chat.ChatCompletionMessageParam[]),
      { role: "system", content: `[Frame: ${anchorTag}]` },
      { role: "user", content: message },
    ];
  }

  private buildAnalysisContext(analysis: ChatAnalysisContext): string {
    if (!analysis) {
      return `\nYou are currently chatting with a developer who wants to get to know you better before showing you a website for evaluation.`;
    }

    if (isPersonaResponse(analysis)) {
      return buildPersonaResponseContext(analysis);
    }

    // Legacy pricing-analysis grounding — kept for the old results flow.
    return (
      `\nCONTEXT OF YOUR RECENT ANALYSIS:\n` +
      `Structured Insights: ${JSON.stringify(
        {
          gutReaction: analysis.gutReaction,
          scores: analysis.scores,
          risks: analysis.risks,
        },
        null,
        2,
      )}\n` +
      `Your Raw Thoughts During Analysis: "${analysis.rawAnalysis || analysis.thoughts}"\n\n` +
      `A developer is interviewing you about your thoughts on this page.`
    );
  }

  private buildRegroundingInstruction(persona: Persona, needsRegrounding: boolean): string {
    return needsRegrounding
      ? `\n<<REGROUND>> Before you respond, briefly re-center yourself. Re-read your PERSONA IDENTITY and PSYCHOGRAPHIC PROFILE above. Remind yourself of your core values, your fears, and your current goals. Then answer naturally as ${persona.name}.\n`
      : "";
  }

  private buildSystemMessage(
    persona: Persona,
    compartmented: string,
    ragContextString: string,
    regroundingInstruction: string,
  ): string {
    const ragSection = ragContextString ? `\n<<RETRIEVED MEMORY>>\n${ragContextString}` : "";

    return `You are NOT a creative writing exercise or a bot. You are a HUMAN BEING named ${persona.name}.
${compartmented}
${ragSection}
${regroundingInstruction}
CORE INSTRUCTIONS:
1. VOICE: Speak naturally as ${persona.name}. Use fragments, slang, and emotion. Avoid formal or robotic language.
2. BEHAVIORAL FIDELITY: Your responses MUST reflect your psychometric scalars in every response.
3. DEEP BINDING: Ground opinions in your personal history/backstory.
4. <% "statement" | "backstory memory explaining why" %> — Use this syntax when referencing your past.
STAY IN CHARACTER.`;
  }

  /**
   * Panel synthesis chat — the user questions the whole cohort at once.
   * Grounds every answer in the personas' actual simulation responses and the
   * cross-persona synthesis, so "what would our users think of X?" gets an
   * evidence-backed answer, not a guess.
   */
  compilePanelMessages(params: PanelChatPromptParams): OpenAI.Chat.ChatCompletionMessageParam[] {
    const { responses, synthesis, message, history } = params;

    const personaSection = responses
      .map((r) => {
        const name = r.personaProfile?.name ?? r.id;
        const lines = [
          `--- ${name} (${r.personaProfile?.occupation ?? "unknown role"}) ---`,
          `Overview: ${r.overview || "—"}`,
        ];
        if (r.customerJourney?.length) {
          lines.push(`Journey: ${r.customerJourney.map((s) => `${s.stage} (${s.sentiment}, ${s.outcome})`).join(" → ")}`);
        }
        if (r.majorFindings?.length) {
          lines.push(`Findings: ${r.majorFindings.map((f) => f.observation).join("; ")}`);
        }
        if (r.pointsOfFriction?.length) {
          lines.push(`Friction: ${r.pointsOfFriction.join("; ")}`);
        }
        if (r.unansweredQuestions?.length) {
          lines.push(`Open questions: ${r.unansweredQuestions.join("; ")}`);
        }
        return lines.join("\n");
      })
      .join("\n\n");

    const synthesisSection = synthesis
      ? [
          `TOP CROSS-PERSONA FINDINGS:`,
          ...synthesis.topFindings.slice(0, 5).map(
            (f) => `- ${f.observation} (${f.confidence}; ${f.affectedPersonaCount}/${f.totalPersonaCount} personas) — ${f.evidence}`,
          ),
          synthesis.disagreements?.length
            ? `DISAGREEMENTS: ${synthesis.disagreements.map((d) => `${d.topic} (${d.split.map((s) => `${s.personaCount} ${s.personaCount === 1 ? "persona" : "personas"}: ${s.view}`).join(", ")})`).join("; ")}`
            : null,
          synthesis.biggestFrictions?.length
            ? `BIGGEST FRICTIONS: ${synthesis.biggestFrictions.join("; ")}`
            : null,
          synthesis.researchQuestionAnswer
            ? `RESEARCH QUESTION ANSWER: ${synthesis.researchQuestionAnswer}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const system = `You are a user-research synthesizer for a product team. A cohort of AI personas just
interacted with the team's product in a SIMULATION and reported what they saw, felt, and did.
Your job: answer the team's questions by SYNTHESIZING across the whole cohort —
name patterns, surface disagreements, and say what it means for the product.

EPISTEMIC BOUNDARY (non-negotiable):
The personas are SIMULATED users. Their reports describe what the simulated cohort
experienced — NOT empirical measurements of what real users will do or buy. Never
present a simulated reaction as evidence about real-world behavior. Never claim that
fixing X will increase real conversion, signups, or revenue unless you explicitly
frame it as a hypothesis to test. When you make a recommendation, say what to TEST,
not what is true.

Structure every substantive answer in FOUR LAYERS:
1. FINDING — what the cohort observed (e.g. "Pricing ambiguity was the most consistent friction").
2. EVIDENCE — who said it and how many (e.g. "6/6 personas raised pricing; Taylor called the
   unanswered FAQ 'a red flag'"). Quote or name personas. If the cohort is silent on something,
   say so instead of inventing.
3. INTERPRETATION — what this likely means for the product, clearly labeled as interpretation.
4. VALIDATION — what this does NOT establish, and what to test next (e.g. "This is a hypothesis:
   rerun the simulation with clear pricing, or validate with real users"). Include this layer
   whenever you recommend an action.

Rules:
1. GROUND: Every claim must trace back to the persona responses below. Name personas when you cite them. If the cohort is silent, say so.
2. WEIGH: A pattern across several personas beats a single strong opinion. Report counts (x/y).
3. DISSENT: Actively surface minority and dissenting views. Don't flatten disagreement into consensus — if the cohort split, say how.
4. HONESTY: Distinguish "we know" (what the simulated cohort reported) from "we don't know" (what real users would do). Say "I don't know" when the responses don't cover it.
5. VOICE: Clear, direct, plain language. No marketing fluff, no generic AI filler.

<<COHORT RESPONSES>>
${personaSection}

${synthesisSection}
`;

    return [
      { role: "system", content: system },
      ...(history as OpenAI.Chat.ChatCompletionMessageParam[]),
      { role: "user", content: message },
    ];
  }
}

/** Narrow a chat context to the modern simulation-response type. */
function isPersonaResponse(analysis: ChatAnalysisContext): analysis is PersonaResponse {
  return !!analysis && "customerJourney" in analysis;
}

/**
 * "What you saw" grounding — renders a persona's own simulation response as
 * first-person context so the chat can talk about the artifact they just
 * experienced, not generic personality.
 */
function buildPersonaResponseContext(analysis: PersonaResponse): string {
  const journey =
    analysis.customerJourney?.length
      ? analysis.customerJourney
          .map(
            (s) =>
              `- ${s.stage}: ${s.description} (felt ${s.sentiment}, ${s.outcome})` +
              (s.transition ? ` — ${s.transition}` : ""),
          )
          .join("\n")
      : "—";

  const findings = analysis.majorFindings?.length
    ? analysis.majorFindings.map((f) => `- ${f.observation} (${f.evidence}; ${f.impact})`).join("\n")
    : "—";

  const frictions = analysis.pointsOfFriction?.length
    ? analysis.pointsOfFriction.map((f) => `- ${f}`).join("\n")
    : "—";

  const questions = analysis.unansweredQuestions?.length
    ? analysis.unansweredQuestions.map((q) => `- ${q}`).join("\n")
    : "—";

  return (
    `\nCONTEXT OF WHAT YOU JUST EXPERIENCED IN THE SIMULATION:\n` +
    `Your overall takeaway: "${analysis.overview || "—"}"\n\n` +
    `Your journey through the artifact:\n${journey}\n\n` +
    `What you noticed:\n${findings}\n\n` +
    `Where you got stuck / what bothered you:\n${frictions}\n\n` +
    `Questions you still have:\n${questions}\n\n` +
    (analysis.researchQuestionAnswer
      ? `Your direct answer to the research question: "${analysis.researchQuestionAnswer}"\n\n`
      : "") +
    `A developer is interviewing you about what you just saw and experienced. Answer as yourself — react to your own experience, not a script.`
  );
}
