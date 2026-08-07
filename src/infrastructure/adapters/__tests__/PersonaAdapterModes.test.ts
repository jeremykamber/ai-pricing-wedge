import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersonaAdapter } from "../PersonaAdapter";
import type { LlmServiceImpl } from "../LlmServiceImpl";
import { GENDERLESS_NAMES } from "@/data/genderless_names";

// Research/strategy generation uses schema-enforced structured output
// (streamText + Output.array), so the `ai` module is mocked here.
const mockStreamText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({
  streamText: mockStreamText,
  Output: { array: vi.fn(() => ({ type: "array" })) },
}));

function createMockLlmService(): any {
  return {
    smallTextModel: "test-model",
    provider: vi.fn(),
    createChatCompletion: vi.fn(),
    createChatCompletionStream: vi.fn(),
  };
}

const researchPersona = [
  {
    name: "Sawyer Miller",
    age: 24,
    occupation: "Junior Backend Engineer",
    educationLevel: "B.S. Computer Science",
    interests: ["automation", "scripting"],
    goals: ["Find backend role", "Reduce job search friction"],
    conscientiousness: 70,
    neuroticism: 40,
    openness: 80,
    extraversion: 30,
    agreeableness: 50,
    values: ["Efficiency", "Transparency"],
    fears: ["Wasted effort", "Outdated postings"],
    communicationStyle: "Direct",
    decisionStyle: "Data-driven",
    pricingSensitivity: 60,
    typicalBudget: "Up to $20/user/month",
    domainExpertise: ["backend engineering", "API design"],
    backstory: "Sawyer recently graduated and values tools that reduce manual effort.",
    behavioralDimensions: [
      { name: "friction-tolerance", score: 85, context: "job search", description: "Low tolerance for unnecessary clicks" },
      { name: "recency-sensitivity", score: 90, context: "job search", description: "Prefers recently posted opportunities" },
    ],
  },
];

const clusterPersonaJson = JSON.stringify([
  {
    name: "Cluster Rep 1",
    age: 28,
    occupation: "Backend Engineer",
    educationLevel: "B.S. Computer Science",
    interests: ["automation", "scripting"],
    goals: ["Reduce friction"],
    conscientiousness: 70,
    neuroticism: 40,
    openness: 80,
    extraversion: 30,
    agreeableness: 50,
    values: ["Efficiency"],
    fears: ["Wasted effort"],
    communicationStyle: "Direct",
    decisionStyle: "Data-driven",
    pricingSensitivity: 60,
    typicalBudget: "",
    domainExpertise: [],
    backstory: "Represents a cluster of friction-averse engineers.",
    clusterInfo: {
      representedCount: 3,
      sourceIds: ["int-1", "int-2"],
    },
  },
]);

/** Makes the mocked streamText resolve with the given persona array. */
function stubStructuredOutput(personas: unknown[], calls = 1): void {
  for (let i = 0; i < calls; i++) {
    mockStreamText.mockReturnValueOnce({ output: Promise.resolve(personas) });
  }
}

describe("PersonaAdapter dual-mode generation", () => {
  beforeEach(() => mockStreamText.mockReset());

  describe("generateResearchPersonas", () => {
    it("generates research-mode personas with provenance tracking", async () => {
      stubStructuredOutput(researchPersona);
      const adapter = new PersonaAdapter(createMockLlmService());

      const personas = await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Junior backend engineer who values automation",
        interviewIds: ["int-1"],
        evidenceThreshold: 0.7,
      });

      expect(personas).toHaveLength(1);
      expect(personas[0].generationMode).toBe("research");
      expect(personas[0].behavioralDimensions).toHaveLength(2);
      expect(personas[0].provenance?.generationMode).toBe("research");
      expect(personas[0].provenance?.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(personas[0].evidenceLinks).toBeDefined();
    })

    it("assigns curated neutral names instead of LLM names, deterministically", async () => {
      stubStructuredOutput(researchPersona); // contains "Sawyer Miller"
      const adapter = new PersonaAdapter(createMockLlmService());

      const personas = await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Junior backend engineer who values automation",
        interviewIds: ["int-1"],
        evidenceThreshold: 0.7,
      });

      expect(personas[0].name).not.toBe("Sawyer Miller");
      expect(GENDERLESS_NAMES).toContain(personas[0].name);
    })

    it("uses evidence-first prompt with no fabricated memories", async () => {
      stubStructuredOutput(researchPersona);
      const adapter = new PersonaAdapter(createMockLlmService());

      await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test user",
      });

      const system = mockStreamText.mock.calls[0][0].system;
      expect(system).toContain("research");
      expect(system).toContain("evidence");
    })

    it("retries once when structured output fails, then succeeds", async () => {
      mockStreamText
        .mockReturnValueOnce({ output: Promise.reject(new Error("No object generated: could not parse the response.")) })
        .mockReturnValueOnce({ output: Promise.resolve(researchPersona) });
      const adapter = new PersonaAdapter(createMockLlmService());

      const personas = await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test",
      });

      expect(personas).toHaveLength(1);
      expect(mockStreamText).toHaveBeenCalledTimes(2);
    })

    it("fails after exhausting retries", async () => {
      mockStreamText
        .mockReturnValueOnce({ output: Promise.reject(new Error("No object generated")) })
        .mockReturnValueOnce({ output: Promise.reject(new Error("No object generated")) });
      const adapter = new PersonaAdapter(createMockLlmService());

      await expect(adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test",
      })).rejects.toThrow("Failed to generate research personas");
      expect(mockStreamText).toHaveBeenCalledTimes(2);
    })

    it("throws on count mismatch after retries", async () => {
      stubStructuredOutput([{ name: "Only" }], 2);
      const adapter = new PersonaAdapter(createMockLlmService());

      await expect(adapter.generateResearchPersonas({
        count: 3,
        personaDescription: "Test",
      })).rejects.toThrow("count mismatch");
      expect(mockStreamText).toHaveBeenCalledTimes(2);
    })
  })

  describe("generateStrategyPersonas", () => {
    it("generates strategy-mode personas with richer backstories", async () => {
      stubStructuredOutput(researchPersona);
      const adapter = new PersonaAdapter(createMockLlmService());

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
        allowSyntheticBackstory: true,
        storytellingLevel: "rich",
      });

      expect(personas).toHaveLength(1);
      expect(personas[0].generationMode).toBe("strategy");
      // Psychographic fields must survive extraction from the LLM response
      expect(personas[0].values).toEqual(["Efficiency", "Transparency"]);
      expect(personas[0].fears).toEqual(["Wasted effort", "Outdated postings"]);
      expect(personas[0].interests).toEqual(["automation", "scripting"]);
    })

    it("enumerates psychographic fields in the system prompt", async () => {
      stubStructuredOutput(researchPersona);
      const adapter = new PersonaAdapter(createMockLlmService());

      await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      const system = mockStreamText.mock.calls[0][0].system;
      expect(system).toContain("values: string[]");
      expect(system).toContain("fears: string[]");
      expect(system).toContain("interests: string[]");
    })

    it("assigns curated neutral names instead of LLM names, deterministically", async () => {
      mockStreamText.mockReturnValue({ output: Promise.resolve(researchPersona) }); // contains "Sawyer Miller"
      const adapter = new PersonaAdapter(createMockLlmService());

      const first = await adapter.generateStrategyPersonas({ count: 1, personaDescription: "Enterprise buyer" });
      const repeat = await adapter.generateStrategyPersonas({ count: 1, personaDescription: "Enterprise buyer" });
      const different = await adapter.generateStrategyPersonas({ count: 1, personaDescription: "Different audience" });

      expect(first[0].name).not.toBe("Sawyer Miller");
      expect(GENDERLESS_NAMES).toContain(first[0].name);
      expect(repeat[0].name).toBe(first[0].name);
      expect(different[0].name).not.toBe(first[0].name);
    })

    it("uses storytelling prompt when rich level set", async () => {
      stubStructuredOutput(researchPersona);
      const adapter = new PersonaAdapter(createMockLlmService());

      await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Test",
        storytellingLevel: "rich",
      });

      const system = mockStreamText.mock.calls[0][0].system;
      expect(system).toContain("story");
    })

    it("retries once when structured output fails, then succeeds", async () => {
      mockStreamText
        .mockReturnValueOnce({ output: Promise.reject(new Error("No object generated: could not parse the response.")) })
        .mockReturnValueOnce({ output: Promise.resolve(researchPersona) });
      const adapter = new PersonaAdapter(createMockLlmService());

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      expect(personas).toHaveLength(1);
      expect(mockStreamText).toHaveBeenCalledTimes(2);
    })
  })

  describe("generateClusterPersonas", () => {
    it("generates cluster-mode personas with cluster info", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockResolvedValue(clusterPersonaJson);
      const adapter = new PersonaAdapter(llmMock);

      const personas = await adapter.generateClusterPersonas({
        count: 1,
        interviewIds: ["int-1", "int-2"],
        clusterLabel: "Efficiency-focused engineers",
        minClusterSize: 3,
      });

      expect(personas).toHaveLength(1);
      expect(personas[0].generationMode).toBe("cluster");
      expect(personas[0].clusterInfo).toBeDefined();
      expect(personas[0].clusterInfo?.representedCount).toBe(3);
      expect(personas[0].clusterInfo?.sourceIds).toContain("int-1");
    })
  })

  describe("applyCounterfactualTest", () => {
    it("returns failing details for synthetic persona attributes", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockResolvedValue(JSON.stringify({
        failingDetails: [
          { detail: "$12 HiredHub subscription story", reason: "Not supported by interview transcript", attribute: "backstory" },
        ],
      }));
      const adapter = new PersonaAdapter(llmMock);

      const result = await adapter.applyCounterfactualTest({
        id: "test-1",
        name: "Test",
        age: 30,
        occupation: "Engineer",
        educationLevel: "BS",
        interests: [],
        goals: [],
        conscientiousness: 50,
        neuroticism: 50,
        openness: 50,
        extraversion: 50,
        agreeableness: 50,
        values: [],
        fears: [],
        communicationStyle: "Direct",
        decisionStyle: "Data-driven",
        pricingSensitivity: 50,
        typicalBudget: "",
        generationMode: "research",
        behavioralDimensions: [],
        provenance: { attributes: [], generationMode: "research", overallConfidence: 0.5 },
        evidenceLinks: [],
        backstory: "I spent $12 on HiredHub",
      });

      expect(result).toHaveLength(1);
      expect(result[0].detail).toContain("HiredHub");
      expect(result[0].attribute).toBe("backstory");
    })
  })
})
