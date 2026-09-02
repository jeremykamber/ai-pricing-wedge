import { describe, it, expect, vi, beforeEach } from "vitest";
import { InterviewSignalExtractor } from "../InterviewSignalExtractor";
import type { ExtractedInterviewSignals } from "@/application/interviewPipeline/types";

const validMockResponse: ExtractedInterviewSignals = {
  interviewId: "unused",
  painPoints: [
    { text: "Slow onboarding process", quote: "It took me 3 days just to get access", sourceSegmentId: "seg-1" },
  ],
  goals: [
    { text: "Automate reporting", quote: "I wish I could auto-generate these reports", sourceSegmentId: "seg-2" },
  ],
  values: [
    { text: "Data privacy", quote: "Security is non-negotiable for us", sourceSegmentId: "seg-3" },
  ],
  featureDesires: [
    { text: "Dark mode", quote: "I really need a dark mode option", sourceSegmentId: "seg-4" },
  ],
  decisionPatterns: [
    { text: "Trial-first evaluation", quote: "We always do a 2-week trial before buying", sourceSegmentId: "seg-5" },
  ],
  context: {
    role: "Engineering Manager",
    industry: "SaaS",
    teamSize: "12 people",
  },
  communicationStyle: "Direct and analytical",
  salientQuotes: ["Security is non-negotiable for us", "Time is our most precious resource"],
};

describe("InterviewSignalExtractor", () => {
  let mockLlmService: any;
  let extractor: InterviewSignalExtractor;

  beforeEach(() => {
    mockLlmService = {
      createChatCompletion: vi.fn(),
    };
    extractor = new InterviewSignalExtractor(mockLlmService);
  });

  it("extracts all signal types from realistic transcript", async () => {
    const testInterviewId = "int-001";
    mockLlmService.createChatCompletion.mockResolvedValue(
      JSON.stringify(validMockResponse)
    );

    const result = await extractor.extract("Sample transcript...", testInterviewId);

    expect(mockLlmService.createChatCompletion).toHaveBeenCalledOnce();
    expect(result.interviewId).toBe(testInterviewId);
    expect(result.painPoints.length).toBe(1);
    expect(result.goals.length).toBe(1);
    expect(result.values.length).toBe(1);
    expect(result.featureDesires.length).toBe(1);
    expect(result.decisionPatterns.length).toBe(1);
    expect(result.context?.role).toBe("Engineering Manager");
    expect(result.context?.industry).toBe("SaaS");
    expect(result.context?.teamSize).toBe("12 people");
    expect(result.communicationStyle).toBe("Direct and analytical");
    expect(result.salientQuotes).toEqual(["Security is non-negotiable for us", "Time is our most precious resource"]);
  });

  it("handles malformed JSON response gracefully", async () => {
    mockLlmService.createChatCompletion.mockResolvedValue(
      "Sorry, I cannot process that request. Here's some text instead of JSON."
    );

    await expect(
      extractor.extract("Sample transcript", "int-002")
    ).rejects.toThrow("Failed to parse interview signals from LLM response");
  });

  it("handles empty transcript with mock returning all empty arrays", async () => {
    const emptyResponse = {
      painPoints: [],
      goals: [],
      values: [],
      featureDesires: [],
      decisionPatterns: [],
      context: { role: "", industry: "", teamSize: "" },
      communicationStyle: "",
      salientQuotes: [],
    };

    mockLlmService.createChatCompletion.mockResolvedValue(JSON.stringify(emptyResponse));

    const result = await extractor.extract("Empty or irrelevant transcript", "int-003");

    expect(result.interviewId).toBe("int-003");
    expect(result.painPoints).toEqual([]);
    expect(result.goals).toEqual([]);
    expect(result.values).toEqual([]);
    expect(result.featureDesires).toEqual([]);
    expect(result.decisionPatterns).toEqual([]);
    expect(result.salientQuotes).toEqual([]);
    expect(result.communicationStyle).toBe("");
  });

  it("handles partial fields gracefully (missing some fields in JSON)", async () => {
    const partialResponse = {
      goals: [{ text: "Reduce costs", quote: "We need to cut expenses" }],
      salientQuotes: "this should be an array but isn't",
    };

    mockLlmService.createChatCompletion.mockResolvedValue(JSON.stringify(partialResponse));

    const result = await extractor.extract("Partial transcript", "int-004");

    expect(result.goals.length).toBe(1);
    expect(result.goals[0].text).toBe("Reduce costs");
    expect(result.goals[0].quote).toBe("We need to cut expenses");
    expect(result.goals[0].sourceSegmentId).toBe("");
    expect(result.painPoints).toEqual([]);
    expect(result.values).toEqual([]);
    expect(result.featureDesires).toEqual([]);
    expect(result.decisionPatterns).toEqual([]);
    expect(result.context?.role).toBe("");
    expect(result.context?.industry).toBe("");
    expect(result.context?.teamSize).toBe("");
    expect(result.communicationStyle).toBe("");
    expect(result.salientQuotes).toEqual([]);
  });

  it("verifies verbatim quotes are preserved correctly", async () => {
    const quotesResponse = {
      painPoints: [
        { text: "Integration frustration", quote: "The API docs were completely out of date", sourceSegmentId: "s1" },
        { text: "Billing confusion", quote: "I had no idea these overages would cost so much", sourceSegmentId: "s2" },
      ],
      goals: [
        { text: "Better visibility", quote: "Give me a dashboard that shows everything at a glance", sourceSegmentId: "s3" },
      ],
    };

    mockLlmService.createChatCompletion.mockResolvedValue(JSON.stringify(quotesResponse));

    const result = await extractor.extract("Quote-rich transcript", "int-005");

    expect(result.painPoints[0].quote).toBe("The API docs were completely out of date");
    expect(result.painPoints[1].quote).toBe("I had no idea these overages would cost so much");
    expect(result.goals[0].quote).toBe("Give me a dashboard that shows everything at a glance");
    expect(result.painPoints[0].text).toBe("Integration frustration");
    expect(result.painPoints[0].sourceSegmentId).toBe("s1");
  });

  it("handles code-fenced JSON responses (with stripCodeFence)", async () => {
    const codeFencedResponse = `\`\`\`json
{
  "painPoints": [{ "text": "Test", "quote": "Test quote", "sourceSegmentId": "s1" }],
  "goals": [],
  "values": [],
  "featureDesires": [],
  "decisionPatterns": [],
  "context": { "role": "Tester" },
  "communicationStyle": "Concise",
  "salientQuotes": ["Test quote"]
}
\`\`\``;

    mockLlmService.createChatCompletion.mockResolvedValue(codeFencedResponse);

    const result = await extractor.extract("Anything", "int-006");

    expect(result.painPoints.length).toBe(1);
    expect(result.painPoints[0].quote).toBe("Test quote");
    expect(result.context?.role).toBe("Tester");
  });

  it("passes response_format: json_object option to LLM", async () => {
    mockLlmService.createChatCompletion.mockResolvedValue(
      JSON.stringify({ ...validMockResponse, interviewId: "x" })
    );

    await extractor.extract("Test transcript", "int-007");

    const callArgs = mockLlmService.createChatCompletion.mock.calls[0];
    const options = callArgs[1];

    expect(options.response_format).toEqual({ type: "json_object" });
    expect(options.purpose).toBe("Extract Interview Signals");
  });
});
