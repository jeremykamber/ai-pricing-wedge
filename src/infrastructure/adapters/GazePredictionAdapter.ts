import OpenAI from "openai";
import { Persona, stringifyPersona } from "@/domain/entities/Persona";
import { GazePoint } from "@/domain/entities/GazePoint";
import { IGazePredictionPort } from "@/domain/ports/IGazePredictionPort";
import { stripCodeFence } from "./llmUtils";

export class GazePredictionAdapter implements IGazePredictionPort {
  private client: OpenAI;
  private model: string;

  constructor() {
    const provider = "openrouter";
    const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash"; // Vision capable model
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for GazePredictionAdapter");
    }

    this.client = new OpenAI({
      baseURL,
      apiKey,
      dangerouslyAllowBrowser: true
    });
    this.model = model;
  }

  async predictGaze(persona: Persona, screenshotBase64: string): Promise<GazePoint[]> {
    const systemPrompt = `You are a visual attention model. You predict where a specific user persona would look first on a pricing page.
        
Based on the persona's traits, goals, and values, identify 3 specific points on the provided screenshot that would capture their attention immediately.

Return a JSON array of 3 objects following this structure:
{
  "points": [
    { "x": number, "y": number, "focusLabel": "string" }
  ]
}

- x and y should be percentages (0-100) relative to the image dimensions.
- focusLabel should be a short description of what they are looking at (e.g., "Price tag", "Enterprise Plan features", "Money-back guarantee").
- Be extremely specific to the persona's "Value Hunter" or "CTO" type traits.`;

    const userPrompt = `Predict the top 3 gaze points for this persona on this pricing page:
        
Persona:
${stringifyPersona(persona)}

Return ONLY JSON.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${screenshotBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("Failed to predict gaze");

    try {
      const parsed = JSON.parse(stripCodeFence(content));
      return parsed.points || [];
    } catch (err) {
      console.error("Failed to parse gaze prediction response", content);
      return [];
    }
  }
}
