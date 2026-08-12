"use server"

import { ChatWithPanelUseCase } from "@/application/usecases/ChatWithPanelUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";

import { createStreamableValue } from "@ai-sdk/rsc";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

async function runLocally(
  responses: PersonaResponse[],
  synthesis: ArtifactSynthesis | null,
  message: string,
  history: ChatHistoryEntry[],
) {
  const stream = createStreamableValue<string | { step: string; error: string }>("");

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const useCase = new ChatWithPanelUseCase(llmService);

      const responseStream = useCase.executeStream(responses, synthesis, message, history);

      let fullText = "";
      for await (const chunk of responseStream) {
        fullText += chunk;
        stream.update(fullText);
      }

      stream.done(fullText);
    } catch (error) {
      console.error("Error in chatWithPanelAction:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}

async function runRemote(
  responses: PersonaResponse[],
  synthesis: ArtifactSynthesis | null,
  message: string,
  history: ChatHistoryEntry[],
) {
  const stream = createStreamableValue<string | { step: string; error: string }>("");

  (async () => {
    try {
      const res = await fetch(`${VPS_BACKEND_URL}/api/vps/chat-with-panel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getVpsAuthToken()}`,
        },
        body: JSON.stringify({ responses, synthesis, message, history }),
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
      console.error("Error in remote chatWithPanel:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}

/**
 * Panel synthesis chat — question the whole cohort at once. Grounds the
 * answer in every persona's simulation response + the cross-persona synthesis.
 */
export async function chatWithPanelAction(
  responses: PersonaResponse[],
  synthesis: ArtifactSynthesis | null,
  message: string,
  history: ChatHistoryEntry[],
) {
  if (shouldRunLocally()) return runLocally(responses, synthesis, message, history);
  return runRemote(responses, synthesis, message, history);
}
