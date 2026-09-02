// ─── POST /api/vps/debate (SSE streaming) ──────────────────────────────────
// Runs a multi-persona debate about a proposal and streams each round as a
// Server-Sent Event. The client receives structured DebateStreamEvent objects
// (argument, rebuttal, debate_end, or error) and can render each round as it
// arrives.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { DebateAdapter } from "@/infrastructure/adapters/DebateAdapter";
import { DebatePromptCompiler } from "@/infrastructure/adapters/DebatePromptCompiler";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

export async function POST(req: NextRequest) {
  const { proposal, participants, totalRounds } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: DebateStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const llmService = LlmServiceImpl.createFromEnv("openrouter");
        const adapter = new DebateAdapter(llmService, new DebatePromptCompiler());

        for await (const event of adapter.executeDebate(
          proposal,
          participants,
          totalRounds,
        )) {
          if (event.type === "debate_end") {
            send({ type: "debate_end" } as DebateStreamEvent);
            controller.close();
            return;
          }
          if (event.type === "error") {
            send(event);
            controller.close();
            return;
          }
          send(event);
        }
        // Safety net if loop exits without terminal event
        send({ type: "debate_end" } as DebateStreamEvent);
      } catch (error) {
        console.error("[debate] Fatal error:", error);
        send({
          type: "error",
          message: (error as Error).message,
        } as DebateStreamEvent);
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
