import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

/**
 * Port for debate orchestration.
 * Implemented by DebateAdapter (infrastructure layer).
 * Depended upon by DebateUseCase (application layer).
 */
export interface IDebateServicePort {
  /**
   * Execute a multi-round, multi-persona debate.
   * Yields structured streaming events for the client to consume.
   *
   * @param proposal — The statement/proposal being debated
   * @param participants — 2-5 personas
   * @param totalRounds — Number of rounds (default 3)
   */
  executeDebate(
    proposal: string,
    participants: Persona[],
    totalRounds: number,
  ): AsyncIterable<DebateStreamEvent>;
}
