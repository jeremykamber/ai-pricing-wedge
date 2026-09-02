import OpenAI from "openai";
import { IMemoryServicePort } from "@/domain/ports/IMemoryServicePort";
import { InteractionStep } from "@/domain/entities/InteractionStep";
import { stripCodeFence } from "./llmUtils";

/**
 * Adapter for Memory Service using an LLM to summarize interaction history.
 * Implements IMemoryServicePort to provide "Current State of Mind" summaries.
 */
export class LlmMemoryAdapter implements IMemoryServicePort {
  private client: OpenAI;
  private model: string;

  constructor(client: OpenAI, model: string) {
    this.client = client;
    this.model = model;
  }

  /**
   * Factory method to create an instance from environment variables.
   */
  static createFromEnv(): LlmMemoryAdapter {
    const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    const client = new OpenAI({
      baseURL,
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    return new LlmMemoryAdapter(client, model);
  }

  /**
   * Summarizes a list of interaction steps into a 2-sentence "Current State of Mind".
   */
  async summarizeSteps(steps: InteractionStep[]): Promise<string> {
    const stepsText = steps.map((s, i) =>
      `Step ${i + 1}:
Url: ${s.url}
Action: ${s.action}
Element: ${s.elementDescription}
Thought: ${s.thought}`
    ).join("\n\n");

    const prompt = `
You are an expert at synthesizing user interaction history into a concise summary of their current "State of Mind".

Given the following list of raw interaction steps taken by a persona on a website, summarize their current mindset in exactly 2 sentences. 
Focus on what they have learned, what they are currently looking for, and their emotional/rational progress towards a purchase decision.

RAW STEPS:
${stepsText}

SUMMARY (Exactly 2 sentences, start each sentence with an active subject, e.g., "The persona is..." or "They feel..."):
`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: "You are a behavioral psychologist summarizing user session data." },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 150,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No response from Memory LLM");
      }

      return stripCodeFence(content).trim();
    } catch (error) {
      console.error("[LlmMemoryAdapter] Error summarizing steps:", error);
      throw new Error(`Failed to summarize steps: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
