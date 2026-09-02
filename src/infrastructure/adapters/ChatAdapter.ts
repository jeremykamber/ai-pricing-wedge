import { Persona } from "@/domain/entities/Persona";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import { ChatAnalysisContext } from "@/domain/ports/LlmServicePort";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { ChatPromptCompiler } from "./ChatPromptCompiler";
import { IdRagStore } from "./IdRagStore";
import { IdRagService } from "./IdRagService";

export class ChatAdapter {
  private chatPromptCompiler: ChatPromptCompiler;
  private ragStore: IdRagStore;
  private ragService: IdRagService;
  private ingestedPersonas: Set<string> = new Set();
  private turnCounts: Map<string, number> = new Map();
  private static readonly REGROUND_INTERVAL = 4; // every 4th turn

  constructor(private llmService: LlmServiceImpl) {
    this.chatPromptCompiler = new ChatPromptCompiler();
    this.ragStore = new IdRagStore();
    this.ragService = new IdRagService(this.ragStore);
  }

  /**
   * Chat with a persona (streaming version).
   * Combines:
   *  - Compartmentalized persona prompts (Wang et al., 2024b)
   *  - Persona anchors every turn (SyTTA / Atri et al., 2026)
   *  - ID-RAG for factual grounding (Tan et al., 2025)
   *  - Periodic re-grounding every 4 turns (Atri et al., 2026b)
   */
  async * chatWithPersonaStream(
    persona: Persona,
    analysis: ChatAnalysisContext,
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
  ): AsyncIterable<string> {
    // Ingest backstory into ID-RAG store on first interaction with this persona
    if (!this.ingestedPersonas.has(persona.id) && persona.backstory) {
      this.ragStore.ingestPersona(persona);
      this.ingestedPersonas.add(persona.id);
      console.log("[ChatAdapter] Ingested", persona.name, "backstory into ID-RAG store");
    }

    // Track turn count for periodic re-grounding
    const currentTurn = (this.turnCounts.get(persona.id) ?? 0) + 1;
    this.turnCounts.set(persona.id, currentTurn);
    const needsRegrounding = currentTurn > 0 && currentTurn % ChatAdapter.REGROUND_INTERVAL === 0;
    if (needsRegrounding) {
      console.log(`[ChatAdapter] Periodic re-grounding triggered for ${persona.name} (turn ${currentTurn})`);
    }

    // Retrieve relevant memory chunks for this message
    const ragContext = this.ragService.retrieveContext(persona, message, 3);
    if (ragContext.chunkCount > 0) {
      console.log(`[ChatAdapter] Retrieved ${ragContext.chunkCount} relevant memory chunks for "${persona.name}"`);
    }

    const messages = this.chatPromptCompiler.compileChatMessages({
      persona,
      analysis,
      message,
      history,
      ragContext,
      needsRegrounding,
    });

    for await (const chunk of this.llmService.createChatCompletionStream(messages, {
      temperature: 0.7,
      purpose: "Streaming Chat"
    })) {
      yield chunk;
    }
  }

  /**
   * Validates if a user's prompt is within the persona's expected domain.
   */
  async validatePromptDomain(
    persona: Persona,
    prompt: string,
  ): Promise<{ isValid: boolean; reason?: string }> {
    const system = `Determine if the user's message to persona ${persona.name} is IN DOMAIN or OUT OF DOMAIN.
        IN DOMAIN: Software product, professional background, SaaS pricing, natural human tester conversation.
        OUT OF DOMAIN: AI assistant tasks (code, poems, complex math, general search).
        
        Respond ONLY with a JSON object: { "isValid": boolean, "reason": "string" }`;

    try {
      const response = await this.llmService.createChatCompletion(
        [{ role: "system", content: system }, { role: "user", content: `MESSAGE: "${prompt}"` }],
        {
          model: this.llmService.smallTextModel,
          response_format: { type: "json_object" },
          temperature: 0,
          purpose: "Guardrail Check"
        }
      );

      const result = JSON.parse(response || "{}");
      return {
        isValid: result.isValid === true,
        reason: result.reason || "This request is outside the scope of this persona interview."
      };
    } catch (err) {
      console.error("[ChatAdapter] Guardrail check failed:", err);
      return { isValid: true };
    }
  }

  /**
   * Panel synthesis chat — one question, grounded in the whole cohort.
   * No persona identity/anchoring (it's a research-synthesis voice, not a
   * single persona); just the compiled panel prompt streamed token by token.
   */
  async *chatWithPanelStream(
    responses: PersonaResponse[],
    synthesis: ArtifactSynthesis | null,
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
  ): AsyncIterable<string> {
    const messages = this.chatPromptCompiler.compilePanelMessages({
      responses,
      synthesis,
      message,
      history,
    });

    for await (const chunk of this.llmService.createChatCompletionStream(messages, {
      temperature: 0.7,
      purpose: "Panel Synthesis Chat",
    })) {
      yield chunk;
    }
  }
}
