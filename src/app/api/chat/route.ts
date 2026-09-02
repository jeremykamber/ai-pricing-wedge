import { ChatWithPersonaUseCase } from "@/application/usecases/ChatWithPersonaUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { Persona } from "@/domain/entities/Persona";
export async function POST(req: Request) {
  try {
    const { messages, personaContext } = await req.json();
    const persona = typeof personaContext === 'string' ? JSON.parse(personaContext) : personaContext;
    
    // Last message is the prompt
    const lastMessage = messages[messages.length - 1];
    const history = messages.slice(0, messages.length - 1);

    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const useCase = new ChatWithPersonaUseCase(llmService);

    const stream = useCase.executeStream(persona, null, lastMessage.content, history);

    // Convert AsyncIterable<string> to ReadableStream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      }
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
