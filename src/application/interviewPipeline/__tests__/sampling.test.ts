import { describe, it, expect, vi } from "vitest";
import { samplePersonas, weightedDraw } from "../sampling";
import type {
  PooledDistributionSummary,
  SampledPersonaSignal,
  WeightedItem,
} from "../types";

function createDistribution(
  overrides: Partial<PooledDistributionSummary> = {},
): PooledDistributionSummary {
  return {
    painPoints: [{ text: "pain point", weight: 1.0, sourceExamples: [] }],
    goals: [{ text: "goal", weight: 1.0, sourceExamples: [] }],
    values: [{ text: "value", weight: 1.0, sourceExamples: [] }],
    featureDesires: [{ text: "feature", weight: 1.0, sourceExamples: [] }],
    decisionPatterns: [
      { text: "decision pattern", weight: 1.0, sourceExamples: [] },
    ],
    contextDistribution: {
      roles: [{ text: "engineer", weight: 1.0, sourceExamples: [] }],
      industries: [{ text: "tech", weight: 1.0, sourceExamples: [] }],
    },
    communicationStyles: [
      { text: "direct", weight: 1.0, sourceExamples: [] },
    ],
    allSalientQuotes: [],
    totalInterviews: 1,
    ...overrides,
  };
}

describe("weightedDraw", () => {
  it("returns correct distribution across many draws", () => {
    const items: WeightedItem[] = [
      { text: "high", weight: 0.9, sourceExamples: [] },
      { text: "low", weight: 0.1, sourceExamples: [] },
    ];

    let highCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const result = weightedDraw(items, 1, 1);
      if (result[0]?.text === "high") highCount++;
    }

    const ratio = highCount / trials;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(0.95);
  });

  it("returns empty array for empty items", () => {
    expect(weightedDraw([], 1, 3)).toEqual([]);
  });

  it("returns empty array when count rounds to zero", () => {
    const items: WeightedItem[] = [
      { text: "test", weight: 1.0, sourceExamples: [] },
    ];
    expect(weightedDraw(items, 0, 0)).toEqual([]);
  });

  it("does not select more items than available", () => {
    const items: WeightedItem[] = [
      { text: "a", weight: 1.0, sourceExamples: [] },
      { text: "b", weight: 1.0, sourceExamples: [] },
    ];
    const result = weightedDraw(items, 5, 10);
    expect(result).toHaveLength(2);
    expect(result[0].text).not.toBe(result[1].text);
  });

  it("drawn items have no replacement within single draw", () => {
    const items: WeightedItem[] = [
      { text: "a", weight: 1.0, sourceExamples: [] },
      { text: "b", weight: 1.0, sourceExamples: [] },
      { text: "c", weight: 1.0, sourceExamples: [] },
    ];
    // Draw 3 items from 3, each must be unique
    const result = weightedDraw(items, 3, 3);
    expect(result).toHaveLength(3);
    const texts = result.map((r) => r.text).sort();
    expect(texts).toEqual(["a", "b", "c"]);
  });
});

describe("samplePersonas", () => {
  it("sampled persona has correct structure", async () => {
    const distribution = createDistribution();
    const personas = await samplePersonas(distribution, 1);

    expect(personas).toHaveLength(1);
    const p = personas[0];

    expect(p.id).toBe("sampled-0");
    expect(Array.isArray(p.painPoints)).toBe(true);
    expect(Array.isArray(p.goals)).toBe(true);
    expect(Array.isArray(p.values)).toBe(true);
    expect(Array.isArray(p.featureDesires)).toBe(true);
    expect(p.decisionPattern).toBeDefined();
    expect(p.decisionPattern.text).toBe("decision pattern");
    expect(p.context.role).toBeDefined();
    expect(p.context.role.text).toBe("engineer");
    expect(p.context.industry).toBeDefined();
    expect(p.context.industry.text).toBe("tech");
    expect(p.communicationStyle).toBeDefined();
    expect(p.communicationStyle.text).toBe("direct");

    // Verify ExtractedSignal shape on one of the signal arrays
    if (p.painPoints.length > 0) {
      expect(p.painPoints[0]).toHaveProperty("text");
      expect(p.painPoints[0]).toHaveProperty("quote");
      expect(p.painPoints[0]).toHaveProperty("sourceSegmentId", "sampled");
    }
  });

  it("empty distribution returns requested number of personas", async () => {
    const distribution = createDistribution({
      painPoints: [],
      goals: [],
      values: [],
      featureDesires: [],
      decisionPatterns: [],
      contextDistribution: { roles: [], industries: [] },
      communicationStyles: [],
    });

    const personas = await samplePersonas(distribution, 3);
    expect(personas).toHaveLength(3);
  });

  it("handles personaCount greater than available variety", async () => {
    const distribution = createDistribution(); // 1 item per category
    const personas = await samplePersonas(distribution, 5);
    expect(personas).toHaveLength(5);
  });

  it("coherence validation resamples contradictory personas", async () => {
    const distribution = createDistribution({
      painPoints: [
        { text: "pain A", weight: 0.5, sourceExamples: [] },
        { text: "pain B", weight: 0.5, sourceExamples: [] },
      ],
      goals: [
        { text: "goal A", weight: 0.5, sourceExamples: [] },
        { text: "goal B", weight: 0.5, sourceExamples: [] },
      ],
      values: [
        { text: "value A", weight: 0.5, sourceExamples: [] },
        { text: "value B", weight: 0.5, sourceExamples: [] },
      ],
      featureDesires: [
        { text: "feature A", weight: 0.5, sourceExamples: [] },
        { text: "feature B", weight: 0.5, sourceExamples: [] },
      ],
      decisionPatterns: [
        { text: "decision A", weight: 0.5, sourceExamples: [] },
        { text: "decision B", weight: 0.5, sourceExamples: [] },
      ],
      contextDistribution: {
        roles: [
          { text: "engineer", weight: 0.5, sourceExamples: [] },
          { text: "designer", weight: 0.5, sourceExamples: [] },
        ],
        industries: [
          { text: "tech", weight: 0.5, sourceExamples: [] },
          { text: "finance", weight: 0.5, sourceExamples: [] },
        ],
      },
      communicationStyles: [
        { text: "direct", weight: 0.5, sourceExamples: [] },
        { text: "verbose", weight: 0.5, sourceExamples: [] },
      ],
    });

    const capturedPersonas: SampledPersonaSignal[][] = [];
    const onValidate = vi.fn(
      async (personas: SampledPersonaSignal[]): Promise<number[]> => {
        capturedPersonas.push(structuredClone(personas));
        if (capturedPersonas.length === 1) return [0, 2];
        if (capturedPersonas.length === 2) return [1];
        return [];
      },
    );

    const personas = await samplePersonas(distribution, 3, onValidate);

    expect(personas).toHaveLength(3);
    // Called 3 times: initial validation + 2 resample rounds
    expect(onValidate).toHaveBeenCalledTimes(3);

    // First validation received 3 personas with sequential ids
    expect(capturedPersonas[0]).toHaveLength(3);
    expect(capturedPersonas[0][0].id).toBe("sampled-0");
    expect(capturedPersonas[0][1].id).toBe("sampled-1");
    expect(capturedPersonas[0][2].id).toBe("sampled-2");

    // Persona 0 and 2 were resampled (new object references), persona 1 kept original
    // Verify by checking IDs are correct in all rounds
    expect(capturedPersonas[1][0].id).toBe("sampled-0");
    expect(capturedPersonas[1][1].id).toBe("sampled-1");
    expect(capturedPersonas[1][2].id).toBe("sampled-2");

    // The returned personas must have correct types and structure
    for (const p of personas) {
      expect(Array.isArray(p.painPoints)).toBe(true);
      expect(p.decisionPattern).toBeDefined();
      expect(p.context.role).toBeDefined();
      expect(p.context.industry).toBeDefined();
      expect(p.communicationStyle).toBeDefined();
    }

    // Final returned personas should be the last validated set
    expect(personas).toEqual(capturedPersonas[2]);
  });

  it("personaCount of 0 returns empty array", async () => {
    const distribution = createDistribution();
    const personas = await samplePersonas(distribution, 0);
    expect(personas).toEqual([]);
  });
});
