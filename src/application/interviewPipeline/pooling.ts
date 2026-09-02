import type {
  PooledDistributionSummary,
  ExtractedInterviewSignals,
  ExtractedSignal,
  WeightedItem,
} from "./types";
import { ngramFingerprint, cosineSimilarity } from "./ngramUtils";

interface SignalWithSource extends ExtractedSignal {
  interviewId: string;
}

interface SignalCluster {
  text: string;
  interviewIds: Set<string>;
  quotes: string[];
}

function clusterSignals(
  signals: SignalWithSource[],
  threshold: number,
): SignalCluster[] {
  const clusters: SignalCluster[] = [];

  for (const signal of signals) {
    const fp = ngramFingerprint(signal.text);
    let matched = false;

    for (const cluster of clusters) {
      const cfp = ngramFingerprint(cluster.text);
      if (cosineSimilarity(fp, cfp) >= threshold) {
        cluster.interviewIds.add(signal.interviewId);
        cluster.quotes.push(signal.quote);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push({
        text: signal.text,
        interviewIds: new Set([signal.interviewId]),
        quotes: [signal.quote],
      });
    }
  }

  return clusters;
}

function poolSignalCategory(
  allExtractions: ExtractedInterviewSignals[],
  extractor: (s: ExtractedInterviewSignals) => readonly ExtractedSignal[],
  threshold: number,
): WeightedItem[] {
  const totalInterviews = allExtractions.length;
  if (totalInterviews === 0) return [];

  const allSignals: SignalWithSource[] = allExtractions.flatMap((e) =>
    extractor(e).map((s: ExtractedSignal) => ({ ...s, interviewId: e.interviewId })),
  );
  if (allSignals.length === 0) return [];

  const clusters = clusterSignals(allSignals, threshold);

  return clusters
    .map((c) => ({
      text: c.text,
      weight: c.interviewIds.size / totalInterviews,
      sourceExamples: c.quotes.slice(0, 3),
    }))
    .sort((a, b) => b.weight - a.weight);
}

function aggregateStringItems(
  items: string[],
  totalInterviews: number,
): WeightedItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([text, count]) => ({
      text,
      weight: count / totalInterviews,
      sourceExamples: [],
    }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Pool extracted signals from multiple interviews into a single
 * distribution summary, deduplicating similar signals via trigram
 * similarity.
 *
 * @param allExtractions - Signal extractions from each interview
 * @param threshold      - Cosine-similarity threshold for merging (default 0.7)
 */
export function poolSignals(
  allExtractions: ExtractedInterviewSignals[],
  threshold = 0.7,
): PooledDistributionSummary {
  const totalInterviews = allExtractions.length;

  return {
    painPoints: poolSignalCategory(allExtractions, (s) => s.painPoints, threshold),
    goals: poolSignalCategory(allExtractions, (s) => s.goals, threshold),
    values: poolSignalCategory(allExtractions, (s) => s.values, threshold),
    featureDesires: poolSignalCategory(allExtractions, (s) => s.featureDesires, threshold),
    decisionPatterns: poolSignalCategory(allExtractions, (s) => s.decisionPatterns, threshold),

    contextDistribution: {
      roles: aggregateStringItems(
        allExtractions.map((e) => e.context.role).filter((r): r is string => r !== undefined),
        totalInterviews,
      ),
      industries: aggregateStringItems(
        allExtractions.map((e) => e.context.industry).filter((r): r is string => r !== undefined),
        totalInterviews,
      ),
    },

    communicationStyles: aggregateStringItems(
      allExtractions.map((e) => e.communicationStyle).filter(Boolean),
      totalInterviews,
    ),

    allSalientQuotes: allExtractions.flatMap((e) => e.salientQuotes),
    totalInterviews,
  };
}
