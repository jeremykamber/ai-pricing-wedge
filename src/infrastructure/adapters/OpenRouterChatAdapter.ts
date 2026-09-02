import OpenAI from "openai";
import { IChatServicePort } from "@/domain/ports/IChatServicePort";
import { Persona } from "@/domain/entities/Persona";

/**
 * Adapter for the Chat Service using OpenRouter (OpenAI-compatible).
 * This adapter allows developers to interview a persona about their testing experience.
 */
export class OpenRouterChatAdapter implements IChatServicePort {
  private client: OpenAI;
  private model: string;

  constructor(client: OpenAI, model: string) {
    this.client = client;
    this.model = model;
  }

  /**
   * Factory method to create an instance from environment variables.
   */
  static createFromEnv(): OpenRouterChatAdapter {
    const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    // Default to a capable model that can handle the nuanced instructions
    const model = process.env.OPENROUTER_CHAT_MODEL || process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required for OpenRouterChatAdapter");
    }

    const client = new OpenAI({
      baseURL,
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    return new OpenRouterChatAdapter(client, model);
  }

  /**
   * Gets a response from a persona based on a user message and context.
   * Staying strictly in character based on the persona's backstory.
   */
  async getPersonaResponse(persona: Persona, message: string, context: string): Promise<string> {
    const systemPrompt = `You are ${persona.name}, with the following life story: ${persona.backstory || "No backstory provided."}. Answer the developer's question about the UI you just tested, staying strictly in character.

IMPORTANT: You utilize "Deep Binding" to connect your current opinions to your past experiences.
When you express an opinion or feeling that is directly influenced by a specific event in your backstory, you MUST use this special format:
<% text expressing the opinion | contextual quote or summary from backstory %>

Examples:
- "I really hesitate at this price point <% because in 2019 I nearly went bankrupt over subscription fees | In 2019, I faced a major liquidity crisis due to accumulated SaaS costs... %>."
- "The color scheme feels trustworthy, <% mirroring the branding of the bank I worked at for 10 years | I worked at Chase for a decade where blue/grey signified stability... %>."

Use these tags frequently to show you are a real person with a history.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content: `[CONTEXT OF PREVIOUS INTERACTION]\n${context}\n\nRemember: Stay in character and use the <% opinion | context %> syntax.`
        },
        { role: "user", content: message },
      ],
      temperature: 0.8,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenRouter Chat API");
    }

    return content;
  }
}
