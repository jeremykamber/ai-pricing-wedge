import type {
  ExtractedSignal,
  PooledDistributionSummary,
  SampledPersonaSignal,
  WeightedItem,
} from './types';

/**
 * Weighted random selection **without replacement** within a single draw.
 * Duplicates of the same item MAY occur across separate draws (different personas),
 * but not within one call (one persona's category).
 *
 * The draw count is randomised uniformly between `min` and `max` (inclusive),
 * then capped to the number of distinct items available.
 * Items with higher `weight` values are more likely to be selected.
 *
 * @returns An array of drawn items (length between 0 and `Math.min(count, items.length)`).
 */
export function weightedDraw(
  items: WeightedItem[],
  min: number,
  max: number,
): WeightedItem[] {
  if (items.length === 0) return [];

  const desired = min + Math.floor(Math.random() * (max - min + 1));
  const count = Math.min(desired, items.length);
  if (count <= 0) return [];

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight <= 0) return [];

  const pool = [...items];
  const result: WeightedItem[] = [];

  for (let i = 0; i < count; i++) {
    const currentTotal = pool.reduce((sum, item) => sum + item.weight, 0);
    if (currentTotal <= 0) break;

    const threshold = Math.random() * currentTotal;
    let cumulative = 0;

    for (let j = 0; j < pool.length; j++) {
      cumulative += pool[j].weight;
      if (threshold <= cumulative) {
        result.push(pool[j]);
        pool.splice(j, 1);
        break;
      }
    }
  }

  return result;
}

function toExtractedSignal(item: WeightedItem): ExtractedSignal {
  return {
    text: item.text,
    quote:
      item.sourceExamples.length > 0
        ? item.sourceExamples[
            Math.floor(Math.random() * item.sourceExamples.length)
          ]
        : item.text,
    sourceSegmentId: 'sampled',
  };
}

function createPersonaSignal(
  distribution: PooledDistributionSummary,
  idx: number,
): SampledPersonaSignal {
  const painPoints = weightedDraw(distribution.painPoints, 2, 4).map(
    toExtractedSignal,
  );
  const goals = weightedDraw(distribution.goals, 1, 3).map(toExtractedSignal);
  const values = weightedDraw(distribution.values, 2, 4).map(toExtractedSignal);
  const featureDesires = weightedDraw(distribution.featureDesires, 1, 3).map(
    toExtractedSignal,
  );
  const decisionPattern = weightedDraw(distribution.decisionPatterns, 1, 1).map(
    toExtractedSignal,
  );
  const role = weightedDraw(distribution.contextDistribution.roles, 1, 1);
  const industry = weightedDraw(
    distribution.contextDistribution.industries,
    1,
    1,
  );
  const communicationStyle = weightedDraw(
    distribution.communicationStyles,
    1,
    1,
  );

  return {
    id: `sampled-${idx}`,
    painPoints,
    goals,
    values,
    featureDesires,
    decisionPattern: decisionPattern[0],
    context: {
      role: role[0],
      industry: industry[0],
    },
    communicationStyle: communicationStyle[0],
  };
}

/**
 * Sample `personaCount` personas from a pooled distribution summary using
 * weighted random draws with min/max ranges per category:
 *
 * | Category          | Min | Max |
 * |-------------------|-----|-----|
 * | painPoints        | 2   | 4   |
 * | goals             | 1   | 3   |
 * | values            | 2   | 4   |
 * | featureDesires    | 1   | 3   |
 * | decisionPattern   | 1   | 1   |
 * | context.role      | 1   | 1   |
 * | context.industry  | 1   | 1   |
 * | communicationStyle| 1   | 1   |
 *
 * After the initial sample, if `onValidate` is provided it receives all
 * N personas and returns the indices of any that are contradictory.
 * Contradictory personas are resampled (up to 3 batch-level retries).
 *
 * This is a pure application-layer function – it makes NO LLM calls directly.
 * Coherence validation is injected via the optional `onValidate` callback.
 */
export async function samplePersonas(
  distribution: PooledDistributionSummary,
  personaCount: number,
  onValidate?: (
    personas: SampledPersonaSignal[],
  ) => Promise<number[]>,
): Promise<SampledPersonaSignal[]> {
  if (personaCount <= 0) return [];

  const personas: SampledPersonaSignal[] = [];
  for (let i = 0; i < personaCount; i++) {
    personas.push(createPersonaSignal(distribution, i));
  }

  if (onValidate) {
    let contradictoryIndices = await onValidate(personas);
    let retries = 0;
    const MAX_RETRIES = 3;

    while (contradictoryIndices.length > 0 && retries < MAX_RETRIES) {
      for (const idx of contradictoryIndices) {
        if (idx >= 0 && idx < personas.length) {
          personas[idx] = createPersonaSignal(distribution, idx);
        }
      }
      contradictoryIndices = await onValidate(personas);
      retries++;
    }
  }

  return personas;
}
