"use server"

import { ChatWithPersonaUseCase } from "@/application/usecases/ChatWithPersonaUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { Persona } from "@/domain/entities/Persona";
import { ChatAnalysisContext } from "@/domain/ports/LlmServicePort";

import { createStreamableValue } from "@ai-sdk/rsc";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

async function runLocally(
  persona: Persona,
  analysis: ChatAnalysisContext,
  message: string,
  history: { role: 'user' | 'assistant', content: string }[]
) {
  const stream = createStreamableValue<any>("");

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const useCase = new ChatWithPersonaUseCase(llmService);

      const responseStream = useCase.executeStream(persona, analysis, message, history);

      let fullText = "";
      for await (const chunk of responseStream) {
        fullText += chunk;
        stream.update(fullText);
      }

      stream.done(fullText);
    } catch (error) {
      console.error("Error in chatWithPersonaAction:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}

async function runRemote(
  persona: Persona,
  analysis: ChatAnalysisContext,
  message: string,
  history: { role: 'user' | 'assistant', content: string }[]
) {
  const stream = createStreamableValue<any>("");

  (async () => {
    try {
      const res = await fetch(`${VPS_BACKEND_URL}/api/vps/chat-with-persona`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getVpsAuthToken()}`,
        },
        body: JSON.stringify({ persona, analysis, message, history }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        stream.done({ step: "ERROR", error: err.error || `HTTP ${res.status}` });
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // The endpoint's wire format varies by deployment: raw delta tokens,
        // or `<<REASONING>>…<</REASONING>>` + accumulated content repeated
        // per token (reads may coalesce several of these payloads). When a
        // reasoning marker is present, the payload after the LAST marker is
        // the newest accumulated state, so replace with it; otherwise append
        // the delta token. This reconstructs the complete reply exactly
        // once for either format.
        const lastMarker = chunk.lastIndexOf("<<REASONING>>");
        fullText = lastMarker === -1 ? fullText + chunk : chunk.slice(lastMarker);
        stream.update(fullText);
      }

      stream.done(fullText);
    } catch (error) {
      console.error("Error in remote chatWithPersona:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}

export async function chatWithPersonaAction(
  persona: Persona,
  analysis: ChatAnalysisContext,
  message: string,
  history: { role: 'user' | 'assistant', content: string }[]
) {
  if (shouldRunLocally()) return runLocally(persona, analysis, message, history);
  return runRemote(persona, analysis, message, history);
}
