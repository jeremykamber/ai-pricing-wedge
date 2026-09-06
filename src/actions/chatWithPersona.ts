"use server"

import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import type { Persona } from "@/domain/entities/Persona";
import type { ChatAnalysisContext } from "@/domain/ports/LlmServicePort";

import { createStreamableValue } from "@ai-sdk/rsc";

import { shouldRunLocally } from "@/infrastructure/config";
import { vpsFetchRaw } from "./vpsClient";

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

      const responseStream = llmService.chatWithPersonaStream(persona, analysis, message, history);

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
      const res = await vpsFetchRaw("chat-with-persona", { persona, analysis, message, history });

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
