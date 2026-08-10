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
    provider: { chat: vi.fn() }, // provider.chat() → Chat Completions endpoint
    createChatCompletion: vi.fn(),
    createChatCompletionStream: vi.fn(),
  };
}

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
    // Profile-phase fixture: evidence fields kept, no id/name/backstory.
    const researchProfile = [
      {
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
        valueEvidence: ["Efficiency is core to their workflow", "Transparency builds trust"],
        fears: ["Wasted effort", "Outdated postings"],
        fearEvidence: ["Wasted effort frustrates them", "Outdated postings waste time"],
        communicationStyle: "Direct",
        decisionStyle: "Data-driven",
        pricingSensitivity: 60,
        typicalBudget: "Up to $20/user/month",
        domainExpertise: ["backend engineering", "API design"],
        bestFor: ["Predicting tool adoption decisions"],
        lessReliableFor: ["Predicting enterprise procurement"],
        identityContext: "Values efficiency and transparency across domains",
        situationContext: "Focused on reducing job-search friction",
        evidenceLinks: [
          { transcriptId: "interview-0", excerpt: "Efficiency is core to their workflow", attribute: "values" },
        ],
        behavioralDimensions: [
          { name: "friction-tolerance", score: 85, context: "job search", description: "Low tolerance for unnecessary clicks", evidence: "quotes from the interview" },
          { name: "recency-sensitivity", score: 90, context: "job search", description: "Prefers recently posted opportunities", evidence: "quotes from the interview" },
        ],
      },
    ];

    function mockBackstories(llm: any, stories: string[] = ["Sawyer's story."]): void {
      for (const story of stories) {
        llm.createChatCompletion.mockResolvedValueOnce(story);
      }
    }

    it("runs phased: one profile batch call, then a per-persona backstory call", async () => {
      stubStructuredOutput(researchProfile);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Junior backend engineer who values automation",
        interviewIds: ["int-1"],
        evidenceThreshold: 0.7,
      });

      expect(personas).toHaveLength(1);
      expect(mockStreamText).toHaveBeenCalledTimes(1); // profiles only
      expect(llm.createChatCompletion).toHaveBeenCalledTimes(1); // backstory
      expect(personas[0].generationMode).toBe("research");
      expect(personas[0].backstory).toBe("Sawyer's story.");
      expect(personas[0].behavioralDimensions).toHaveLength(2);
      expect(personas[0].provenance?.generationMode).toBe("research");
      expect(personas[0].provenance?.overallConfidence).toBeGreaterThanOrEqual(0);
      // LLM-provided evidence links pass through
      expect(personas[0].evidenceLinks?.[0]?.transcriptId).toBe("interview-0");
    })

    it("assigns curated neutral names instead of LLM names, deterministically", async () => {
      mockStreamText.mockReturnValue({ output: Promise.resolve(researchProfile) });
      const llm = createMockLlmService();
      llm.createChatCompletion.mockResolvedValue("Story.");
      const adapter = new PersonaAdapter(llm);

      const first = await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Junior backend engineer who values automation",
        interviewIds: ["int-1"],
      });
      const repeat = await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Junior backend engineer who values automation",
        interviewIds: ["int-1"],
      });

      expect(GENDERLESS_NAMES).toContain(first[0].name);
      expect(repeat[0].name).toBe(first[0].name);
    })

    it("uses evidence-first prompts with no fabricated memories", async () => {
      stubStructuredOutput(researchProfile);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test user",
        interviewIds: ["int-1"],
      });

      const profileSystem = mockStreamText.mock.calls[0][0].system;
      expect(profileSystem).toContain("research");
      expect(profileSystem).toContain("evidence");
      // The backstory call inherits the no-fabrication contract
      const backstorySystem = llm.createChatCompletion.mock.calls[0][0][0].content as string;
      expect(backstorySystem).toContain("NOT fabricate");
      expect(backstorySystem).toContain("evidence");
    })

    it("falls back to interview-derived evidence links when the LLM omits them", async () => {
      const noLinks = [{
        ...researchProfile[0],
        evidenceLinks: undefined,
      }];
      stubStructuredOutput(noLinks);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test user",
        interviewIds: ["int-1", "int-2"],
      });

      expect(personas[0].evidenceLinks?.map((l) => l.transcriptId)).toEqual(["int-1", "int-2"]);
    })

    it("retries once when structured output fails, then succeeds", async () => {
      mockStreamText
        .mockReturnValueOnce({ output: Promise.reject(new Error("No object generated: could not parse the response.")) })
        .mockReturnValueOnce({ output: Promise.resolve(researchProfile) });
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

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
      })).rejects.toThrow("No object generated");
      expect(mockStreamText).toHaveBeenCalledTimes(2);
    })

    it("throws on count mismatch after retries", async () => {
      stubStructuredOutput([{ age: 30 }], 2);
      const adapter = new PersonaAdapter(createMockLlmService());

      await expect(adapter.generateResearchPersonas({
        count: 3,
        personaDescription: "Test",
      })).rejects.toThrow("count mismatch");
      expect(mockStreamText).toHaveBeenCalledTimes(2);
    })

    it("fails the whole run loudly, naming the persona, when a backstory call exhausts retries", async () => {
      stubStructuredOutput(researchProfile);
      const llm = createMockLlmService();
      llm.createChatCompletion.mockRejectedValue(new Error("provider down"));
      const adapter = new PersonaAdapter(llm);

      await expect(adapter.generateResearchPersonas({
        count: 1,
        personaDescription: "Test user",
      })).rejects.toThrow(/Failed to generate backstory for persona/);
      expect(llm.createChatCompletion).toHaveBeenCalledTimes(2);
    })

    it("reports phase progress via onPhase", async () => {
      stubStructuredOutput(researchProfile);
      const llm = createMockLlmService();
      llm.createChatCompletion.mockResolvedValue("Story.");
      const adapter = new PersonaAdapter(llm);
      const phases: string[] = [];

      await adapter.generateResearchPersonas(
        { count: 1, personaDescription: "Test user" },
        (phase) => phases.push(phase),
      );

      expect(phases).toEqual(["profiles", "profiles", "backstories", "backstories"]); // start + done per phase
    })
  })

  describe("generateStrategyPersonas", () => {
    // Profile-phase fixture: matches the omitted profile schema (no id/name/backstory).
    const strategyProfile = [
      {
        age: 34,
        occupation: "VP Product",
        educationLevel: "MBA",
        interests: ["sailing", "podcasts"],
        goals: ["Ship a pricing engine", "Cut churn"],
        conscientiousness: 80,
        neuroticism: 45,
        openness: 70,
        extraversion: 55,
        agreeableness: 60,
        values: ["Autonomy", "Evidence"],
        valueEvidence: ["They asked for full autonomy over the roadmap", "Decisions must cite numbers"],
        fears: ["Micromanagement", "Churn spikes"],
        fearEvidence: ["Being overridden by investors worries them", "A churn spike would end the runway"],
        communicationStyle: "Analytical",
        decisionStyle: "Data-driven",
        domainExpertise: ["pricing", "PLG"],
        bestFor: ["Predicting pricing-package adoption"],
        lessReliableFor: ["Predicting enterprise procurement cycles"],
        identityContext: "Autonomous, evidence-driven operator across domains",
        situationContext: "Under runway pressure, favors quick experiments",
        evidenceLinks: [
          { transcriptId: "user-input", excerpt: "full autonomy over the roadmap", attribute: "values" },
        ],
        behavioralDimensions: [
          { name: "risk-tolerance", score: 70, context: "pricing changes", description: "Willing to experiment with packaging", evidence: "they run pricing experiments quarterly" },
          { name: "evidence-need", score: 90, context: "tool adoption", description: "Requires benchmarks before committing", evidence: "decisions must cite numbers" },
          { name: "speed-bias", score: 75, context: "ship velocity", description: "Prefers shipping fast over perfect", evidence: "favors quick experiments" },
        ],
      },
    ];

    function mockBackstories(llm: any, stories: string[] = ["Jordan's life story."]): void {
      for (const story of stories) {
        llm.createChatCompletion.mockResolvedValueOnce(story);
      }
    }

    it("runs phased: one profile batch call, then a per-persona backstory call", async () => {
      stubStructuredOutput(strategyProfile);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
        allowSyntheticBackstory: true,
        storytellingLevel: "rich",
      });

      expect(personas).toHaveLength(1);
      expect(mockStreamText).toHaveBeenCalledTimes(1); // profiles only
      expect(llm.createChatCompletion).toHaveBeenCalledTimes(1); // backstory
      expect(personas[0].generationMode).toBe("strategy");
      expect(personas[0].backstory).toBe("Jordan's life story.");
      // Psychographic fields must survive extraction from the profile response
      expect(personas[0].values).toEqual(["Autonomy", "Evidence"]);
      expect(personas[0].fears).toEqual(["Micromanagement", "Churn spikes"]);
      expect(personas[0].interests).toEqual(["sailing", "podcasts"]);
      expect(personas[0].behavioralDimensions).toHaveLength(3);
    })

    it("maps the evidence fields through from the profile response", async () => {
      stubStructuredOutput(strategyProfile);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      expect(personas[0].valueEvidence).toEqual(["They asked for full autonomy over the roadmap", "Decisions must cite numbers"]);
      expect(personas[0].fearEvidence).toEqual(["Being overridden by investors worries them", "A churn spike would end the runway"]);
      expect(personas[0].bestFor).toEqual(["Predicting pricing-package adoption"]);
      expect(personas[0].lessReliableFor).toEqual(["Predicting enterprise procurement cycles"]);
      expect(personas[0].identityContext).toBe("Autonomous, evidence-driven operator across domains");
      expect(personas[0].situationContext).toBe("Under runway pressure, favors quick experiments");
      expect(personas[0].evidenceLinks).toEqual([
        { transcriptId: "user-input", excerpt: "full autonomy over the roadmap", attribute: "values" },
      ]);
    })

    it("derives per-attribute provenance and a computed overall confidence", async () => {
      stubStructuredOutput(strategyProfile);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      const attrs = personas[0].provenance?.attributes ?? [];
      // Dimensions with evidence quotes are observed/0.9, not blanket 0.7
      expect(attrs).toContainEqual({ attribute: "evidence-need", tier: "observed", confidence: 0.9, evidence: "decisions must cite numbers" });
      // 3 evidence dims pull the computed mean to 0.8: (0.7*3 + 0.5 + 0.9*3) / 7
      expect(personas[0].provenance?.overallConfidence).toBe(0.8);
    })

    it("marks dimensions without evidence as interpreted with lower confidence", async () => {
      const dimlessEvidence = [{
        ...strategyProfile[0],
        behavioralDimensions: [
          { name: "gut-call", score: 60, context: "hiring", description: "Decides on instinct", evidence: undefined },
        ],
      }];
      stubStructuredOutput(dimlessEvidence);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      const attrs = personas[0].provenance?.attributes ?? [];
      expect(attrs).toContainEqual({ attribute: "gut-call", tier: "interpreted", confidence: 0.6, evidence: undefined });
      // Overall reflects the lower per-attribute confidence, not a blanket value
      expect(personas[0].provenance?.overallConfidence).not.toBe(0.7);
    })

    it("enumerates psychographic fields in the profile prompt, with no backstory", async () => {
      stubStructuredOutput(strategyProfile);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      const system = mockStreamText.mock.calls[0][0].system;
      expect(system).toContain("values: string[]");
      expect(system).toContain("fears: string[]");
      expect(system).toContain("interests: string[]");
      expect(system).not.toContain("backstory");
      // Evidence contract is enumerated so the LLM fills it
      expect(system).toContain("valueEvidence: string[]");
      expect(system).toContain("evidenceLinks");
      expect(system).toContain("bestFor: string[]");
      // Distinctness rule: no quote reused across values/fears
      expect(system).toContain("DISTINCT");
    })

    it("retries the profile batch when evidence quotes are duplicated across values", async () => {
      const duplicated = [{
        ...strategyProfile[0],
        values: ["Autonomy", "Evidence", "Speed"],
        valueEvidence: ["the same quote", "a different quote", "the same quote"],
      }];
      mockStreamText
        .mockReturnValueOnce({ output: Promise.resolve(duplicated) })
        .mockReturnValueOnce({ output: Promise.resolve(strategyProfile) });
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      expect(personas).toHaveLength(1);
      expect(mockStreamText).toHaveBeenCalledTimes(2);
      // The retry nudge tells the model quotes must be distinct
      expect(mockStreamText.mock.calls[1][0].prompt).toContain("DISTINCT");
    })

    it("assigns curated neutral names instead of LLM names, deterministically", async () => {
      mockStreamText.mockReturnValue({ output: Promise.resolve(strategyProfile) });
      const llm = createMockLlmService();
      llm.createChatCompletion.mockResolvedValue("Backstory text.");
      const adapter = new PersonaAdapter(llm);

      const first = await adapter.generateStrategyPersonas({ count: 1, personaDescription: "Enterprise buyer" });
      const repeat = await adapter.generateStrategyPersonas({ count: 1, personaDescription: "Enterprise buyer" });
      const different = await adapter.generateStrategyPersonas({ count: 1, personaDescription: "Different audience" });

      expect(GENDERLESS_NAMES).toContain(first[0].name);
      expect(repeat[0].name).toBe(first[0].name);
      expect(different[0].name).not.toBe(first[0].name);
    })

    it("writes named third-person backstories, honoring the storytelling level", async () => {
      stubStructuredOutput(strategyProfile);
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
        storytellingLevel: "rich",
      });

      const [system, user] = llm.createChatCompletion.mock.calls[0][0] as { role: string; content: string }[];
      expect(system.content).toContain(personas[0].name);
      expect(system.content).toContain("THIRD PERSON");
      expect(system.content).toContain("Storytelling level: rich");
      expect(user.content).toContain(personas[0].name); // profile JSON includes the assigned name
      // Reasoning is disabled on the backstory call — CoT burns budget and can return empty output
      expect(llm.createChatCompletion.mock.calls[0][1].disableReasoning).toBe(true);
    })

    it("retries the profile batch once when structured output fails, then succeeds", async () => {
      mockStreamText
        .mockReturnValueOnce({ output: Promise.reject(new Error("No object generated: could not parse the response.")) })
        .mockReturnValueOnce({ output: Promise.resolve(strategyProfile) });
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      expect(personas).toHaveLength(1);
      expect(mockStreamText).toHaveBeenCalledTimes(2);
    })

    it("retries the profile batch when required fields are missing, then succeeds", async () => {
      const hollow = [{ age: 34, occupation: "VP Product" }]; // missing values/fears/etc.
      mockStreamText
        .mockReturnValueOnce({ output: Promise.resolve(hollow) })
        .mockReturnValueOnce({ output: Promise.resolve(strategyProfile) });
      const llm = createMockLlmService();
      mockBackstories(llm);
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      expect(personas).toHaveLength(1);
      expect(mockStreamText).toHaveBeenCalledTimes(2);
      // The retry nudge names the missing fields in the prompt
      expect(mockStreamText.mock.calls[1][0].prompt).toContain("behavioralDimensions");
      expect(mockStreamText.mock.calls[1][0].prompt).toContain("valueEvidence"); // evidence contract is enforced too
    })

    it("retries a backstory call once, then succeeds", async () => {
      stubStructuredOutput(strategyProfile);
      const llm = createMockLlmService();
      llm.createChatCompletion
        .mockRejectedValueOnce(new Error("provider timeout"))
        .mockResolvedValueOnce("Recovered story.");
      const adapter = new PersonaAdapter(llm);

      const personas = await adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      expect(personas[0].backstory).toBe("Recovered story.");
      expect(llm.createChatCompletion).toHaveBeenCalledTimes(2);
    })

    it("fails the whole run loudly, naming the persona, when a backstory call exhausts retries", async () => {
      stubStructuredOutput(strategyProfile);
      const llm = createMockLlmService();
      llm.createChatCompletion.mockRejectedValue(new Error("provider down"));
      const adapter = new PersonaAdapter(llm);

      const promise = adapter.generateStrategyPersonas({
        count: 1,
        personaDescription: "Enterprise buyer",
      });

      await expect(promise).rejects.toThrow(/Failed to generate backstory for persona/);
      expect(llm.createChatCompletion).toHaveBeenCalledTimes(2);
    })

    it("reports phase progress via onPhase", async () => {
      stubStructuredOutput(strategyProfile);
      const llm = createMockLlmService();
      llm.createChatCompletion.mockResolvedValue("Story.");
      const adapter = new PersonaAdapter(llm);
      const phases: string[] = [];
      const progress: { completed: number; total: number; personaName?: string }[] = [];

      await adapter.generateStrategyPersonas(
        { count: 1, personaDescription: "Enterprise buyer" },
        (phase, p) => {
          phases.push(phase);
          if (p) progress.push(p);
        },
      );

      expect(phases).toEqual(["profiles", "profiles", "backstories", "backstories"]); // start + done per phase
      expect(progress[0]).toEqual({ completed: 0, total: 1 }); // profiles start
      expect(progress[1]).toEqual({ completed: 1, total: 1 }); // profiles done
      expect(progress[2]).toEqual({ completed: 0, total: 1 }); // backstories start
      expect(progress[3]).toEqual({ completed: 1, total: 1, personaName: expect.any(String) }); // backstory done
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
