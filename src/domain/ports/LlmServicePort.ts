import { Persona } from "../entities/Persona";
import { PricingAnalysis } from "../entities/PricingAnalysis";
import { PersonaResponse } from "../entities/PersonaResponse";
import { ArtifactSynthesis, CohortSynthesisContent } from "../entities/ArtifactSynthesis";
import { ArtifactIntake } from "../entities/ArtifactIntake";
import { StreamOfConsciousness } from "../entities/StreamOfConsciousness";
import { ExtractedInterviewSignals } from "@/application/interviewPipeline/types";
import type { ResearchPersonaConfig, StrategyPersonaConfig, ClusterPersonaConfig } from "../dtos/PersonaGenerationConfig";

export type AgentAction =
    | { type: "CLICK"; selector: string; reasoning: string }
    | { type: "TYPE"; selector: string; text: string; reasoning: string }
    | { type: "FINISH"; report: string };

/**
 * Progress callback for phased persona generation.
 *
 * Phase 1 (`profiles`) is one batched call; phase 2 (`backstories`) is one
 * call per persona. Progress carries completed/total counts; personaName is
 * set during the backstories phase so callers can render per-persona ticks.
 */
export type PersonaPhase = "profiles" | "backstories";
export interface PersonaPhaseProgress {
    completed: number;
    total: number;
    personaName?: string;
}
export type PersonaPhaseCallback = (phase: PersonaPhase, progress?: PersonaPhaseProgress) => void;

/** @deprecated Pricing-specific — use generic artifact intake instead. */
export interface PricingLocation {
    found: boolean;
    selector?: string;
    anchorText?: string;
    reasoning?: string;
}

/**
 * Context a persona chat can be grounded in.
 *
 * `PricingAnalysis` is the legacy pricing-era type (kept for backward
 * compatibility with the old results flow); `PersonaResponse` is the modern
 * artifact-agnostic type produced by analyses — it is what "chat with a
 * persona about what they saw" is grounded in.
 */
export type ChatAnalysisContext = PricingAnalysis | PersonaResponse | null;

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

    /** @deprecated Use analyzeArtifactStream instead. */
    analyzeStaticPage(
        persona: Persona,
        screenshotBase64: string,
    ): Promise<PricingAnalysis>;

    /** @deprecated Use analyzeArtifactStream instead. */
    analyzeStaticPageStream(
        persona: Persona,
        screenshots: string[],
    ): AsyncIterable<string>;

    /** @deprecated Use formatStreamOfConsciousness → PersonaResponse instead. */
    extractInsights(
        persona: Persona,
        rawThoughts: string,
    ): Promise<Partial<PricingAnalysis>>;

    /** @deprecated Pricing-specific scouting — use generic ArtifactIntakeAdapter instead. */
    isPricingVisible(screenshotBase64: string): Promise<boolean>;

    /** @deprecated Pricing-specific scouting — use generic ArtifactIntakeAdapter instead. */
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
        analysis: ChatAnalysisContext,
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
        analysis: ChatAnalysisContext,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): AsyncIterable<string>;

    /**
     * Chat with the whole cohort at once (panel synthesis). Grounds the
     * answer in every persona's analysis response plus the cross-persona
     * synthesis, so questions like "what would our users think of X?" get an
     * evidence-backed synthesis rather than a single persona's take.
     * @param responses All persona responses from the analysis.
     * @param synthesis The cross-persona synthesis (may be null if unavailable).
     * @param message The user's message.
     * @param history The chat history.
     * @returns An AsyncIterable extending string pieces.
     */
    chatWithPanelStream(
        responses: PersonaResponse[],
        synthesis: ArtifactSynthesis | null,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): AsyncIterable<string>;

    /** @deprecated Use analyzeArtifactStream instead. */
    analyzePricingPageStream(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any>;

    /** @deprecated Use analyzeArtifactCompletion instead. */
    analyzePricingPageCompletion(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any>;

    /**
     * Stage 1: Generate stream of consciousness (natural first-person thinking).
     * No JSON constraints — just free-form text.
     * The persona reasons through all five cognitive stages.
     */
    generateStreamOfConsciousness(
        persona: Persona,
        screenshotBase64: string,
        pageHtml?: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<StreamOfConsciousness>;

    /** @deprecated Use the new formatStreamOfConsciousness (PersonaResponse output) instead. */
    formatStreamOfConsciousness(
        persona: Persona,
        stream: StreamOfConsciousness,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<PricingAnalysis>;

    /** @deprecated Use the new summarizeStreamOfConsciousness instead. */
    summarizeStreamOfConsciousness(
        persona: Persona,
        stream: StreamOfConsciousness,
        options?: { runId?: string }
    ): Promise<string[]>;

    // --- New artifact-agnostic analysis pipeline ---

    /**
     * One-pass artifact analysis returning a structured PersonaResponse.
     * The persona reasons through all five cognitive stages.
     */
    analyzeArtifactStream(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any>;

    /**
     * Non-streaming variant — awaits the full PersonaResponse result.
     */
    analyzeArtifactCompletion(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<any>;

    /**
     * Stage 1: Generate stream of consciousness using the 5-stage cognitive model.
     * No pricing-specific framing. Persona thinks through:
     * 1. Interpretation — What is this? Who is it for?
     * 2. Understanding — Do I get it? What am I supposed to do?
     * 3. Belief — Do I trust it? Does it feel credible?
     * 4. Motivation — Do I care? Is it worth my time?
     * 5. Action — What would I do next?
     */
    generateCognitiveStream(
        persona: Persona,
        context: ArtifactIntake,
        businessGoal: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<StreamOfConsciousness>;

    /**
     * Stage 2a: Format cognitive stream into structured PersonaResponse.
     */
    formatPersonaResponse(
        persona: Persona,
        stream: StreamOfConsciousness,
        businessGoal: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string }
    ): Promise<PersonaResponse>;

    /**
     * Stage 2b: Derive summary signals from the cognitive stream.
     * Returns highest stage reached, final action, and key signals.
     */
    deriveResponseSignals(
        persona: Persona,
        stream: StreamOfConsciousness,
        options?: { runId?: string }
    ): Promise<{
        highestStageReached: string;
        finalAction: string;
        keySignals: string[];
    }>;

    // --- Cross-persona cohort synthesis ---

    /**
     * One structured LLM call over the cohort's RAW monologue transcripts:
     * overview, research-question answer, top findings (each carrying
     * evidence locators for code-side citation grounding), disagreements and
     * frictions. Evidence anchors ride on the findings in this same call — a
     * separate locateEvidenceAnchors call would force findings and locators
     * through two prompts that must agree with each other.
     * Completion counts are deliberately absent: the caller knows them; the
     * model must not fabricate them.
     */
    generateCohortSynthesis(
        researchQuestion: string,
        transcripts: Array<{ personaId: string; personaName: string; transcript: string }>,
        options?: { runId?: string }
    ): Promise<CohortSynthesisContent>;

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
     * Generates a short, human-friendly title for a simulation from the research
     * context and the captured artifact. Uses the cheap vision model so it can
     * "see" the artifact (screenshot + page summary) the same way the analysis
     * does. Nice-to-have: callers must tolerate failure and fall back to the
     * heuristic name (generateSimulationName).
     */
    generateSimulationTitle(
        context: {
            businessGoal?: string;
            researchQuestion?: string;
            artifactUrl?: string;
            pageSummary?: string;
            screenshotBase64?: string;
        },
        options?: { runId?: string },
    ): Promise<string>;

    /**
     * Generates a short label for a persona batch from the personas' basic info
     * (name, occupation, backstory). Text-only and cheap — no vision needed.
     * Nice-to-have: callers must tolerate failure and fall back to the default.
     */
    generateBatchTitle(
        personas: Persona[],
        context: {
            source?: 'description' | 'interviews';
            description?: string;
            transcriptCount?: number;
        },
        options?: { runId?: string },
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

    // --- Dual-Mode Persona Generation (2025 Philosophy) ---

    /**
     * Research Mode: evidence-first persona generation from interview transcripts.
     * Produces personas with provenance tracking, minimal invention, no fabricated memories.
     * Phased: batched profiles, then per-persona parallel backstories.
     * @param onPhase - Optional progress callback (profiles -> backstories).
     * @param onRetry - Optional callback fired before a retry attempt of the
     *                  profiles batch (attempt 2+), so the UI can surface
     *                  that generation is retrying.
     */
    generateResearchPersonas(config: ResearchPersonaConfig, onPhase?: PersonaPhaseCallback, onRetry?: (attempt: number, attempts: number) => void): Promise<Persona[]>;

    /**
     * Strategy Mode: richer storytelling persona generation from ICP/market descriptions.
     * Representative assumptions allowed for imagination and decision-making.
     * Phased: batched profiles, then per-persona parallel backstories.
     * @param onPhase - Optional progress callback (profiles -> backstories).
     * @param onRetry - Optional callback fired before a retry attempt of the
     *                  profiles batch (attempt 2+), so the UI can surface
     *                  that generation is retrying.
     */
    generateStrategyPersonas(config: StrategyPersonaConfig, onPhase?: PersonaPhaseCallback, onRetry?: (attempt: number, attempts: number) => void): Promise<Persona[]>;

    /**
     * Cluster Mode: synthetic representative personas from multiple interview signals.
     * Produces labeled cluster personas with source references.
     */
    generateClusterPersonas(config: ClusterPersonaConfig): Promise<Persona[]>;

    /**
     * Counterfactual test: checks whether synthetic persona details would change
     * product decisions. Details that fail this test should not influence decisions.
     */
    applyCounterfactualTest(persona: Persona): Promise<{ detail: string; reason: string; attribute?: string }[]>;
}