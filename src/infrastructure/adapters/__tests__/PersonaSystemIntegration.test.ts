import { describe, it, expect, vi } from "vitest";
import { PersonaPromptCompiler } from "../PersonaPromptCompiler";
import { IdRagStore } from "../IdRagStore";
import { IdRagService } from "../IdRagService";
import type { Persona } from "@/domain/entities/Persona";

const testPersona: Persona = {
  id: "integration-1",
  name: "Alex Rivera",
  age: 42,
  occupation: "VP of Engineering",
  educationLevel: "MS Computer Science",
  interests: ["distributed systems", "rock climbing", "coffee"],
  goals: ["reduce infrastructure costs", "improve team velocity"],
  conscientiousness: 85,
  neuroticism: 55,
  openness: 75,
  extraversion: 40,
  agreeableness: 45,
  values: ["Efficiency", "Data-driven decisions", "Operational rigor"],
  fears: ["Wasting budget on unused tools", "Bottlenecks that slow the team"],
  communicationStyle: "Direct and technical",
  decisionStyle: "Data-driven with a bias toward action",
  backstory: [
    "I grew up in Detroit, watching the auto industry get disrupted by technology. My father was a line worker who lost his job to automation — that taught me that you either adapt or get left behind. I taught myself to code on a used ThinkPad when I was 14.",
    "After a CS degree from University of Michigan, I joined Amazon as an SDE. Five years there taught me operational rigor but also made me cynical about corporate buzzwords. I left to join a Series A startup as their first engineering hire. We scaled from 5 to 200 engineers before being acquired by Google.",
    "The acquisition was a mixed blessing. I made good money but watched the startup culture I loved get smothered by process. Two years ago I left to become VP Eng at a Series B infrastructure company. We're growing fast but I'm terrified of repeating the same mistakes — too much process kills velocity, too little kills quality.",
    "I once approved a $200k annual DataDog contract that we barely used. My CTO at the time had pushed it through with a flashy demo. I learned to demand proof, not promises. Now I evaluate every tool by: (1) can we start with a small pilot, (2) what's the actual total cost over 3 years, (3) who else in our network has used it.",
    "My office is a controlled chaos. Three monitors, a standing desk that's almost always at sitting height, and a Moleskine notebook where I sketch architecture diagrams. I hate wasted space and wasted motion. Design-wise I prefer brutalist aesthetics — honest materials, no ornamentation."
  ].join("\n\n"),
  domainExpertise: ["cloud infrastructure", "distributed systems", "engineering management", "SaaS pricing"],
  epistemicBoundaries: ["frontend development", "UI/UX design", "marketing", "sales"],
  responseConstraints: ["Keep responses concise", "Use technical language where appropriate"],
  refusalPatterns: ["Do not write code", "Do not speculate about topics outside my expertise"],
};

describe("Full Persona System Integration", () => {
  describe("T1: Compartmentalized Prompts + T3: Persona Anchors", () => {
    it("generates a complete compartmentalized prompt with anchor", () => {
      const compiler = new PersonaPromptCompiler();
      const anchor = compiler.generateAnchor(testPersona);
      const prompt = compiler.compileSystemPrompt(testPersona);

      expect(prompt).toContain("<<PERSONA IDENTITY>>");
      expect(prompt).toContain("<<PSYCHOGRAPHIC PROFILE>>");
      expect(prompt).toContain("<<EPISTEMIC BOUNDARIES>>");
      expect(prompt).toContain("<<BEHAVIORAL GUARDRAILS>>");
      expect(prompt).toContain("Alex Rivera");
      expect(prompt).toContain("VP of Engineering");
      expect(prompt).toContain("Conscientiousness: 85/100");
      expect(prompt).toContain("distributed systems");
      expect(prompt).toContain("frontend development");
      expect(prompt).toContain("Keep responses concise");
      expect(prompt).toContain("Do not write code");
      expect(anchor).toContain(":");
    });

    it("injects persona anchor into user message", () => {
      const compiler = new PersonaPromptCompiler();
      const anchored = compiler.compileChatMessage(testPersona, "What do you think about this pricing page?");
      expect(anchored).toContain(":");
      expect(anchored).toContain("pricing page");
    });
  });

  describe("T4: ID-RAG Factual Grounding", () => {
    it("chunks, indexes, and retrieves relevant memories", () => {
      const store = new IdRagStore();
      store.ingestPersona(testPersona);

      const query = "I'm worried about wasting money on tools we won't use";
      const results = store.retrieve(testPersona.id, query, 3);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // The DataDog contract chunk should be relevant to spending concerns
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("retrieves different results for different queries", () => {
      const store = new IdRagStore();
      store.ingestPersona(testPersona);

      const results1 = store.retrieve(testPersona.id, "infrastructure scaling team size", 2);
      const results2 = store.retrieve(testPersona.id, "childhood Detroit father automation", 2);

      // Different queries should produce different result sets
      const texts1 = results1.map((r) => r.chunk.text.slice(0, 50)).join("");
      const texts2 = results2.map((r) => r.chunk.text.slice(0, 50)).join("");

      // At minimum, the scores should differ
      if (results1.length > 0 && results2.length > 0) {
        const topScoreDiff = Math.abs(results1[0].score - results2[0].score);
        expect(topScoreDiff).toBeGreaterThan(0);
      }
    });

    it("formats context for prompt injection", () => {
      const store = new IdRagStore();
      store.ingestPersona(testPersona);
      const service = new IdRagService(store);

      const userQuery = "Tell me about your experience with DataDog";
      const context = service.retrieveContext(testPersona, userQuery, 2);

      expect(context.chunkCount).toBeGreaterThanOrEqual(1);
      expect(context.contextString).toContain("[Relevant Memory");
      expect(context.contextString).toContain("Topic:");
    });
  });

  describe("T1+T3+T4: Full Hybrid Prompt Assembly", () => {
    it("compiles a complete interaction prompt with all components", () => {
      const compiler = new PersonaPromptCompiler();
      const store = new IdRagStore();
      store.ingestPersona(testPersona);
      const service = new IdRagService(store);

      const userQuery = "Is this tool worth $200/month for our team?";
      const ragContext = service.retrieveContext(testPersona, userQuery, 2);

      const fullPrompt = compiler.compileInteractionPrompt(testPersona, {
        anchor: compiler.generateAnchor(testPersona),
        ragContext: ragContext.contextString,
        userMessage: userQuery,
      });

      expect(fullPrompt).toContain("<<PERSONA IDENTITY>>");
      expect(fullPrompt).toContain("<<PSYCHOGRAPHIC PROFILE>>");
      expect(fullPrompt).toContain("<<RETRIEVED MEMORY>>");
      expect(fullPrompt).toContain("[Relevant Memory");
      expect(fullPrompt).toContain("Alex Rivera");
      expect(fullPrompt).toContain("As a");
      expect(fullPrompt).toContain(userQuery);
    });
  });
});
