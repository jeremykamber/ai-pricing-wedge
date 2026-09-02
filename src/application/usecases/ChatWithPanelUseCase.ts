import { PersonaResponse } from "@/domain/entities/PersonaResponse";
import { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";

/**
 * Panel synthesis chat — the user questions the whole cohort at once and gets
 * an answer grounded in every persona's analysis response plus the
 * cross-persona synthesis. Distinct from ChatWithPersonaUseCase: no single
 * persona identity; the voice is a research synthesizer.
 */
export class ChatWithPanelUseCase {
  constructor(private llmService: LlmServicePort) { }

  executeStream(
    responses: PersonaResponse[],
    synthesis: ArtifactSynthesis | null,
    message: string,
    history: { role: 'user' | 'assistant', content: string }[],
  ): AsyncIterable<string> {
    return this.llmService.chatWithPanelStream(responses, synthesis, message, history);
  }
}
