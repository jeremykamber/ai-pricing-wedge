// ─── POST /api/vps/chat-with-persona (text streaming) ──────────────────────
// Streams a persona's chat response token by token via a ReadableStream.
// The client receives progressively longer plain-text chunks — each chunk is
// the entire response accumulated so far, so the UI can show the growing
// reply in real time.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { ChatWithPersonaUseCase } from "@/application/usecases/ChatWithPersonaUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

export async function POST(req: NextRequest) {
  const { persona, analysis, message, history } = await req.json();

  const llmService = LlmServiceImpl.createFromEnv("openrouter");
  const useCase = new ChatWithPersonaUseCase(llmService);
  const responseStream = useCase.executeStream(
    persona,
    analysis || null,
    message,
    history,
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
        console.error("[chat-with-persona] Stream error:", error);
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
