import { describe, it, expect, vi } from "vitest";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import type { CohortSynthesisContent } from "@/domain/entities/ArtifactSynthesis";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import { SynthesizeArtifactResultsUseCase } from "../synthesizeArtifactResults";

function buildResponse(overrides: Partial<PersonaResponse> = {}): PersonaResponse {
  return {
    id: "resp-1",
    personaId: "p-1",
    screenshotBase64: "",
    rawAnalysis: "I opened the pricing page and froze. Nothing made sense to me.",
    overview: "Confused by pricing",
    customerJourney: [],
    researchQuestionAnswer: "",
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    personaProfile: {
      name: "Sarah Chen",
      occupation: "Senior Engineer",
      bigFive: { conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 50, agreeableness: 60 },
      values: [],
      fears: [],
      communicationStyle: "direct",
      decisionStyle: "data-driven",
    },
    ...overrides,
  };
}

const LLM_CONTENT: CohortSynthesisContent = {
  overview: "The cohort struggled with pricing clarity.",
  researchQuestionAnswer: "Pricing opacity blocks conversion.",
  topFindings: [
    {
      observation: "Pricing page stalls most personas",
      evidence: "Two personas froze on the pricing table",
      impact: "Drop-off before trial signup",
      confidence: "strongly supported",
      affectedPersonaCount: 2,
      totalPersonaCount: 2,
      evidenceLocators: [
        { personaId: "p-1", uniqueAnchorPhrase: "opened the pricing page" },
        { personaId: "ghost", uniqueAnchorPhrase: "anything" },
        { personaId: "p-2", uniqueAnchorPhrase: "not present in any transcript" },
      ],
    },
  ],
  disagreements: [
    {
      topic: "Annual vs monthly billing",
      split: [
        { view: "Prefers monthly", personaCount: 1 },
        { view: "Prefers annual", personaCount: 1 },
      ],
      significance: "Medium",
    },
  ],
  biggestFrictions: ["Pricing table without monthly toggle"],
};

function buildPort(overrides: Partial<LlmServicePort> = {}): LlmServicePort {
  return {
    generateCohortSynthesis: vi.fn().mockResolvedValue(LLM_CONTENT),
    ...overrides,
  } as unknown as LlmServicePort;
}

describe("SynthesizeArtifactResultsUseCase", () => {
  const responses = [
    buildResponse({ id: "resp-1", personaId: "p-1" }),
    buildResponse({
      id: "resp-2",
      personaId: "p-2",
      rawAnalysis: "The dashboard was intuitive but the export button was hidden.",
      personaProfile: {
        name: "Miguel Torres",
        occupation: "Data Analyst",
        bigFive: { conscientiousness: 60, neuroticism: 40, openness: 60, extraversion: 60, agreeableness: 50 },
        values: [],
        fears: [],
        communicationStyle: "direct",
        decisionStyle: "data-driven",
      },
    }),
  ];

  it("passes raw monologues (no summarization) to the port", async () => {
    const port = buildPort();
    await new SynthesizeArtifactResultsUseCase(port).execute(responses, "What blocks signup?");

    const [, transcripts] = (port.generateCohortSynthesis as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(transcripts).toEqual([
      { personaId: "p-1", personaName: "Sarah Chen", transcript: responses[0].rawAnalysis },
      { personaId: "p-2", personaName: "Miguel Torres", transcript: responses[1].rawAnalysis },
    ]);
  });

  it("falls back to response id and a placeholder name when profile fields are missing", async () => {
    const bare = [buildResponse({ personaId: undefined, personaProfile: undefined })];
    const port = buildPort();
    await new SynthesizeArtifactResultsUseCase(port).execute(bare, "q");

    const [, transcripts] = (port.generateCohortSynthesis as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(transcripts[0].personaId).toBe("resp-1");
    expect(transcripts[0].personaName).toBe("Unnamed persona");
  });

  it("grounds citations: quote is verbatim substring of the persona transcript", async () => {
    const synthesis = await new SynthesizeArtifactResultsUseCase(buildPort()).execute(
      responses,
      "What blocks signup?",
    );

    const [finding] = synthesis.topFindings;
    expect(finding.citations).toHaveLength(1); // ghost + miss dropped
    const citation = finding.citations![0];
    expect(citation.personaId).toBe("p-1");
    expect(citation.personaName).toBe("Sarah Chen");
    expect(responses[0].rawAnalysis).toContain(citation.quote);
  });

  it("drops citations entirely (no placeholder) when every locator misses", async () => {
    const port = buildPort({
      generateCohortSynthesis: vi.fn().mockResolvedValue({
        ...LLM_CONTENT,
        topFindings: [
          { ...LLM_CONTENT.topFindings[0], evidenceLocators: [{ personaId: "p-1", uniqueAnchorPhrase: "zzz no such phrase zzz" }] },
        ],
      }),
    });
    const synthesis = await new SynthesizeArtifactResultsUseCase(port).execute(responses, "q");

    expect(synthesis.topFindings[0].citations).toBeUndefined();
  });

  it("never emits [cite-N] markers or locator fields into user data", async () => {
    const synthesis = await new SynthesizeArtifactResultsUseCase(buildPort()).execute(responses, "q");
    const json = JSON.stringify(synthesis);
    expect(json).not.toContain("evidenceLocators");
    expect(json).not.toContain("[cite-");
  });

  it("propagates LLM failure — throw-on-failure is the caller's aggregation point", async () => {
    const port = buildPort({
      generateCohortSynthesis: vi.fn().mockRejectedValue(new Error("LLM down")),
    });
    await expect(
      new SynthesizeArtifactResultsUseCase(port).execute(responses, "q"),
    ).rejects.toThrow("LLM down");
  });

  it("attaches caller-known counts, never LLM-fabricated ones", async () => {
    const synthesis = await new SynthesizeArtifactResultsUseCase(buildPort()).execute(
      responses,
      "q",
      { failedCount: 1, totalPersonaCount: 3 },
    );
    expect(synthesis.completedCount).toBe(2);
    expect(synthesis.failedCount).toBe(1);
    expect(synthesis.totalPersonaCount).toBe(3);
  });

  it("defaults counts when caller omits them", async () => {
    const synthesis = await new SynthesizeArtifactResultsUseCase(buildPort()).execute(responses, "q");
    expect(synthesis.completedCount).toBe(2);
    expect(synthesis.failedCount).toBe(0);
    expect(synthesis.totalPersonaCount).toBe(2);
  });

  it("passes runId through to the port", async () => {
    const port = buildPort();
    await new SynthesizeArtifactResultsUseCase(port).execute(responses, "q", { runId: "run-9" });
    const [, , options] = (port.generateCohortSynthesis as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options).toMatchObject({ runId: "run-9" });
  });

  it("carries LLM content fields through untouched (overview, disagreements, frictions)", async () => {
    const synthesis = await new SynthesizeArtifactResultsUseCase(buildPort()).execute(responses, "q");
    expect(synthesis.overview).toBe(LLM_CONTENT.overview);
    expect(synthesis.researchQuestionAnswer).toBe(LLM_CONTENT.researchQuestionAnswer);
    expect(synthesis.disagreements).toEqual(LLM_CONTENT.disagreements);
    expect(synthesis.biggestFrictions).toEqual(LLM_CONTENT.biggestFrictions);
  });
});
