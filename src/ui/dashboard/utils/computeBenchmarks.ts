import type { PricingAnalysis } from "@/domain/entities/PricingAnalysis";

const SCORE_KEYS = [
  "clarity",
  "valuePerception",
  "trust",
  "explorationIntent",
  "analysisIntent",
  "buyIntent",
] as const;

export type ScoreKey = (typeof SCORE_KEYS)[number];

export interface ScoreWithBenchmark {
  value: number;
  delta: number | null;
  benchmarkAvg: number;
}

export interface AnalysisWithBenchmarks {
  personaName: string;
  scores: Record<ScoreKey, ScoreWithBenchmark>;
}

function getScoreValue(analysis: PricingAnalysis, key: ScoreKey): number {
  const val = analysis.scores?.[key];
  return typeof val === "number" ? val : 0;
}

export function computeRunAverages(
  analyses: PricingAnalysis[],
): Record<string, number> {
  const averages: Record<string, number> = {};
  if (analyses.length === 0) {
    for (const key of SCORE_KEYS) {
      averages[key] = 0;
    }
    return averages;
  }

  for (const key of SCORE_KEYS) {
    let sum = 0;
    for (const analysis of analyses) {
      sum += getScoreValue(analysis, key);
    }
    averages[key] = sum / analyses.length;
  }

  return averages;
}

export function computeScoresWithBenchmarks(
  analyses: PricingAnalysis[],
): AnalysisWithBenchmarks[] {
  if (analyses.length === 0) return [];

  const averages = computeRunAverages(analyses);
  const shouldComputeDeltas = analyses.length >= 3;

  return analyses.map((analysis) => {
    const personaName = analysis.personaProfile?.name ?? analysis.id;
    const scores = {} as Record<ScoreKey, ScoreWithBenchmark>;

    for (const key of SCORE_KEYS) {
      const value = getScoreValue(analysis, key);
      const benchmarkAvg = averages[key];
      const delta = shouldComputeDeltas ? value - benchmarkAvg : null;

      if (delta !== null) {
        const sign = delta >= 0 ? "+" : "";
        console.log(
          "[TRACE] [Benchmark] analysis=" +
            personaName +
            ", " +
            key +
            "=" +
            value +
            "/" +
            sign +
            delta.toFixed(1),
        );
      }

      scores[key] = { value, delta, benchmarkAvg };
    }

    return { personaName, scores };
  });
}

export function logDivergenceMetrics(analyses: PricingAnalysis[]): void {
  const primaryFrictions = new Set<string>();
  for (const analysis of analyses) {
    const firstRisk = analysis.risks?.[0];
    if (firstRisk) {
      primaryFrictions.add(firstRisk);
    }
  }

  const frictionList = Array.from(primaryFrictions);
  console.log(
    "[TRACE] [Divergence] analyses=" +
      analyses.length +
      ", unique_primary_frictions=" +
      frictionList.length +
      ", top_frictions=[" +
      frictionList.join(", ") +
      "]",
  );
}
