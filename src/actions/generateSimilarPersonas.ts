"use server";

import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { createStreamableValue } from "@ai-sdk/rsc";

export type SimilarPersonaProgressStep = "GENERATING" | "DONE" | "ERROR";

export interface SimilarPersonaProgress {
  step: SimilarPersonaProgressStep;
  personas?: Persona[];
  error?: string;
}

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

async function runLocally(
  referencePersona: Persona,
  adjustments: {
    bigFive: {
      conscientiousness: number;
      neuroticism: number;
      openness: number;
      extraversion: number;
      agreeableness: number;
    };
    variationLevel: number;
  },
  count: number,
) {
  const stream = createStreamableValue<SimilarPersonaProgress>({ step: "GENERATING" });

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const personas = await llmService.generateVariationPersonas(referencePersona, adjustments, count);
      stream.done({ step: "DONE", personas: JSON.parse(JSON.stringify(personas)) });
    } catch (error) {
      console.error("[generateSimilarPersonasAction] Failed:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}

async function runRemote(
  referencePersona: Persona,
  adjustments: {
    bigFive: {
      conscientiousness: number;
      neuroticism: number;
      openness: number;
      extraversion: number;
      agreeableness: number;
    };
    variationLevel: number;
  },
  count: number,
) {
  const stream = createStreamableValue<SimilarPersonaProgress>({ step: "GENERATING" });

  (async () => {
    try {
      const res = await fetch(`${VPS_BACKEND_URL}/api/vps/generate-similar-personas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getVpsAuthToken()}`,
        },
        body: JSON.stringify({ referencePersona, adjustments, count }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        stream.done({ step: "ERROR", error: err.error || `HTTP ${res.status}` });
        return;
      }

      const data = await res.json();
      stream.done({ step: "DONE", personas: data.personas || data });
    } catch (error) {
      console.error("[generateSimilarPersonasAction] Remote failed:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}

export async function generateSimilarPersonasAction(
  referencePersona: Persona,
  adjustments: {
    bigFive: {
      conscientiousness: number;
      neuroticism: number;
      openness: number;
      extraversion: number;
      agreeableness: number;
    };
    variationLevel: number;
  },
  count: number,
) {
  if (shouldRunLocally()) return runLocally(referencePersona, adjustments, count);
  return runRemote(referencePersona, adjustments, count);
}
