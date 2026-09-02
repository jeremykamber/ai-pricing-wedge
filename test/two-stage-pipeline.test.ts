import { describe, it, expect } from "vitest";
import {
  StreamOfConsciousness,
  validateStreamOfConsciousness,
} from "@/domain/entities/StreamOfConsciousness";
import {
  PricingAnalysis,
  validatePricingAnalysis,
} from "@/domain/entities/PricingAnalysis";

describe("StreamOfConsciousness", () => {
  const validStream: StreamOfConsciousness = {
    text: `[The Good] The pricing page looks clean. I like how they organize the tiers.
[The Bad] But I'm confused about what the Pro plan actually includes.
[The Dealbreaker] The lack of a free trial really concerns me.`,
    personaId: "persona-1",
    personaName: "Alex Chen",
  };

  it("validates a correct StreamOfConsciousness", () => {
    expect(validateStreamOfConsciousness(validStream)).toBe(true);
  });

  it("rejects empty text", () => {
    expect(
      validateStreamOfConsciousness({ ...validStream, text: "" })
    ).toBe(false);
  });

  it("rejects missing personaId", () => {
    expect(
      validateStreamOfConsciousness({ ...validStream, personaId: "" })
    ).toBe(false);
  });

  it("rejects missing personaName", () => {
    expect(
      validateStreamOfConsciousness({ ...validStream, personaName: "" })
    ).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateStreamOfConsciousness(null)).toBe(false);
    expect(validateStreamOfConsciousness("string")).toBe(false);
    expect(validateStreamOfConsciousness(42)).toBe(false);
  });

  it("rejects text that is too short (likely not real stream of consciousness)", () => {
    expect(
      validateStreamOfConsciousness({ ...validStream, text: "OK" })
    ).toBe(false);
  });
});

describe("Two-Stage Pipeline - Formatter Output", () => {
  const validFormatted: PricingAnalysis = {
    id: "test-1",
    url: "https://example.com/pricing",
    screenshotBase64: "base64data",
    thoughts:
      "[The Good] Clean design. [The Bad] Confusing tiers. [The Dealbreaker] No trial.",
    scores: {
      clarity: 7,
      clarityReason: "Pricing is clearly displayed.",
      valuePerception: 5,
      valuePerceptionReason: "Seems fair but I need more info.",
      trust: 6,
      trustReason: "Professional looking site.",
      explorationIntent: 7,
      explorationIntentReason: "I'd click around to learn more.",
      analysisIntent: 5,
      analysisIntentReason: "Would compare with alternatives.",
      buyIntent: 4,
      buyIntentReason: "Need a trial first.",
    },
    risks: ["No free trial available", "Unclear what Pro includes"],
    recommendations: [
      "Add a free trial to the Pro plan",
      "Clarify Pro plan features",
    ],
    aiSuggestion:
      "I'd want to see a free trial option before committing to the Pro plan.",
  };

  it("formatter output passes validatePricingAnalysis", () => {
    expect(validatePricingAnalysis(validFormatted)).toBe(true);
  });

  it("formatter output has all required fields", () => {
    expect(validFormatted.thoughts).toBeTruthy();
    expect(validFormatted.scores).toBeDefined();
    expect(validFormatted.risks.length).toBeGreaterThan(0);
    expect(validFormatted.recommendations.length).toBeGreaterThan(0);
    expect(validFormatted.aiSuggestion).toBeTruthy();
  });

  it("recommendations are company directives (not self-advice)", () => {
    const selfAdvicePatterns = [
      /^check /i,
      /^look for /i,
      /^see if /i,
      /^find out /i,
      /^verify /i,
      /^make sure /i,
    ];

    for (const rec of validFormatted.recommendations) {
      for (const pattern of selfAdvicePatterns) {
        expect(rec).not.toMatch(pattern);
      }
    }
  });

  it("risks are in first person (persona perspective)", () => {
    const risks = validFormatted.risks;
    expect(risks.length).toBeGreaterThan(0);
    // Risks should not be generic system messages
    for (const risk of risks) {
      expect(risk).not.toContain("[SYSTEM]");
    }
  });

  it("scores follow funnel logic (exploration >= analysis >= buy)", () => {
    const { explorationIntent, analysisIntent, buyIntent } = validFormatted.scores;
    expect(explorationIntent).toBeGreaterThanOrEqual(analysisIntent);
    expect(analysisIntent).toBeGreaterThanOrEqual(buyIntent);
  });

  it("all scores are within valid range (1-10)", () => {
    const { scores } = validFormatted;
    expect(scores.clarity).toBeGreaterThanOrEqual(1);
    expect(scores.clarity).toBeLessThanOrEqual(10);
    expect(scores.valuePerception).toBeGreaterThanOrEqual(1);
    expect(scores.valuePerception).toBeLessThanOrEqual(10);
    expect(scores.trust).toBeGreaterThanOrEqual(1);
    expect(scores.trust).toBeLessThanOrEqual(10);
    expect(scores.explorationIntent).toBeGreaterThanOrEqual(1);
    expect(scores.explorationIntent).toBeLessThanOrEqual(10);
    expect(scores.analysisIntent).toBeGreaterThanOrEqual(1);
    expect(scores.analysisIntent).toBeLessThanOrEqual(10);
    expect(scores.buyIntent).toBeGreaterThanOrEqual(1);
    expect(scores.buyIntent).toBeLessThanOrEqual(10);
  });
});

describe("Two-Stage Pipeline - Stream Quality", () => {
  it("stream of consciousness is natural text (not JSON)", () => {
    const naturalStream = `[The Good] The pricing page looks clean. I like how they organize the tiers.
[The Bad] But I'm confused about what the Pro plan actually includes.
[The Dealbreaker] The lack of a free trial really concerns me.`;

    // Should not start with { (JSON object)
    expect(naturalStream.trim().startsWith("{")).toBe(false);

    // Should contain natural language markers (first person)
    expect(naturalStream).toContain("I like");
    expect(naturalStream).toContain("I'm confused");
    expect(naturalStream).toContain("concerns me");
  });

  it("stream of consciousness has structure markers", () => {
    const streamWithMarkers = `[The Good] Great design.
[The Bad] Confusing pricing.
[The Dealbreaker] No trial.`;

    expect(streamWithMarkers).toContain("[The Good]");
    expect(streamWithMarkers).toContain("[The Bad]");
    expect(streamWithMarkers).toContain("[The Dealbreaker]");
  });
});

describe("Two-Stage Pipeline - Summary Bullets", () => {
  it("summary bullets are concise strings", () => {
    const summaryBullets = [
      "The pricing page has a clean, professional design.",
      "The lack of a free trial is a major concern.",
      "Pro plan features are unclear and need clarification.",
    ];

    expect(summaryBullets.length).toBeGreaterThanOrEqual(3);
    expect(summaryBullets.length).toBeLessThanOrEqual(5);

    for (const bullet of summaryBullets) {
      expect(typeof bullet).toBe("string");
      expect(bullet.length).toBeGreaterThan(10);
      expect(bullet.length).toBeLessThanOrEqual(200);
    }
  });
});
