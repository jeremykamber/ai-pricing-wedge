import { describe, it, expect } from "vitest";
import {
  extractVerbatimQuote,
  groundSynthesisCitations,
} from "../citations";

describe("extractVerbatimQuote", () => {
  const transcript =
    "First impressions matter. The pricing page confused me! I left to compare plans?\nThen I noticed the monthly toggle. Good catch by me.";

  it("extracts the sentence containing the anchor (period boundaries)", () => {
    const q = extractVerbatimQuote(transcript, "pricing page confused");
    expect(q).toBe("The pricing page confused me!");
  });

  it("expands to full sentence around the anchor", () => {
    const q = extractVerbatimQuote(transcript, "monthly toggle");
    expect(q).toBe("Then I noticed the monthly toggle.");
  });

  it("is case-insensitive on the anchor", () => {
    const q = extractVerbatimQuote(transcript, "PRICING PAGE CONFUSED");
    expect(q).toBe("The pricing page confused me!");
  });

  it("returns null on no match", () => {
    expect(extractVerbatimQuote(transcript, "unicorn unicorn")).toBeNull();
  });

  it("returns null for empty transcript or empty anchor", () => {
    expect(extractVerbatimQuote("", "anything")).toBeNull();
    expect(extractVerbatimQuote(transcript, "")).toBeNull();
    expect(extractVerbatimQuote(transcript, "   ")).toBeNull();
  });

  it("handles anchor at the very start", () => {
    const q = extractVerbatimQuote(transcript, "First impressions");
    expect(q).toBe("First impressions matter.");
  });

  it("handles anchor at the very end (no trailing ender)", () => {
    const q = extractVerbatimQuote(transcript, "Good catch");
    expect(q).toBe("Good catch by me.");
  });

  it("first occurrence wins on multiple matches", () => {
    const t = "I love the dashboard. It is fast. I love the dashboard more each day.";
    const q = extractVerbatimQuote(t, "love the dashboard");
    expect(q).toBe("I love the dashboard.");
  });

  it("newline acts as a sentence ender", () => {
    const t = "Opened the app\nThe sidebar was hidden";
    const q = extractVerbatimQuote(t, "sidebar was hidden");
    expect(q).toBe("The sidebar was hidden");
  });

  it("anchor at the start of a sentence after a newline", () => {
    const t = "Line one ends here\nAnchor sentence. Following text.";
    const q = extractVerbatimQuote(t, "Anchor sentence");
    expect(q).toBe("Anchor sentence.");
  });

  it("result is always a verbatim substring", () => {
    const t = "Ein Satz mit Ümläuten und 'emoji'. Zweiter Satz.";
    const q = extractVerbatimQuote(t, "Ümläuten");
    expect(t).toContain(q);
  });
});

describe("groundSynthesisCitations", () => {
  const transcripts = [
    {
      personaId: "p-1",
      personaName: "Sarah Chen",
      transcript:
        "The pricing page confused me completely. I looked for a monthly option but found none.",
    },
    {
      personaId: "p-2",
      personaName: "Miguel Torres",
      transcript:
        "Setup was quick. However the enterprise tier hides SSO behind a sales call.",
    },
  ];

  const baseFinding = {
    observation: "Pricing opacity blocks action",
    evidence: "Both personas hit pricing walls",
    impact: "Drop-off before trial",
    confidence: "strongly supported" as const,
    affectedPersonaCount: 2,
    totalPersonaCount: 2,
  };

  it("resolves locators into verbatim citations with denormalized names", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "p-1", uniqueAnchorPhrase: "pricing page confused" },
            { personaId: "p-2", uniqueAnchorPhrase: "hides SSO behind a sales call" },
          ],
        },
      ],
      transcripts,
    );
    expect(out.citations).toEqual([
      { personaId: "p-1", personaName: "Sarah Chen", quote: "The pricing page confused me completely." },
      { personaId: "p-2", personaName: "Miguel Torres", quote: "However the enterprise tier hides SSO behind a sales call." },
    ]);
  });

  it("drops locators for unknown personas", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "ghost", uniqueAnchorPhrase: "anything" },
            { personaId: "p-1", uniqueAnchorPhrase: "monthly option" },
          ],
        },
      ],
      transcripts,
    );
    expect(out.citations).toHaveLength(1);
    expect(out.citations![0].personaId).toBe("p-1");
  });

  it("drops locators whose anchor misses the transcript", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "p-1", uniqueAnchorPhrase: "quantum flux capacitor" },
          ],
        },
      ],
      transcripts,
    );
    expect(out.citations).toBeUndefined();
  });

  it("deduplicates identical quotes within one finding", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "p-1", uniqueAnchorPhrase: "pricing page confused" },
            { personaId: "p-1", uniqueAnchorPhrase: "confused me completely" },
          ],
        },
      ],
      transcripts,
    );
    expect(out.citations).toHaveLength(1);
  });

  it("strips evidenceLocators from the output — anchors never leak", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [{ personaId: "p-1", uniqueAnchorPhrase: "pricing page confused" }],
          ...(JSON.parse('{"fabricated":"field"}') as object),
        } as never,
      ],
      transcripts,
    );
    expect(out).not.toHaveProperty("evidenceLocators");
    expect(out).not.toHaveProperty("fabricated");
    expect(out.citations).toHaveLength(1);
  });

  it("keeps finding identity fields intact while grounding", () => {
    const [out] = groundSynthesisCitations(
      [{ ...baseFinding, evidenceLocators: [] }],
      transcripts,
    );
    expect(out.observation).toBe(baseFinding.observation);
    expect(out.evidence).toBe(baseFinding.evidence);
    expect(out.impact).toBe(baseFinding.impact);
    expect(out.confidence).toBe("strongly supported");
    expect(out.affectedPersonaCount).toBe(2);
    expect(out.totalPersonaCount).toBe(2);
  });
});
