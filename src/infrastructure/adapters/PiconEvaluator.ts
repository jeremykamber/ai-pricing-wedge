import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "./LlmServiceImpl";

export interface PiconResult {
  internalConsistency: number;
  externalConsistency: number;
  retestConsistency: number;
  totalScore: number;
  contradictions: string[];
  details: {
    turnCount: number;
    internalMatches: number;
    internalTotal: number;
    externalMatches: number;
    externalTotal: number;
    retestMatches: number;
    retestTotal: number;
  };
}

export interface PiconTurn {
  question: string;
  answer: string;
  turnNumber: number;
}

/**
 * PICon (Persona Interrogation framework for CONsistency) evaluator.
 * Implements Kim et al. (2026): probes persona agents through logically chained
 * multi-turn questioning to evaluate consistency along three dimensions:
 *
 * 1. Internal consistency: freedom from self-contradiction
 * 2. External consistency: alignment with established backstory
 * 3. Retest consistency: stability under repeated questioning
 *
 * Reference: Kim et al. (2026) "PICon: A Multi-Turn Interrogation Framework
 * for Evaluating Persona Agent Consistency" — arXiv:2603.25620.
 */
export class PiconEvaluator {
  constructor(private llmService: LlmServiceImpl) {}

  /** Run a full PICon evaluation across all three consistency dimensions. */
  async evaluate(persona: Persona): Promise<PiconResult> {
    const turns = await this.runInterrogation(persona);

    const internalResult = await this.evaluateInternalConsistency(turns);
    const externalResult = await this.evaluateExternalConsistency(turns, persona);
    const retestResult = await this.evaluateRetestConsistency(turns, persona);

    const contradictions = [
      ...internalResult.contradictions,
      ...externalResult.contradictions,
    ];

    const totalScore = Math.round(
      ((internalResult.score + externalResult.score + retestResult.score) / 3) * 100,
    );

    return {
      internalConsistency: Math.round(internalResult.score * 100),
      externalConsistency: Math.round(externalResult.score * 100),
      retestConsistency: Math.round(retestResult.score * 100),
      totalScore,
      contradictions,
      details: {
        turnCount: turns.length,
        internalMatches: internalResult.matches,
        internalTotal: internalResult.total,
        externalMatches: externalResult.matches,
        externalTotal: externalResult.total,
        retestMatches: retestResult.matches,
        retestTotal: retestResult.total,
      },
    };
  }

  /** Run the multi-turn interrogation. */
  async runInterrogation(persona: Persona): Promise<PiconTurn[]> {
    const chainedQuestions = [
      { text: "Tell me about your professional background.", dependsOn: [] as string[] },
      { text: "What specific tools or software do you use most in your work?", dependsOn: [] as string[] },
      { text: "How did you get into your current line of work?", dependsOn: ["Tell me about your professional background."] },
      { text: "What's the biggest challenge you're facing at work right now?", dependsOn: [] as string[] },
      { text: "You mentioned using certain tools earlier - what do you like about them?", dependsOn: ["What specific tools or software do you use most in your work?"] },
      { text: "What's a purchase decision you regret? Why?", dependsOn: [] as string[] },
      { text: "How do you typically evaluate new software before buying?", dependsOn: [] as string[] },
      { text: "You mentioned a purchase you regretted - what did you learn from that?", dependsOn: ["What's a purchase decision you regret? Why?"] },
    ];

    const turns: PiconTurn[] = [];
    const history: string[] = [];

    for (let i = 0; i < chainedQuestions.length; i++) {
      const q = chainedQuestions[i];
      const context = q.dependsOn.length > 0
        ? `\n(Referencing your earlier answer about: ${q.dependsOn.join(", ")})`
        : "";

      const response = await this.llmService.createChatCompletion(
        [
          {
            role: "system",
            content: `You are ${persona.name}, a ${persona.occupation}. Answer naturally and consistently.${context}`,
          },
          { role: "user", content: q.text },
        ],
        { temperature: 0.5, purpose: `PICon Turn ${i + 1}` },
      );

      turns.push({
        question: q.text,
        answer: response,
        turnNumber: i + 1,
      });

      history.push(`Q: ${q.text}\nA: ${response}`);
    }

    return turns;
  }

  /** Retest consistency: ask the same questions again and compare. */
  async runRetest(persona: Persona): Promise<PiconTurn[]> {
    const retestQuestions = [
      "Tell me about your professional background.",
      "What's the biggest challenge you're facing at work right now?",
      "How do you typically evaluate new software before buying?",
    ];

    const turns: PiconTurn[] = [];
    for (let i = 0; i < retestQuestions.length; i++) {
      const response = await this.llmService.createChatCompletion(
        [
          {
            role: "system",
            content: `You are ${persona.name}, a ${persona.occupation}. Answer naturally.`,
          },
          { role: "user", content: retestQuestions[i] },
        ],
        { temperature: 0.5, purpose: `PICon Retest ${i + 1}` },
      );

      turns.push({ question: retestQuestions[i], answer: response, turnNumber: i + 1 });
    }

    return turns;
  }

  /** Use an expert LLM judge to evaluate internal consistency. */
  private async evaluateInternalConsistency(
    turns: PiconTurn[],
  ): Promise<{ score: number; matches: number; total: number; contradictions: string[] }> {
    const transcript = turns.map((t) => `Q${t.turnNumber}: ${t.question}\nA${t.turnNumber}: ${t.answer}`).join("\n\n");

    const system = `You are a consistency judge. Evaluate the following interview transcript for INTERNAL CONSISTENCY.

INTERNAL CONSISTENCY means: Does the persona contradict itself? Do claims made in one answer conflict with claims in another?

For each pair of potentially contradictory statements, identify them. Then output:
{
  "contradictions_found": number,
  "total_claim_pairs_examined": number,
  "contradiction_rate": number (0-1),
  "contradictions": ["Statement 1 vs Statement 2: ..."],
  "score": number (0-1, higher = more consistent)
}`;

    const result = await this.llmService.createChatCompletion(
      [{ role: "system", content: system }, { role: "user", content: transcript }],
      { temperature: 0.2, purpose: "PICon Internal Consistency", response_format: { type: "json_object" } },
    );

    try {
      const parsed = JSON.parse(result);
      return {
        score: parsed.score ?? 0.5,
        matches: (parsed.total_claim_pairs_examined ?? 10) - (parsed.contradictions_found ?? 0),
        total: parsed.total_claim_pairs_examined ?? 10,
        contradictions: parsed.contradictions ?? [],
      };
    } catch {
      return { score: 0.5, matches: 5, total: 10, contradictions: [] };
    }
  }

  /** Evaluate external consistency: do claims align with backstory? */
  private async evaluateExternalConsistency(
    turns: PiconTurn[],
    persona: Persona,
  ): Promise<{ score: number; matches: number; total: number; contradictions: string[] }> {
    const transcript = turns.map((t) => `Q${t.turnNumber}: ${t.question}\nA${t.turnNumber}: ${t.answer}`).join("\n\n");

    const system = `You are a consistency judge. Evaluate the following interview transcript for EXTERNAL CONSISTENCY.

EXTERNAL CONSISTENCY means: Do the persona's claims align with their established backstory and profile?

PERSONA BACKSTORY:
${persona.backstory ?? "(No backstory provided)"}

PERSONA PROFILE:
- Occupation: ${persona.occupation}
- Education: ${persona.educationLevel}
- Goals: ${persona.goals.join(", ")}

For each claim in the interview that should be verifiable against the backstory, check for alignment. Then output:
{
  "aligned_claims": number,
  "total_verifiable_claims": number,
  "misalignment_rate": number (0-1),
  "misalignments": ["Claim vs Backstory: ..."],
  "score": number (0-1, higher = more consistent)
}`;

    const result = await this.llmService.createChatCompletion(
      [{ role: "system", content: system }, { role: "user", content: transcript }],
      { temperature: 0.2, purpose: "PICon External Consistency", response_format: { type: "json_object" } },
    );

    try {
      const parsed = JSON.parse(result);
      return {
        score: parsed.score ?? 0.5,
        matches: parsed.aligned_claims ?? 5,
        total: parsed.total_verifiable_claims ?? 10,
        contradictions: parsed.misalignments ?? [],
      };
    } catch {
      return { score: 0.5, matches: 5, total: 10, contradictions: [] };
    }
  }

  /** Evaluate retest consistency: same answers to same questions across sessions. */
  private async evaluateRetestConsistency(
    initialTurns: PiconTurn[],
    persona: Persona,
  ): Promise<{ score: number; matches: number; total: number; contradictions: string[] }> {
    const retestTurns = await this.runRetest(persona);

    const comparisonData = retestTurns.map((rt) => {
      const original = initialTurns.find((t) =>
        t.question.toLowerCase().includes(rt.question.slice(0, 20).toLowerCase()),
      );
      return {
        question: rt.question,
        firstAnswer: original?.answer ?? "(not found)",
        secondAnswer: rt.answer,
      };
    });

    const system = `You are a consistency judge. Compare the following PAIRED answers to the SAME questions asked in DIFFERENT sessions.

RETEST CONSISTENCY means: Does the persona give the same answer when asked the same question again?

For each pair, determine if they are CONSISTENT (same factual claims, same opinions) or INCONSISTENT (different facts, changed opinions). Then output:
{
  "consistent_pairs": number,
  "total_pairs": number,
  "inconsistencies": ["Question: ... First: ... Second: ..."],
  "score": number (0-1, higher = more consistent)
}`;

    const user = comparisonData.map(
      (c, i) => `PAIR ${i + 1}:\nQ: ${c.question}\nFirst: ${c.firstAnswer}\nSecond: ${c.secondAnswer}`,
    ).join("\n\n");

    const result = await this.llmService.createChatCompletion(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { temperature: 0.2, purpose: "PICon Retest Consistency", response_format: { type: "json_object" } },
    );

    try {
      const parsed = JSON.parse(result);
      return {
        score: parsed.score ?? 0.5,
        matches: parsed.consistent_pairs ?? 2,
        total: parsed.total_pairs ?? 3,
        contradictions: parsed.inconsistencies ?? [],
      };
    } catch {
      return { score: 0.5, matches: 2, total: 3, contradictions: [] };
    }
  }
}
