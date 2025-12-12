import OpenAI from "openai";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { Persona } from "@/domain/entities/Persona";

export class OpenRouterAdapter implements LlmServicePort {
    private client: any;
    private model: string;

    constructor(client: any, model = "google/gemma-3-27b-it:free") {
        this.client = client;
        this.model = model;
    }

    // Factory to create adapter using environment variables
    static createFromEnv(): OpenRouterAdapter {
        const apiKey =
            process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error(
                "OPENROUTER_API_KEY or OPENAI_API_KEY environment variable is required",
            );
        }
        const baseURL =
            process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
        const model =
            process.env.OPENROUTER_MODEL ||
            process.env.OPENAI_MODEL ||
            "gpt-4.1-nano";
        const client = new OpenAI({ apiKey, baseURL });
        return new OpenRouterAdapter(client, model);
    }

    private async createChatCompletion(
        messages: { role: string; content: string }[],
    ) {
        const resp = await this.client.chat.completions.create({
            model: this.model,
            messages,
            temperature: 0.8,
            max_tokens: 1200,
        });

        // new OpenAI client responses typically live at resp.choices[0].message.content
        const choice = resp?.choices?.[0];
        const content = choice?.message?.content ?? choice?.text ?? null;
        if (!content) throw new Error("No content returned from LLM");
        return content;
    }

    async generateInitialPersonas(
        personaDescription: string,
    ): Promise<Persona[]> {
        const system = `You are a persona generator creating realistic buyer personas for SaaS pricing evaluation.

Generate a JSON array of 3 DISTINCT personas matching this TypeScript interface:

interface Persona {
  id: string;
  name: string;
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];
  goals: string[];
  personalityTraits: string[];
  backstory?: string;
}

CRITICAL REQUIREMENTS:
- Each persona must have DIFFERENT financial situations (e.g., bootstrapper, mid-market, enterprise)
- Include hobbies/interests that reveal their VALUES and decision-making style
- Personality traits should hint at how they approach purchasing decisions
- Occupations should span different industries/seniority levels
- Ages should vary (at least 15 years apart)
- Each persona should have DISTINCT spending patterns and risk tolerance

Return ONLY valid JSON without explanatory text or markdown code blocks.`;

        const user = `Create 3 diverse personas for pricing evaluation based on: "${personaDescription}"

DIVERSITY CRITERIA:
1. Different financial profiles: one cost-conscious, one growth-focused, one enterprise/scale-focused
2. Different industries or roles where applicable
3. Different approaches to technology adoption and ROI calculation
4. Different communication styles and decision-making speeds

Make them realistic, specific, and ready for deep backstory generation. JSON array only.`;

        const content = await this.createChatCompletion([
            { role: "system", content: system },
            { role: "user", content: user },
        ]);

        // Try parsing JSON; be forgiving of code fences
        const cleaned = this.stripCodeFence(content);
        try {
            const parsed = JSON.parse(cleaned);
            if (!Array.isArray(parsed))
                throw new Error("Expected JSON array from LLM");
            // Basic validation / shaping
            return parsed.map(
                (p: any, idx: number) =>
                    ({
                        id:
                            p.id ??
                            p.uuid ??
                            p.name?.toLowerCase().replace(/\s+/g, "-") +
                                `-${idx}`,
                        name: p.name ?? "Unknown",
                        age:
                            typeof p.age === "number"
                                ? p.age
                                : Number(p.age) || 30,
                        occupation: p.occupation ?? "Unknown",
                        educationLevel:
                            p.educationLevel ?? p.education ?? "Unknown",
                        interests: Array.isArray(p.interests)
                            ? p.interests
                            : typeof p.interests === "string"
                              ? [p.interests]
                              : [],
                        goals: Array.isArray(p.goals)
                            ? p.goals
                            : typeof p.goals === "string"
                              ? [p.goals]
                              : [],
                        personalityTraits: Array.isArray(p.personalityTraits)
                            ? p.personalityTraits
                            : p.traits && Array.isArray(p.traits)
                              ? p.traits
                              : [],
                        backstory: p.backstory ?? p.story ?? undefined,
                    }) as Persona,
            );
        } catch (err) {
            throw new Error(
                `Failed to parse personas from LLM response: ${err}\nResponse was: ${cleaned}`,
            );
        }
    }

    async generatePersonaBackstory(
        personaDescriptionOrPersona: string | Persona,
    ): Promise<string> {
        const personaText =
            typeof personaDescriptionOrPersona === "string"
                ? personaDescriptionOrPersona
                : JSON.stringify(personaDescriptionOrPersona);

        const system = `You are a narrative psychologist conducting a deep interview to build a comprehensive life story of a buyer persona.

Your task: Build a RICH, LENGTHY, INTERNALLY CONSISTENT interview-style backstory (8000+ tokens) that reveals:
1. Childhood and family influences on their relationship with money
2. Educational background and early career lessons
3. Detailed financial journey: wins, failures, lessons learned
4. Past purchasing decisions and how they shaped them
5. Major life events that changed their worldview
6. Current economic pressures and opportunities
7. How they evaluate ROI on tools and services
8. Specific examples of successful and failed purchases
9. Values around efficiency, risk, and spending
10. Communication style and decision-making pace

CRITICAL REQUIREMENTS (Deep Binding research):
- Write 8-12 substantial paragraphs, each 150-250 words
- MULTI-TURN DEPTH: This is an extended interview, not a summary
- CONSISTENCY: Every detail aligns with established facts. Reference earlier points.
- SPECIFICITY: Actual dollar amounts, brand names, company names, real scenarios
- AUTHENTICITY: First-person voice. Natural language. Some rambling is okay.
- CAUSE-AND-EFFECT: Show HOW experiences shaped their current values and decisions
- PERSONAL DETAILS: Names of people, places, specific products they've tried

This should feel like a real person's actual life story—messy, detailed, with depth.

Return plain text only. No labels, no markdown, no metadata. NO SUMMARIES OR HEADERS.`;

        // PART 1: Early background and financial formation
        const part1 = await this.createChatCompletion([
            { role: "system", content: system },
            {
                role: "user",
                content: `Generate the first 2-3 paragraphs of a detailed backstory for this persona. Focus on their childhood, family, early financial lessons, and education:

${personaText}

Start the life story from the beginning. Write in first person, as if they're telling you about their past. Be specific with names, places, and amounts.`,
            },
        ]);

        // PART 2: Career and financial journey
        const part2 = await this.createChatCompletion([
            { role: "system", content: system },
            {
                role: "user",
                content: `Continue building this persona's backstory. The first part was:

${part1}

Now write 2-3 paragraphs about their career progression, job changes, financial wins and failures. Include specific companies, roles, and amounts of money. Show how each experience shaped their current approach to spending and evaluating tools.`,
            },
        ]);

        // PART 3: Recent history and current situation
        const part3 = await this.createChatCompletion([
            { role: "system", content: system },
            {
                role: "user",
                content: `Continue this persona's backstory. So far we have:

${part1}

${part2}

Now write 2-3 paragraphs about recent years, major life events, and their current situation. Include:
- Specific purchasing decisions they made (both good and bad)
- How much they spend on tools/services monthly
- What changed their mind about spending money
- Current financial pressures and opportunities`,
            },
        ]);

        // PART 4: Values, decision-making, and close
        const part4 = await this.createChatCompletion([
            { role: "system", content: system },
            {
                role: "user",
                content: `Finish this persona's backstory. So far we have:

${part1}

${part2}

${part3}

Now write 2-3 final paragraphs that:
- Articulate their core values around money, efficiency, and risk
- Explain how they actually evaluate ROI on new tools (what questions do they ask?)
- Describe their communication style and decision-making pace
- Tie back to earlier parts of their story (e.g., "After spending $50K on a failed tool in 2019, I now...")
- End with their current mindset and priorities`,
            },
        ]);

        // Combine all parts into one cohesive narrative
        const fullBackstory = [part1, part2, part3, part4]
            .map((p) => this.stripCodeFence(p).trim())
            .join("\n\n");

        return fullBackstory;
    }

    // Helper: remove markdown code fences which may break JSON.parse
    private stripCodeFence(s: string) {
        if (!s) return s;
        return s
            .replace(/```json\n?/i, "")
            .replace(/```/g, "")
            .trim();
    }
}
