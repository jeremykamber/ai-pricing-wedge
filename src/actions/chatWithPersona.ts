"use server"

import { ChatWithPersonaUseCase } from "@/application/usecases/ChatWithPersonaUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";

import { createStreamableValue } from "@ai-sdk/rsc";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

async function runLocally(
  persona: Persona,
  analysis: PricingAnalysis | null,
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
  analysis: PricingAnalysis | null,
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
        fullText = decoder.decode(value, { stream: true });
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
  analysis: PricingAnalysis | null,
  message: string,
  history: { role: 'user' | 'assistant', content: string }[]
) {
  if (shouldRunLocally()) return runLocally(persona, analysis, message, history);
  return runRemote(persona, analysis, message, history);
}
