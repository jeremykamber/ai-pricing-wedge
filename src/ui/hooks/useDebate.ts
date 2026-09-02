"use client";

import { useCallback } from "react";
import { debateAction } from "@/actions/debateAction";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";
import type { DebateRoom, DebateStreamEvent, DebateMessage } from "@/domain/entities/DebateRoom";

/**
 * Hook for managing a debate session.
 * Handles starting a debate, consuming streaming events, and updating the store.
 */
export function useDebate() {
  const store = useDebateStore();

  /**
   * Start a new debate with the given proposal, participants, and rounds.
   * Creates the debate in the store, calls the server action, and consumes events.
   */
  const startDebate = useCallback(
    async (
      proposal: string,
      participants: Persona[],
      totalRounds: number,
    ): Promise<string> => {
      const debateId = `debate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Create the debate in setup state
      const debate: DebateRoom = {
        id: debateId,
        proposal,
        participants,
        messages: [],
        currentRound: 0,
        totalRounds,
        status: "setup",
        createdAt: new Date().toISOString(),
      };
      store.addDebate(debate);

      // Track the current persona being streamed
      let currentPersonaId: string | null = null;
      let currentMessageId: string | null = null;
      let streamingContent = "";

      store.setStreaming(true);

      try {
        const { streamData } = await debateAction(proposal, participants, totalRounds);

        for await (const event of streamData) {
          if (!event) continue;

          switch (event.type) {
            case "debate_start":
              store.updateDebate(debateId, { status: "in_progress" });
              break;

            case "round_start":
              store.updateDebate(debateId, { currentRound: event.round });
              break;

            case "persona_start":
              currentPersonaId = event.personaId;
              currentMessageId = crypto.randomUUID();
              streamingContent = "";

              // Add an empty placeholder message that will be filled by chunks
              store.addMessage(debateId, {
                id: currentMessageId,
                personaId: event.personaId,
                personaName: event.personaName,
                role: "participant",
                round: store.getDebate(debateId)?.currentRound ?? 1,
                content: "",
                order: store.getDebate(debateId)?.messages.length ?? 0,
              });
              break;

            case "chunk":
              if (currentPersonaId === event.personaId) {
                streamingContent += event.text;
                // Update the last message content (replace placeholder)
                const debate = store.getDebate(debateId);
                if (debate && currentMessageId) {
                  const updatedMessages = debate.messages.map((m) =>
                    m.id === currentMessageId
                      ? { ...m, content: streamingContent }
                      : m,
                  );
                  store.updateDebate(debateId, { messages: updatedMessages });
                }
              }
              break;

            case "persona_end":
              // Persona finished — message is already updated via chunks
              currentPersonaId = null;
              currentMessageId = null;
              streamingContent = "";
              break;

            case "round_end":
              store.updateDebate(debateId, { currentRound: event.round });
              break;

            case "debate_end":
              store.updateDebate(debateId, { status: "completed" });
              store.setStreaming(false);
              return debateId;

            case "error":
              store.updateDebate(debateId, {
                status: "error",
                error: event.message,
              });
              store.setStreaming(false);
              return debateId;
          }
        }

        // Stream ended without a terminal event — mark as completed
        store.updateDebate(debateId, { status: "completed" });
        store.setStreaming(false);
      } catch (err) {
        console.error("[useDebate] Fatal error:", err);
        store.updateDebate(debateId, {
          status: "error",
          error: (err as Error).message,
        });
        store.setStreaming(false);
      }

      return debateId;
    },
    [store],
  );

  /**
   * Add a user interjection message to an active debate.
   * This pauses streaming and injects a user message into the transcript.
   */
  const interject = useCallback(
    (debateId: string, content: string) => {
      const debate = store.getDebate(debateId);
      if (!debate) return;

      const message: DebateMessage = {
        id: crypto.randomUUID(),
        personaId: "user",
        personaName: "You",
        role: "user",
        round: debate.currentRound,
        content,
        order: debate.messages.length,
      };

      store.addMessage(debateId, message);
    },
    [store],
  );

  return {
    startDebate,
    interject,
    debates: store.debates,
    activeDebateId: store.activeDebateId,
    isStreaming: store.isStreaming,
    setActiveDebate: store.setActive,
    getDebate: store.getDebate,
    removeDebate: store.removeDebate,
  };
}
