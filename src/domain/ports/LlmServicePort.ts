import { Persona } from "../entities/Persona";
import { PricingAnalysis } from "../entities/PricingAnalysis";
import { StreamOfConsciousness } from "../entities/StreamOfConsciousness";
import { ExtractedInterviewSignals } from "@/application/interviewPipeline/types";

export type AgentAction =
    | { type: "CLICK"; selector: string; reasoning: string }
    | { type: "TYPE"; selector: string; text: string; reasoning: string }
    | { type: "FINISH"; report: string };

export interface PricingLocation {
    found: boolean;
    selector?: string;   // Likely ID or specific class
    anchorText?: string; // Unique text like "Choose your plan"
    reasoning?: string;
}

export interface LlmServicePort {
    /**
     * Generates an array of initial personas based on the provided persona description.
     * @param personaDescription - A textual description of the persona(s) to generate.
     * @returns A promise that resolves to an array of Persona objects.
     */
    generateInitialPersonas(personaDescription: string, count?: number): Promise<Persona[]>;

    /**
     * Generates personas based on a description (streaming version).
     * Yields raw tokens of the JSON array.
     */
    generateInitialPersonasStream(personaDescription: string, count?: number): AsyncIterable<Partial<Persona>[]>;

    /**
     * Generates a deep narrative backstory for a persona.
     * @param personaOrDescription - The Persona object or its description.
     * @param onProgress - Optional callback for tracking progress (part X of totalParts).
     * @returns A promise that resolves to the persona's backstory.
     */
    generatePersonaBackstory(
        personaOrDescription: Persona | string,
        onProgress?: (part: number, totalParts: number) => void,
    ): Promise<string>;

    /**
     * Generates a deep narrative backstory for a persona (streaming version).
     * Yields raw tokens of the backstory text.
     */
    generatePersonaBackstoryStream(
        personaOrDescription: Persona | string,
    ): AsyncIterable<string>;

    /**
     * Generates a much shorter, abbreviated backstory in a single LLM call.
     */
    generateAbbreviatedBackstory(
        personaOrDescription: Persona | string,
    ): Promise<string>;

    /**
     * Generates an abbreviated backstory (streaming version).
     */
    generateAbbreviatedBackstoryStream(
        personaOrDescription: Persona | string,
    ): AsyncIterable<string>;

    /**
     * The Brain looks at the screenshot and history, then decides the next move.
     * @param persona The Persona object representing the agent.
     * @param screenshotBase64 A base64-encoded screenshot of the current view.
     * @param actionHistory An array of strings representing the history of actions taken so far.
     * @returns A promise that resolves to the next AgentAction to be taken.
     */
    decideNextStep(
        persona: Persona,
        screenshotBase64: string,
        actionHistory: string[],
    ): Promise<AgentAction>;

    /**
     * Analyze a static view of the Pricing Page feature.
     * @param persona The Persona object representing the agent.
     * @param screenshotBase64 A base64-encoded screenshot of the pricing page.
     * @returns A promise that resolves to a PricingAnalysis of the static page, including gut reactions.
     */
    analyzeStaticPage(
        persona: Persona,
        screenshotBase64: string,
    ): Promise<PricingAnalysis>;

    /**
     * Analyze a static view of the Pricing Page feature (streaming version).
     * @param persona The Persona object representing the agent.
     * @param screenshotBase64 A base64-encoded screenshot of the pricing page.
     * @returns An AsyncIterable extending string pieces of the JSON response.
     */
    analyzeStaticPageStream(
        persona: Persona,
        screenshots: string[],
    ): AsyncIterable<string>;

    /**
     * Extracts structured insights (gut reaction, scores, risks) from raw thoughts.
     * @param persona The persona who had the thoughts.
     * @param rawThoughts The raw stream-of-consciousness text.
     */
    extractInsights(
        persona: Persona,
        rawThoughts: string,
    ): Promise<Partial<PricingAnalysis>>;

    /**
     * Checks if pricing elements are visible in a screenshot.
     */
    isPricingVisible(screenshotBase64: string): Promise<boolean>;

    /**
     * Checks if pricing elements are visible in the provided HTML/text.
     */
    isPricingVisibleInHtml(html: string): Promise<PricingLocation>;

    /**
     * Chat with a persona about their analysis.
     * @param persona The persona to chat with.
     * @param analysis The analysis they performed.
     * @param message The user's message.
     * @param history The chat history.
     * @returns A promise that resolves to the persona's response.
     */
    /**
     * Chat with a persona about their analysis (streaming version).
     * @param persona The persona to chat with.
     * @param analysis The analysis they performed.
     * @param message The user's message.
     * @param history The chat history.
     * @returns An AsyncIterable extending string pieces.
     */
    chatWithPersona(
        persona: Persona,
        analysis: PricingAnalysis | null,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): Promise<string>;

    /**
     * Chat with a persona about their analysis (streaming version).
     * @param persona The persona to chat with.
     * @param analysis The analysis they performed (optional if pre-testing).
     * @param message The user's message.
     * @param history The chat history.
     * @returns An AsyncIterable extending string pieces.
     */
    chatWithPersonaStream(
        persona: Persona,
        analysis: PricingAnalysis | null,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): AsyncIterable<string>;

    /**
     * Consolidated Analysis: One-pass hybrid grounding (Screenshot + HTML).
     * Returns a stream that can be parsed as a PricingAnalysis object.
     */
    analyzePricingPageStream(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any>; // Using any for the streamObject return type for now to avoid complex type issues in port

    /**
     * Non-streaming completion variant — awaits the full PricingAnalysis result
     * without yielding per-token partials. Used by the simplified simulation path.
     */
    analyzePricingPageCompletion(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any>;

    /**
     * Stage 1: Generate stream of consciousness (natural first-person thinking).
     * No JSON constraints — just free-form text.
     */
    generateStreamOfConsciousness(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<StreamOfConsciousness>;

    /**
     * Stage 2a: Format stream of consciousness into structured PricingAnalysis JSON.
     */
    formatStreamOfConsciousness(
        persona: Persona,
        stream: StreamOfConsciousness,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<PricingAnalysis>;

    /**
     * Stage 2b: Summarize stream of consciousness into bullet points.
     */
    summarizeStreamOfConsciousness(
        persona: Persona,
        stream: StreamOfConsciousness,
        options?: { runId?: string }
    ): Promise<string[]>;

    /**
     * Validates if a user's prompt is within the persona's expected domain.
     * Prevents requests for code, poetry, or other general assistant tasks.
     */
    validatePromptDomain(
        persona: Persona,
        prompt: string,
    ): Promise<{ isValid: boolean; reason?: string }>;

    /**
     * Batch version - generates backstories for all personas in a single LLM call.
     */
    generateAbbreviatedBackstoriesBatch(personas: Persona[]): Promise<string[]>;

    summarizeHtml(html: string): Promise<string>;

    /**
     * Extracts structured signals from an interview transcript.
     * @param transcript - The raw interview transcript text.
     * @param interviewId - Unique identifier for the interview.
     */
    extractInterviewSignals(transcript: string, interviewId: string): Promise<ExtractedInterviewSignals>;

    /**
     * Generic chat completion for ad-hoc LLM calls (e.g., coherence validation).
     * @param messages - The chat messages.
     * @param options - Optional parameters (temperature, response_format, etc.).
     */
    createChatCompletion(
        messages: { role: string; content: string }[],
        options?: {
            temperature?: number;
            response_format?: { type: "json_object" | "text" };
            max_tokens?: number | null;
            purpose?: string;
        },
    ): Promise<string>;

    /**
     * Rationalizes personas using psychological scaffolds (PB&J).
     * Replaces enhancePersonasWithPbj — generates causal rationales
     * connecting Big Five profiles to values, fears, and decision styles.
     * @param personas - The personas to rationalize.
     * @param contextNotes - Optional interview/source context to ground rationales in actual evidence.
     */
    rationalizePersonas(personas: Persona[], contextNotes?: string): Promise<Persona[]>;

    /**
     * Generates persona variations based on a reference persona and adjusted traits.
     * The LLM receives the reference persona + adjusted Big Five + variation level,
     * and produces N new personas with fresh backstories, values, fears, etc.
     * @param referencePersona - The source persona to base variations on.
     * @param adjustments - Adjusted Big Five traits + variation level.
     * @param count - How many variations to generate (1, 3, or 5).
     */
    generateVariationPersonas(
        referencePersona: Persona,
        adjustments: { bigFive: { conscientiousness: number; neuroticism: number; openness: number; extraversion: number; agreeableness: number }; variationLevel: number },
        count: number,
    ): Promise<Persona[]>;

    /**
     * Infers Big Five traits and psychographic values from a persona's backstory.
     * Used when the user edits the backstory — suggests updated trait values that
     * are causally consistent with the new narrative.
     * @param backstory - The new or edited backstory text.
     * @returns Suggested trait values derived from the backstory.
     */
    inferTraitsFromBackstory(backstory: string): Promise<{
        conscientiousness: number;
        neuroticism: number;
        openness: number;
        extraversion: number;
        agreeableness: number;
        values: string[];
        fears: string[];
        communicationStyle: string;
        decisionStyle: string;
    }>;
}

