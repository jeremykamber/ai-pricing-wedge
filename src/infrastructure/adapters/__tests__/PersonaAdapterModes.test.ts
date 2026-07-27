import { describe, it, expect, vi } from "vitest";
import { PersonaAdapter } from "../PersonaAdapter";
import type { LlmServiceImpl } from "../LlmServiceImpl";

function createMockLlmService(): any {
  return {
    smallTextModel: "test-model",
    provider: vi.fn(),
    createChatCompletion: vi.fn(),
    createChatCompletionStream: vi.fn(),
  };
}

const researchPersonaJson = JSON.stringify([
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
]);

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

describe("PersonaAdapter dual-mode generation", () => {
  describe("generateResearchPersonas", () => {
    it("generates research-mode personas with provenance tracking", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockResolvedValue(researchPersonaJson);
      const adapter = new PersonaAdapter(llmMock);

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

    it("uses evidence-first prompt with no fabricated memories", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockResolvedValue(researchPersonaJson);
      const adapter = new PersonaAdapter(llmMock);

      await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test user",
      });

      const prompt = llmMock.createChatCompletion.mock.calls[0][0][0].content;
      expect(prompt).toContain("research");
      expect(prompt).toContain("evidence");
    })

    it("handles LLM failure gracefully", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockRejectedValue(new Error("LLM error"));
      const adapter = new PersonaAdapter(llmMock);

      await expect(adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test",
      })).rejects.toThrow("Failed to generate research personas");
    })

    it("throws on count mismatch", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockResolvedValue(JSON.stringify([{ name: "Only" }]));
      const adapter = new PersonaAdapter(llmMock);

      await expect(adapter.generateResearchPersonas({
        count: 3,
        personaDescription: "Test",
      })).rejects.toThrow("count mismatch");
    })

    it("throws on non-array response", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockResolvedValue(JSON.stringify({ name: "Object" }));
      const adapter = new PersonaAdapter(llmMock);

      await expect(adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test",
      })).rejects.toThrow("research personas");
    })
  })

  describe("generateStrategyPersonas", () => {
    it("generates strategy-mode personas with richer backstories", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockResolvedValue(researchPersonaJson);
      const adapter = new PersonaAdapter(llmMock);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
        allowSyntheticBackstory: true,
        storytellingLevel: "rich",
      });

      expect(personas).toHaveLength(1);
      expect(personas[0].generationMode).toBe("strategy");
    })

    it("uses storytelling prompt when rich level set", async () => {
      const llmMock = createMockLlmService();
      llmMock.createChatCompletion.mockResolvedValue(researchPersonaJson);
      const adapter = new PersonaAdapter(llmMock);

      await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Test",
        storytellingLevel: "rich",
      });

      const prompt = llmMock.createChatCompletion.mock.calls[0][0][0].content;
      expect(prompt).toContain("story");
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
