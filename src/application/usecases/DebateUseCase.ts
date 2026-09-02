import type { Persona } from "@/domain/entities/Persona";
import type { IDebateServicePort } from "@/domain/ports/IDebateServicePort";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

/**
 * Use case for executing a multi-persona debate.
 * Thin wrapper around IDebateServicePort — follows ChatWithPersonaUseCase pattern.
 */
export class DebateUseCase {
  constructor(private debateService: IDebateServicePort) {}

  /**
   * Execute a debate stream. Yields structured events for the client.
   */
  async *executeDebate(
    proposal: string,
    participants: Persona[],
    totalRounds: number,
  ): AsyncIterable<DebateStreamEvent> {
    yield* this.debateService.executeDebate(proposal, participants, totalRounds);
  }
}
