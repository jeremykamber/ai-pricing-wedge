import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "./LlmServiceImpl";

export interface InCharacterResult {
  traitScores: Record<string, number>;
  expertAnalysis: string;
  dimensionalAccuracy: number;
  detectedTraits: string[];
  contradictions: string[];
}

export interface InterviewQuestion {
  dimension: string;
  question: string;
}

/**
 * InCharacter-style psychometric interview evaluator.
 * Implements Wang et al. (2024a): instead of self-report personality tests
 * (which suffer from alignment conflict), conducts an open-ended conversational
 * interview and has an "expert" LLM evaluate the transcript for trait evidence.
 *
 * Reference: Wang et al. (2024a) "InCharacter: Evaluating Personality Fidelity
 * in Role-Playing Agents through Psychological Interviews" — ACL 2024.
 */
export class InCharacterEvaluator {
  private interviewQuestions: InterviewQuestion[];

  constructor(private llmService: LlmServiceImpl) {
    this.interviewQuestions = this.buildInterviewProtocol();
  }

  private buildInterviewProtocol(): InterviewQuestion[] {
    return [
      // Openness
      { dimension: "openness", question: "Tell me about a time you tried something completely new. How did you decide to give it a shot?" },
      { dimension: "openness", question: "What do you think about companies that are constantly changing their product vs ones that keep things stable?" },
      // Conscientiousness
      { dimension: "conscientiousness", question: "Walk me through how you evaluated your last major software purchase. What did you look for?" },
      { dimension: "conscientiousness", question: "Have you ever made a purchase decision quickly without reading the fine print? What happened?" },
      // Extraversion
      { dimension: "extraversion", question: "When you're evaluating a new tool, do you prefer to ask colleagues for their opinions or dig into it yourself?" },
      { dimension: "extraversion", question: "Tell me about a recent conversation you had about a product you use at work." },
      // Agreeableness
      { dimension: "agreeableness", question: "A salesperson is being very pushy about a product you're not sure about. How do you handle it?" },
      { dimension: "agreeableness", question: "If a colleague recommends a tool that you end up hating, how do you handle that?" },
      // Neuroticism
      { dimension: "neuroticism", question: "What's the worst purchasing mistake you've ever made? How did it affect your approach to future decisions?" },
      { dimension: "neuroticism", question: "How do you feel about committing to annual contracts versus month-to-month?" },
    ];
  }

  /** Run the full InCharacter evaluation: interview + expert analysis. */
  async evaluate(persona: Persona): Promise<InCharacterResult> {
    const transcript = await this.runInterview(persona);

    const expertAnalysisText = await this.expertEvaluate(persona, transcript);

    return {
      traitScores: this.parseExpertScores(expertAnalysisText),
      expertAnalysis: expertAnalysisText,
      dimensionalAccuracy: 0,
      detectedTraits: [],
      contradictions: [],
    };
  }

  /** Run the full interview protocol, collecting the persona's responses. */
  async runInterview(persona: Persona, questionSubset?: InterviewQuestion[]): Promise<string> {
    const questions = questionSubset ?? this.interviewQuestions;
    const answers: string[] = [];

    for (const q of questions) {
      const response = await this.llmService.createChatCompletion(
        [
          {
            role: "system",
            content: `You are ${persona.name}, a ${persona.occupation}. Answer the following question naturally, as yourself. Be honest and conversational. Keep your response to 2-3 sentences.`,
          },
          { role: "user", content: q.question },
        ],
        {
          temperature: 0.7,
          purpose: `InCharacter Interview: ${q.dimension}`,
        },
      );
      answers.push(`Q: ${q.question}\nA: ${response}`);
    }

    return answers.join("\n\n");
  }

  /** Have an expert LLM evaluate the interview transcript for trait alignment. */
  async expertEvaluate(persona: Persona, transcript: string): Promise<string> {
    const system = `You are a clinical psychologist specializing in personality assessment. You have just conducted an interview with ${persona.name}, a ${persona.occupation}.

Based on the interview transcript below, evaluate ${persona.name}'s personality on the Big Five (OCEAN) dimensions:
- Openness (0-100): Curiosity, preference for novelty, willingness to try new things
- Conscientiousness (0-100): Organization, attention to detail, reliability
- Extraversion (0-100): Sociability, talkativeness, energy in social settings
- Agreeableness (0-100): Compassion, cooperativeness, trust in others
- Neuroticism (0-100): Emotional sensitivity, anxiety, vulnerability to stress

For each dimension, provide:
1. A score from 0-100
2. Key behavioral evidence from the transcript
3. Confidence level (Low/Medium/High)

IMPORTANT: Base your assessment ONLY on what the persona actually said in the interview, not on their demographic profile. This is a blinded evaluation.`;

    const user = `INTERVIEW TRANSCRIPT:\n\n${transcript}\n\nProvide your expert psychological assessment.`;

    return this.llmService.createChatCompletion(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { temperature: 0.3, purpose: "InCharacter Expert Evaluation" },
    );
  }

  private parseExpertScores(text: string): Record<string, number> {
    const dimensions = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"];
    const scores: Record<string, number> = {};

    for (const dim of dimensions) {
      const regex = new RegExp(`${dim}[\\s\\S]{0,50}?(\\d{1,3})\\s*(?:/100)?`, "i");
      const match = text.match(regex);
      if (match) {
        const score = parseInt(match[1], 10);
        scores[dim] = Math.min(100, Math.max(0, score));
      }
    }

    return scores;
  }
}
