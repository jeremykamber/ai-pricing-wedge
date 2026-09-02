import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeRunAverages,
  computeScoresWithBenchmarks,
  logDivergenceMetrics,
} from "../computeBenchmarks";
import type { PricingAnalysis } from "@/domain/entities/PricingAnalysis";

const mockAnalyses: Pick<
  PricingAnalysis,
  "id" | "personaProfile" | "scores" | "risks"
>[] = [
  {
    id: "1",
    personaProfile: { name: "Casey" } as PricingAnalysis["personaProfile"],
    scores: {
      clarity: 8,
      clarityReason: "Clear pricing tiers",
      valuePerception: 7,
      valuePerceptionReason: "Good value",
      trust: 6,
      trustReason: "Trustworthy",
      explorationIntent: 5,
      explorationIntentReason: "Would explore",
      analysisIntent: 4,
      analysisIntentReason: "Would analyze",
      buyIntent: 3,
      buyIntentReason: "Might buy",
    },
    risks: ["Too expensive"],
  },
  {
    id: "2",
    personaProfile: { name: "Riley" } as PricingAnalysis["personaProfile"],
    scores: {
      clarity: 6,
      clarityReason: "Somewhat clear",
      valuePerception: 5,
      valuePerceptionReason: "Okay value",
      trust: 4,
      trustReason: "Neutral trust",
      explorationIntent: 3,
      explorationIntentReason: "Mild interest",
      analysisIntent: 2,
      analysisIntentReason: "Low interest",
      buyIntent: 1,
      buyIntentReason: "Won't buy",
    },
    risks: ["Enterprise pricing opaque"],
  },
  {
    id: "3",
    personaProfile: { name: "Elliot" } as PricingAnalysis["personaProfile"],
    scores: {
      clarity: 7,
      clarityReason: "Pretty clear",
      valuePerception: 6,
      valuePerceptionReason: "Decent",
      trust: 5,
      trustReason: "Okay",
      explorationIntent: 4,
      explorationIntentReason: "Some interest",
      analysisIntent: 3,
      analysisIntentReason: "Maybe",
      buyIntent: 2,
      buyIntentReason: "Unlikely",
    },
    risks: ["250-issue limit"],
  },
];

describe("computeRunAverages", () => {
  it("should compute correct averages for 3 analyses", () => {
    const result = computeRunAverages(mockAnalyses as any);
    expect(result.clarity).toBeCloseTo(7.0);
    expect(result.valuePerception).toBeCloseTo(6.0);
    expect(result.trust).toBeCloseTo(5.0);
    expect(result.explorationIntent).toBeCloseTo(4.0);
    expect(result.analysisIntent).toBeCloseTo(3.0);
    expect(result.buyIntent).toBeCloseTo(2.0);
  });

  it("should return all zeros for empty array", () => {
    const result = computeRunAverages([]);
    expect(result.clarity).toBe(0);
    expect(result.valuePerception).toBe(0);
    expect(result.trust).toBe(0);
    expect(result.explorationIntent).toBe(0);
    expect(result.analysisIntent).toBe(0);
    expect(result.buyIntent).toBe(0);
  });

  it("should default missing score fields to 0", () => {
    const incompleteAnalyses = [
      {
        id: "1",
        personaProfile: { name: "Casey" },
        scores: {
          clarity: 8,
          clarityReason: "Clear",
          valuePerception: 7,
          valuePerceptionReason: "Good",
          trust: 6,
          trustReason: "Trustworthy",
          explorationIntent: 5,
          explorationIntentReason: "Why not",
          analysisIntent: 4,
          analysisIntentReason: "Analyze",
          buyIntent: 3,
          buyIntentReason: "Buy",
        },
        risks: [],
      },
      {
        id: "2",
        personaProfile: { name: "Riley" },
        scores: {
          clarity: 2,
          clarityReason: "Bad",
          valuePerception: 3,
          valuePerceptionReason: "Bad",
          // trust missing entirely
          trustReason: "No trust",
          explorationIntent: 1,
          explorationIntentReason: "No",
          analysisIntent: 1,
          analysisIntentReason: "No",
          buyIntent: 1,
          buyIntentReason: "No",
        },
        risks: [],
      },
    ];

    const result = computeRunAverages(incompleteAnalyses as any);
    // clarity: (8 + 2) / 2 = 5.0
    expect(result.clarity).toBeCloseTo(5.0);
    // trust: (6 + 0) / 2 = 3.0
    expect(result.trust).toBeCloseTo(3.0);
  });
});

describe("computeScoresWithBenchmarks", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should return correct deltas for 3 analyses", () => {
    const result = computeScoresWithBenchmarks(mockAnalyses as any);

    expect(result).toHaveLength(3);

    // Casey clarity: 8 - 7 = +1.0
    expect(result[0].scores.clarity.delta).toBeCloseTo(1.0);
    expect(result[0].scores.clarity.benchmarkAvg).toBeCloseTo(7.0);

    // Riley clarity: 6 - 7 = -1.0
    expect(result[1].scores.clarity.delta).toBeCloseTo(-1.0);
    expect(result[1].scores.clarity.benchmarkAvg).toBeCloseTo(7.0);

    // Elliot clarity: 7 - 7 = 0
    expect(result[2].scores.clarity.delta).toBeCloseTo(0);
    expect(result[2].scores.clarity.benchmarkAvg).toBeCloseTo(7.0);
  });

  it("should return null deltas for 1 analysis", () => {
    const single = [mockAnalyses[0]];
    const result = computeScoresWithBenchmarks(single as any);

    expect(result).toHaveLength(1);
    expect(result[0].scores.clarity.delta).toBeNull();
    expect(result[0].scores.valuePerception.delta).toBeNull();
    expect(result[0].scores.trust.delta).toBeNull();
    expect(result[0].scores.explorationIntent.delta).toBeNull();
    expect(result[0].scores.analysisIntent.delta).toBeNull();
    expect(result[0].scores.buyIntent.delta).toBeNull();
    // benchmarkAvg should still be set
    expect(result[0].scores.clarity.benchmarkAvg).toBeCloseTo(8.0);
  });

  it("should return null deltas for 2 analyses", () => {
    const two = [mockAnalyses[0], mockAnalyses[1]];
    const result = computeScoresWithBenchmarks(two as any);

    expect(result).toHaveLength(2);
    expect(result[0].scores.clarity.delta).toBeNull();
    expect(result[1].scores.clarity.delta).toBeNull();
  });

  it("should default missing score fields to 0", () => {
    const incomplete = [
      {
        id: "1",
        personaProfile: { name: "Casey" },
        scores: {
          clarity: 8,
          clarityReason: "Clear",
          valuePerception: 7,
          valuePerceptionReason: "Good",
          trust: 6,
          trustReason: "Trustworthy",
          explorationIntent: 5,
          explorationIntentReason: "Why not",
          analysisIntent: 4,
          analysisIntentReason: "Analyze",
          buyIntent: 3,
          buyIntentReason: "Buy",
        },
        risks: [],
      },
      {
        id: "2",
        personaProfile: { name: "Riley" },
        scores: {
          clarity: 4,
          clarityReason: "Okay",
          valuePerception: 3,
          valuePerceptionReason: "Okay",
          trust: 2,
          trustReason: "Okay",
          explorationIntent: 1,
          explorationIntentReason: "Okay",
          // analysisIntent missing entirely
          analysisIntentReason: "Okay",
          // buyIntent missing entirely
          buyIntentReason: "Okay",
        },
        risks: [],
      },
    ];

    const result = computeScoresWithBenchmarks(incomplete as any);
    expect(result).toHaveLength(2);

    // Riley's missing analysisIntent should default to 0
    expect(result[1].scores.analysisIntent.value).toBe(0);
    // Riley's missing buyIntent should default to 0
    expect(result[1].scores.buyIntent.value).toBe(0);

    // analysisIntent avg: (4 + 0) / 2 = 2.0
    expect(result[0].scores.analysisIntent.benchmarkAvg).toBeCloseTo(2.0);
  });

  it("should return empty array for empty input", () => {
    const result = computeScoresWithBenchmarks([]);
    expect(result).toEqual([]);
  });

  it("should include personaName in each result", () => {
    const result = computeScoresWithBenchmarks(mockAnalyses as any);
    expect(result[0].personaName).toBe("Casey");
    expect(result[1].personaName).toBe("Riley");
    expect(result[2].personaName).toBe("Elliot");
  });
});

describe("logDivergenceMetrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should log correct divergence metrics format", () => {
    logDivergenceMetrics(mockAnalyses as any);

    expect(console.log).toHaveBeenCalledTimes(1);
    const logArg = (console.log as any).mock.calls[0][0];
    expect(logArg).toContain("[TRACE] [Divergence]");
    expect(logArg).toContain("analyses=3");
    expect(logArg).toContain("unique_primary_frictions=3");
    expect(logArg).toContain("Too expensive");
    expect(logArg).toContain("Enterprise pricing opaque");
    expect(logArg).toContain("250-issue limit");
  });

  it("should handle duplicate primary frictions", () => {
    const duplicateRisks = [
      { id: "1", scores: mockAnalyses[0].scores, risks: ["Too expensive"] },
      { id: "2", scores: mockAnalyses[0].scores, risks: ["Too expensive"] },
    ];

    logDivergenceMetrics(duplicateRisks as any);

    const logArg = (console.log as any).mock.calls[0][0];
    expect(logArg).toContain("unique_primary_frictions=1");
  });

  it("should handle analyses with no risks", () => {
    const noRisks = [
      { id: "1", scores: mockAnalyses[0].scores, risks: [] },
      { id: "2", scores: mockAnalyses[0].scores },
    ];

    logDivergenceMetrics(noRisks as any);

    const logArg = (console.log as any).mock.calls[0][0];
    expect(logArg).toContain("unique_primary_frictions=0");
  });
});
