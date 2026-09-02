import { Persona } from "@/domain/entities/Persona";
import { ChatAnalysisContext } from "@/domain/ports/LlmServicePort";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";

export class ChatWithPersonaUseCase {
  constructor(private llmService: LlmServicePort) { }

  async execute(
    persona: Persona,
    analysis: ChatAnalysisContext,
    message: string,
    history: { role: 'user' | 'assistant', content: string }[]
  ): Promise<string> {
    return this.llmService.chatWithPersona(persona, analysis, message, history);
  }

  executeStream(
    persona: Persona,
    analysis: ChatAnalysisContext,
    message: string,
    history: { role: 'user' | 'assistant', content: string }[]
  ): AsyncIterable<string> {
    return this.llmService.chatWithPersonaStream(persona, analysis, message, history);
  }
}
