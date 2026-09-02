import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent, DebateMessage } from "@/domain/entities/DebateRoom";
import type { IDebateServicePort } from "@/domain/ports/IDebateServicePort";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { DebatePromptCompiler } from "./DebatePromptCompiler";
import OpenAI from "openai";

/**
 * Orchestrates a single multi-round, multi-persona debate.
 * Stateless — call executeDebate() per debate session.
 * Implements IDebateServicePort (DIP).
 */
export class DebateAdapter implements IDebateServicePort {
  private promptCompiler: DebatePromptCompiler;

  constructor(
    private llmService: LlmServiceImpl,
    promptCompiler?: DebatePromptCompiler,
  ) {
    this.promptCompiler = promptCompiler ?? new DebatePromptCompiler();
  }

  /**
   * Execute a round-robin debate.
   * For each round: Persona A streams → Persona B streams → Persona C streams.
   * Each persona receives the full transcript so far + their identity/trait profile.
   */
  async *executeDebate(
    proposal: string,
    participants: Persona[],
    totalRounds: number,
  ): AsyncIterable<DebateStreamEvent> {
    const transcript: DebateMessage[] = [];
    let order = 0;

    yield {
      type: "debate_start",
      proposal,
      participants: participants.map((p) => p.name),
    };

    for (let round = 1; round <= totalRounds; round++) {
      yield { type: "round_start", round, totalRounds };

      for (const persona of participants) {
        yield {
          type: "persona_start",
          personaId: persona.id,
          personaName: persona.name,
        };

        try {
          const formattedTranscript = this.formatTranscript(transcript, round);
          const systemPrompt = this.promptCompiler.buildPersonaPrompt(
            persona,
            participants,
            proposal,
            formattedTranscript,
            round,
            totalRounds,
          );

          const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `What are your thoughts on this proposal, ${persona.name}?`,
            },
          ];

          let fullResponse = "";
          for await (const chunk of this.llmService.createChatCompletionStream(
            messages,
            {
              temperature: 0.7,
              purpose: "Debate",
            },
          )) {
            fullResponse += chunk;
            yield { type: "chunk", personaId: persona.id, text: chunk };
          }

          const message: DebateMessage = {
            id: crypto.randomUUID(),
            personaId: persona.id,
            personaName: persona.name,
            role: "participant",
            round,
            content: fullResponse,
            order: order++,
          };
          transcript.push(message);
        } catch (err) {
          console.error(
            `[DebateAdapter] LLM call failed for ${persona.name}:`,
            err,
          );
          // Emit a note in the transcript but continue
          const errorMessage: DebateMessage = {
            id: crypto.randomUUID(),
            personaId: persona.id,
            personaName: persona.name,
            role: "participant",
            round,
            content: `[${persona.name} is unavailable due to a technical issue.]`,
            order: order++,
          };
          transcript.push(errorMessage);
        }

        yield { type: "persona_end", personaId: persona.id };
      }

      yield { type: "round_end", round };
    }

    yield { type: "debate_end" };
  }

  /**
   * Format the current transcript for inclusion in the prompt.
   * Returns empty string for round 1 (no prior messages).
   */
  private formatTranscript(
    transcript: DebateMessage[],
    currentRound: number,
  ): string {
    if (currentRound <= 1) return "Awaiting first responses.";

    const lines: string[] = [];
    for (const msg of transcript) {
      if (msg.round < currentRound) {
        lines.push(`${msg.personaName}: "${msg.content}"`);
      }
    }
    return lines.join("\n");
  }
}
