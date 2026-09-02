"use server";

import { createStreamableValue } from "@ai-sdk/rsc";
import { DebateAdapter } from "@/infrastructure/adapters/DebateAdapter";
import { DebatePromptCompiler } from "@/infrastructure/adapters/DebatePromptCompiler";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";
import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

async function runLocally(
  proposal: string,
  participants: Persona[],
  totalRounds: number,
) {
  const stream = createStreamableValue<DebateStreamEvent>();

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const adapter = new DebateAdapter(llmService, new DebatePromptCompiler());

      for await (const event of adapter.executeDebate(proposal, participants, totalRounds)) {
        if (event.type === "debate_end" || event.type === "error") {
          stream.done(event);
          return;
        }
        stream.update(event);
      }
      stream.done({ type: "debate_end" } as DebateStreamEvent);
    } catch (error) {
      console.error("[debateAction] Fatal error:", error);
      stream.done({ type: "error", message: (error as Error).message } as DebateStreamEvent);
    }
  })();

  return { streamData: stream.value as unknown as AsyncIterable<DebateStreamEvent> };
}

async function runRemote(
  proposal: string,
  participants: Persona[],
  totalRounds: number,
) {
  const stream = createStreamableValue<DebateStreamEvent>();

  (async () => {
    try {
      const res = await fetch(`${VPS_BACKEND_URL}/api/vps/debate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getVpsAuthToken()}`,
        },
        body: JSON.stringify({ proposal, participants, totalRounds }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        stream.done({ type: "error", message: err.error || `HTTP ${res.status}` } as DebateStreamEvent);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const event: DebateStreamEvent = JSON.parse(trimmed.slice(6));
              if (event.type === "debate_end" || event.type === "error") {
                stream.done(event);
                return;
              }
              stream.update(event);
            } catch { /* skip malformed SSE */ }
          }
        }
      }

      stream.done({ type: "debate_end" } as DebateStreamEvent);
    } catch (error) {
      console.error("[debateAction] Remote error:", error);
      stream.done({ type: "error", message: (error as Error).message } as DebateStreamEvent);
    }
  })();

  return { streamData: stream.value as unknown as AsyncIterable<DebateStreamEvent> };
}

/**
 * Server action for starting a multi-persona debate.
 * Uses local execution in development, VPS SSE fetch in production.
 */
export async function debateAction(
  proposal: string,
  participants: Persona[],
  totalRounds: number,
) {
  if (shouldRunLocally()) return runLocally(proposal, participants, totalRounds);
  return runRemote(proposal, participants, totalRounds);
}
