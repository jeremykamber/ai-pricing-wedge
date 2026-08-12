// ─── POST /api/vps/chat-with-panel (text streaming) ────────────────────────
// Streams a panel-synthesis chat response token by token via a ReadableStream.
// The client receives progressively longer plain-text chunks — each chunk is
// the entire response accumulated so far, so the UI can show the growing
// reply in real time. Grounded in the full cohort's simulation responses plus
// the cross-persona synthesis.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { ChatWithPanelUseCase } from "@/application/usecases/ChatWithPanelUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

export async function POST(req: NextRequest) {
  const { responses, synthesis, message, history } = await req.json();

  const llmService = LlmServiceImpl.createFromEnv("openrouter");
  const useCase = new ChatWithPanelUseCase(llmService);
  const responseStream = useCase.executeStream(
    responses ?? [],
    synthesis || null,
    message,
    history ?? [],
  );

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = "";
        for await (const chunk of responseStream) {
          fullText += chunk;
          controller.enqueue(encoder.encode(fullText));
        }
        controller.close();
      } catch (error) {
        console.error("[chat-with-panel] Stream error:", error);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              step: "ERROR",
              error: (error as Error).message,
            }),
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
