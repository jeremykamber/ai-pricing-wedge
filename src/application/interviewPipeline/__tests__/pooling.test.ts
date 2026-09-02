import { describe, it, expect } from "vitest";
import { poolSignals } from "../pooling";
import type { ExtractedInterviewSignals } from "../types";

function mockExtraction(
  overrides: Partial<ExtractedInterviewSignals> = {},
): ExtractedInterviewSignals {
  return {
    interviewId: "interview-0",
    painPoints: [],
    goals: [],
    values: [],
    featureDesires: [],
    decisionPatterns: [],
    context: {},
    communicationStyle: "",
    salientQuotes: [],
    ...overrides,
  };
}

describe("poolSignals", () => {
  it("merges similar signals via trigram similarity", () => {
    const extractions: ExtractedInterviewSignals[] = [
      mockExtraction({
        interviewId: "interview-0",
        painPoints: [
          {
            text: "onboarding takes too long",
            quote: "Onboarding takes forever",
            sourceSegmentId: "seg-1",
          },
        ],
      }),
      mockExtraction({
        interviewId: "interview-1",
        painPoints: [
          {
            text: "onboarding takes very long",
            quote: "Setup is too slow",
            sourceSegmentId: "seg-2",
          },
        ],
      }),
    ];

    const result = poolSignals(extractions);

    expect(result.painPoints).toHaveLength(1);
    expect(result.painPoints[0].weight).toBe(1.0);
    expect(result.painPoints[0].sourceExamples).toHaveLength(2);
  });

  it("different signals remain separate", () => {
    const extractions: ExtractedInterviewSignals[] = [
      mockExtraction({
        interviewId: "interview-0",
        painPoints: [
          {
            text: "onboarding takes too long",
            quote: "Onboarding takes forever",
            sourceSegmentId: "seg-1",
          },
        ],
      }),
      mockExtraction({
        interviewId: "interview-1",
        painPoints: [
          {
            text: "pricing is too expensive",
            quote: "Too costly",
            sourceSegmentId: "seg-2",
          },
        ],
      }),
    ];

    const result = poolSignals(extractions);

    expect(result.painPoints).toHaveLength(2);
  });

  it("correct frequency normalization", () => {
    const extractions: ExtractedInterviewSignals[] = [
      mockExtraction({
        interviewId: "interview-0",
        painPoints: [
          {
            text: "onboarding is slow",
            quote: "It takes too long to get started",
            sourceSegmentId: "seg-1",
          },
        ],
      }),
      mockExtraction({
        interviewId: "interview-1",
        painPoints: [
          {
            text: "onboarding is slow",
            quote: "The setup process drags",
            sourceSegmentId: "seg-2",
          },
        ],
      }),
      mockExtraction({
        interviewId: "interview-2",
        painPoints: [
          {
            text: "pricing is high",
            quote: "The cost is too much",
            sourceSegmentId: "seg-3",
          },
        ],
      }),
    ];

    const result = poolSignals(extractions);

    expect(result.totalInterviews).toBe(3);
    const onboardingItem = result.painPoints.find(
      (p) => p.text === "onboarding is slow",
    );
    expect(onboardingItem).toBeDefined();
    // Appears in 2 out of 3 interviews
    expect(onboardingItem!.weight).toBeCloseTo(0.67, 1);
  });

  it("empty extraction array returns empty summary", () => {
    const result = poolSignals([]);

    expect(result.painPoints).toEqual([]);
    expect(result.goals).toEqual([]);
    expect(result.values).toEqual([]);
    expect(result.featureDesires).toEqual([]);
    expect(result.decisionPatterns).toEqual([]);
    expect(result.contextDistribution.roles).toEqual([]);
    expect(result.contextDistribution.industries).toEqual([]);
    expect(result.communicationStyles).toEqual([]);
    expect(result.allSalientQuotes).toEqual([]);
    expect(result.totalInterviews).toBe(0);
  });

  it("single interview returns weight 1.0", () => {
    const extractions: ExtractedInterviewSignals[] = [
      mockExtraction({
        interviewId: "interview-0",
        painPoints: [
          {
            text: "onboarding is slow",
            quote: "Very slow to start",
            sourceSegmentId: "seg-1",
          },
        ],
      }),
    ];

    const result = poolSignals(extractions);

    expect(result.totalInterviews).toBe(1);
    expect(result.painPoints).toHaveLength(1);
    expect(result.painPoints[0].weight).toBe(1.0);
  });

  it("source examples correctly attached", () => {
    const extractions: ExtractedInterviewSignals[] = [
      mockExtraction({
        interviewId: "interview-0",
        painPoints: [
          {
            text: "onboarding is slow",
            quote: "Quote from interview 0",
            sourceSegmentId: "seg-1",
          },
        ],
      }),
      mockExtraction({
        interviewId: "interview-1",
        painPoints: [
          {
            text: "onboarding is slow",
            quote: "Quote from interview 1",
            sourceSegmentId: "seg-2",
          },
        ],
      }),
      mockExtraction({
        interviewId: "interview-2",
        painPoints: [
          {
            text: "onboarding is slow",
            quote: "Quote from interview 2",
            sourceSegmentId: "seg-3",
          },
        ],
      }),
      mockExtraction({
        interviewId: "interview-3",
        painPoints: [
          {
            text: "onboarding is slow",
            quote: "Quote from interview 3",
            sourceSegmentId: "seg-4",
          },
        ],
      }),
    ];

    const result = poolSignals(extractions);

    expect(result.painPoints).toHaveLength(1);
    // Only first 3 quotes are attached
    expect(result.painPoints[0].sourceExamples).toHaveLength(3);
    expect(result.painPoints[0].sourceExamples).toContain(
      "Quote from interview 0",
    );
    expect(result.painPoints[0].sourceExamples).toContain(
      "Quote from interview 1",
    );
    expect(result.painPoints[0].sourceExamples).toContain(
      "Quote from interview 2",
    );
  });
});
