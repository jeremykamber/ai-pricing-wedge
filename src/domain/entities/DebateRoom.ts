import type { Persona } from "./Persona";

/**
 * A single utterance in the debate transcript.
 */
export interface DebateMessage {
  id: string;
  /** `"user"` for interjections from the human, or a persona's ID */
  personaId: string | "user";
  personaName: string;
  role: "participant" | "user";
  round: number;
  content: string;
  /** Global sequence number for sorting */
  order: number;
}

/**
 * Aggregate root for a debate session.
 */
export interface DebateRoom {
  id: string;
  proposal: string;
  participants: Persona[];
  messages: DebateMessage[];
  currentRound: number;
  totalRounds: number;
  status: "setup" | "in_progress" | "completed" | "error";
  error?: string;
  createdAt: string;
}

/**
 * Streaming events yielded by DebateAdapter.executeDebate().
 * Discriminated union — use `event.type` to narrow.
 */
export type DebateStreamEvent =
  | { type: "debate_start"; proposal: string; participants: string[] }
  | { type: "round_start"; round: number; totalRounds: number }
  | { type: "persona_start"; personaId: string; personaName: string }
  | { type: "chunk"; personaId: string; text: string }
  | { type: "persona_end"; personaId: string }
  | { type: "round_end"; round: number }
  | { type: "debate_end" }
  | { type: "error"; message: string };
