import { ExtractedInterviewSignals, ExtractedSignal } from "./types";
import { Chunk } from "@/infrastructure/adapters/IdRagStore";

type SignalCategoryKey =
  | "painPoints"
  | "goals"
  | "values"
  | "featureDesires"
  | "decisionPatterns";

const SIGNAL_TYPE_MAP: Record<SignalCategoryKey, string> = {
  painPoints: "pain_point",
  goals: "goal",
  values: "value",
  featureDesires: "feature_desire",
  decisionPatterns: "decision_pattern",
};

/**
 * Convert extracted interview signals into IdRagStore Chunks aligned to signal
 * categories. Each signal item becomes one chunk (verbatim quote as text) and
 * one summary chunk is emitted per interview. Salient quotes (untyped) are
 * emitted as `salient_quote` chunks.
 */
export function chunkInterviewSignals(
  signals: ExtractedInterviewSignals,
  personaId: string,
): Chunk[] {
  const chunks: Chunk[] = [];

  // helper to emit a chunk for a single ExtractedSignal
  function pushSignalChunk(category: SignalCategoryKey, item: ExtractedSignal, idx: number) {
    const signalType = SIGNAL_TYPE_MAP[category];
    const topic = signalType; // topic derived from category per requirements

    const chunk: Chunk = {
      id: `chunk-${personaId}-interview-${signalType}-${idx}`,
      personaId,
      text: item.quote,
      chunkType: "interview",
      metadata: {
        sourceInterviewId: signals.interviewId,
        sourceSegmentId: item.sourceSegmentId,
        signalType,
        topic,
      },
    };

    chunks.push(chunk);
  }

  // Iterate each signal category and create a chunk per item
  const categories: SignalCategoryKey[] = [
    "painPoints",
    "goals",
    "values",
    "featureDesires",
    "decisionPatterns",
  ];

  for (const category of categories) {
    const items = (signals as any)[category] as ExtractedSignal[] | undefined;
    if (!items || items.length === 0) continue;

    for (let i = 0; i < items.length; i++) {
      pushSignalChunk(category, items[i], i);
    }
  }

  // Salient quotes without categories: one chunk per quote
  if (Array.isArray(signals.salientQuotes)) {
    for (let i = 0; i < signals.salientQuotes.length; i++) {
      const quote = signals.salientQuotes[i];
      const chunk: Chunk = {
        id: `chunk-${personaId}-interview-salient_quote-${i}`,
        personaId,
        text: quote,
        chunkType: "interview",
        metadata: {
          sourceInterviewId: signals.interviewId,
          signalType: "salient_quote",
          topic: "salient_quote",
        },
      };
      chunks.push(chunk);
    }
  }

  // One structured summary chunk per interview
  const summaryText = JSON.stringify(
    {
      context: signals.context,
      communicationStyle: signals.communicationStyle,
    },
    null,
    2,
  );

  const summaryChunk: Chunk = {
    id: `chunk-${personaId}-interview-summary-0`,
    personaId,
    text: summaryText,
    chunkType: "interview",
    metadata: {
      sourceInterviewId: signals.interviewId,
      signalType: "interview_summary",
      topic: "interview_summary",
      // include counts of extracted signals to help retrieval filtering
      counts: {
        painPoints: signals.painPoints?.length ?? 0,
        goals: signals.goals?.length ?? 0,
        values: signals.values?.length ?? 0,
        featureDesires: signals.featureDesires?.length ?? 0,
        decisionPatterns: signals.decisionPatterns?.length ?? 0,
        salientQuotes: signals.salientQuotes?.length ?? 0,
      },
    },
  };

  chunks.push(summaryChunk);

  return chunks;
}
