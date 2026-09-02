import { LlmServiceImpl } from "./LlmServiceImpl";
import { ExtractedInterviewSignals, ExtractedSignal } from "@/application/interviewPipeline/types";
import { stripCodeFence } from "./llmUtils";

const SYSTEM_PROMPT = `You are analyzing a user interview transcript. Extract observable signals — specific behaviors, goals, pain points, values, and decision patterns mentioned by the interviewee. Do NOT infer personality traits or psychometrics. Only extract what is explicitly stated or clearly implied by the text.`;

/**
 * Pattern A adapter that extracts structured signals from interview transcripts
 * in a single LLM call. Designed for the interview → persona pipeline.
 */
export class InterviewSignalExtractor {
  constructor(private llmService: LlmServiceImpl) {}

  /**
   * Extracts structured signals from an interview transcript.
   * Uses response_format: json_object for reliable structured output.
   */
  async extract(transcript: string, interviewId: string): Promise<ExtractedInterviewSignals> {
    const userPrompt = this.buildPrompt(transcript, interviewId);

    const content = await this.llmService.createChatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      {
        response_format: { type: "json_object" },
        purpose: "Extract Interview Signals",
      },
    );

    return this.parseResponse(content, interviewId);
  }

  private buildPrompt(transcript: string, interviewId: string): string {
    return `Extract structured signals from the following interview transcript.

INTERVIEW ID: ${interviewId}

TRANSCRIPT:
${transcript}

Return a JSON object with this exact structure:
{
  "painPoints": [{ "text": "Normalized description", "quote": "Exact verbatim quote", "sourceSegmentId": "Brief segment reference" }],
  "goals": [{ "text": "Normalized description", "quote": "Exact verbatim quote", "sourceSegmentId": "Brief segment reference" }],
  "values": [{ "text": "Normalized description", "quote": "Exact verbatim quote", "sourceSegmentId": "Brief segment reference" }],
  "featureDesires": [{ "text": "Normalized description", "quote": "Exact verbatim quote", "sourceSegmentId": "Brief segment reference" }],
  "decisionPatterns": [{ "text": "Normalized description", "quote": "Exact verbatim quote", "sourceSegmentId": "Brief segment reference" }],
  "context": { "role": "Their role/title", "industry": "Their industry", "teamSize": "Team or company size" },
  "communicationStyle": "How they communicate",
  "salientQuotes": ["Memorable or emotionally charged verbatim quote"]
}

Rules:
- Only extract what is explicitly stated or clearly implied
- Do NOT infer personality traits or psychometrics
- Each signal MUST include a verbatim quote from the transcript
- Use empty arrays for categories with no signals found
- Use empty string for unknown context fields`;
  }

  private parseResponse(content: string, interviewId: string): ExtractedInterviewSignals {
    const cleaned = stripCodeFence(content);

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(
        `Failed to parse interview signals from LLM response: ${err}\nResponse (first 200 chars): ${content.slice(0, 200)}`,
      );
    }

    return {
      interviewId,
      painPoints: normalizeSignals(parsed.painPoints),
      goals: normalizeSignals(parsed.goals),
      values: normalizeSignals(parsed.values),
      featureDesires: normalizeSignals(parsed.featureDesires),
      decisionPatterns: normalizeSignals(parsed.decisionPatterns),
      context: {
        role: parsed.context?.role ?? "",
        industry: parsed.context?.industry ?? "",
        teamSize: parsed.context?.teamSize ?? "",
      },
      communicationStyle: parsed.communicationStyle ?? "",
      salientQuotes: Array.isArray(parsed.salientQuotes) ? parsed.salientQuotes : [],
    };
  }
}

function normalizeSignals(signals: unknown): ExtractedSignal[] {
  if (!Array.isArray(signals)) return [];
  return signals.map((s: any) => ({
    text: s.text ?? "",
    quote: s.quote ?? "",
    sourceSegmentId: s.sourceSegmentId ?? "",
  }));
}
