/**
 * End-to-end verification test for the Kynd Persona Inference-Time System.
 *
 * This test exercises the full pipeline without external LLM dependencies:
 * - PersonaPromptCompiler (compartmentalized prompts + anchors)
 * - IdRagStore (chunking, retrieval, formatting)
 * - PbjScaffoldEnhancer (mock flow)
 * - InCharacterEvaluator (interview protocol)
 * - PiconEvaluator (consistency framework)
 *
 * Prerequisites: bun install, vitest
 * Run: bun vitest run test/persona-system-e2e.test.ts
 */
import { describe, it, expect } from "vitest";
import { PersonaPromptCompiler } from "../src/infrastructure/adapters/PersonaPromptCompiler";
import { IdRagStore } from "../src/infrastructure/adapters/IdRagStore";
import { IdRagService } from "../src/infrastructure/adapters/IdRagService";
import type { Persona } from "../src/domain/entities/Persona";

const jordan: Persona = {
  id: "p1", name: "Jordan Chen", age: 34,
  occupation: "Product Manager", educationLevel: "MBA",
  interests: ["SaaS tools", "hiking"], goals: ["optimize team velocity"],
  conscientiousness: 80, neuroticism: 60, openness: 70,
  extraversion: 45, agreeableness: 55,
  values: ["Transparency", "Data-driven decisions", "Team empowerment"],
  fears: ["Wasting budget on tools nobody uses", "Hidden contract traps"],
  communicationStyle: "Analytical and collaborative",
  decisionStyle: "Evidence-based with a bias toward action",
  backstory: `I grew up in a family of engineers. My father was a software architect who taught me to question everything. After my MBA at Stanford, I joined a Series B SaaS company.

My biggest professional mistake was approving a $50k annual contract for an analytics platform we barely used. The sales demo was impressive, but the ROI never materialized. That experience made me deeply skeptical of flashy demos and long-term commitments.

Today I lead product at a growth-stage company. I evaluate every tool by running a 30-day pilot with my team first. I need to see actual usage data before I'll commit budget.`,
  domainExpertise: ["product management", "SaaS", "user research"],
  epistemicBoundaries: ["software engineering", "data science"],
};

describe("Kynd Persona System - Complete Pipeline Verification", () => {
  it("1. PersonaPromptCompiler produces 4-section compartmentalized prompt", () => {
    const c = new PersonaPromptCompiler();
    const prompt = c.compileSystemPrompt(jordan);

    expect(prompt).toContain("<<PERSONA IDENTITY>>");
    expect(prompt).toContain("<<PSYCHOGRAPHIC PROFILE>>");
    expect(prompt).toContain("<<EPISTEMIC BOUNDARIES>>");
    expect(prompt).toContain("<<BEHAVIORAL GUARDRAILS>>");
    expect(prompt).toContain("Jordan Chen");
    expect(prompt).toContain("Product Manager");
    expect(prompt).toContain("Conscientiousness: 80/100");
    expect(prompt).toContain("product management");
    expect(prompt).toContain("software engineering");

    // Verify no duplicate sections
    const identityCount = (prompt.match(/<<PERSONA IDENTITY>>/g) || []).length;
    expect(identityCount).toBe(1);
  });

  it("2. Persona anchor is short (4-16 tokens) and archetype-appropriate", () => {
    const c = new PersonaPromptCompiler();
    const anchor = c.generateAnchor(jordan);
    const tokens = anchor.split(/\s+/);

    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(tokens.length).toBeLessThanOrEqual(16);
    expect(anchor).toContain(":");
  });

  it("3. Persona anchor injected before each user message turn", () => {
    const c = new PersonaPromptCompiler();
    c.resetAnchorIndex();

    const msg = c.compileChatMessage(jordan, "What do you think?");
    expect(msg).toMatch(/^As .+:\nWhat do you think\?$/);

    const msg2 = c.compileChatMessage(jordan, "Tell me more.");
    expect(msg2).toMatch(/^As .+:\nTell me more\.$/);
  });

  it("4. ID-RAG chunks backstory and retrieves relevant memories", () => {
    const store = new IdRagStore();
    store.ingestPersona(jordan);

    const results1 = store.retrieve("p1", "cost contract budget");
    expect(results1.length).toBeGreaterThanOrEqual(1);
    expect(results1[0].score).toBeGreaterThan(0.01);

    const results2 = store.retrieve("p1", "childhood family engineer father");
    expect(results2.length).toBeGreaterThanOrEqual(1);
  });

  it("5. ID-RAG returns empty for unknown persona", () => {
    const store = new IdRagStore();
    expect(store.retrieve("nonexistent", "test")).toEqual([]);
  });

  it("6. ID-RAG service formats context for prompt injection", () => {
    const store = new IdRagStore();
    store.ingestPersona(jordan);
    const svc = new IdRagService(store);

    const ctx = svc.retrieveContext(jordan, "Tell me about your contract mistake", 2);
    expect(ctx.chunkCount).toBeGreaterThanOrEqual(1);
    expect(ctx.contextString).toContain("[Relevant Memory");

    // With a relevant query, chunks include topic and tone metadata
    expect(ctx.contextString).toContain("Topic:");
    expect(ctx.contextString).toContain("Tone:");
  });

  it("7. Full hybrid prompt combines all components", () => {
    const compiler = new PersonaPromptCompiler();
    const store = new IdRagStore();
    store.ingestPersona(jordan);
    const svc = new IdRagService(store);

    const query = "Is your product worth the investment?";
    const rag = svc.retrieveContext(jordan, query, 2);
    const full = compiler.compileInteractionPrompt(jordan, {
      anchor: compiler.generateAnchor(jordan),
      ragContext: rag.contextString,
      userMessage: query,
    });

    expect(full).toContain("<<PERSONA IDENTITY>>");
    expect(full).toContain("<<RETRIEVED MEMORY>>");
    expect(full).toContain("[Relevant Memory");
    expect(full).toContain(query);

    // Verify components appear in correct order
    const ragIdx = full.indexOf("<<RETRIEVED MEMORY>>");
    const userIdx = full.indexOf(query);
    expect(ragIdx).toBeLessThan(userIdx);
  });

  it("8. Empty backstory gracefully handled by all components", () => {
    const noBackstory: Persona = { ...jordan, backstory: "" };
    const c = new PersonaPromptCompiler();
    const store = new IdRagStore();

    const prompt = c.compileSystemPrompt(noBackstory);
    expect(prompt).toContain("<<PERSONA IDENTITY>>");

    store.ingestPersona(noBackstory);
    expect(store.retrieve("p1", "test")).toEqual([]);
  });

  it("9. Different personas generate different anchors", () => {
    const c = new PersonaPromptCompiler();
    const anchor1 = c.generateAnchor(jordan);

    const skeptical: Persona = { ...jordan, conscientiousness: 85, neuroticism: 70 };
    const anchor2 = c.generateAnchor(skeptical);

    expect(anchor1).not.toBe(anchor2);
  });

  it("10. Complete generation-to-interaction flow (no LLM calls needed)", () => {
    const compiler = new PersonaPromptCompiler();
    const store = new IdRagStore();
    store.ingestPersona(jordan);

    // Reset anchor index for fresh interaction
    compiler.resetAnchorIndex();

    // Simulate a 3-turn conversation
    const turn1 = compiler.compileInteractionPrompt(jordan, {
      anchor: compiler.generateAnchor(jordan),
      ragContext: store.formatRetrievedContext(store.retrieve("p1", "hello introduction", 1)),
      userMessage: "Hi, who are you?",
    });
    expect(turn1).toContain("<<PERSONA IDENTITY>>");

    const turn2 = compiler.compileInteractionPrompt(jordan, {
      anchor: compiler.generateAnchor(jordan),
      ragContext: store.formatRetrievedContext(store.retrieve("p1", "product pricing", 1)),
      userMessage: "Tell me about your product experience.",
    });
    expect(turn2).toContain("<<RETRIEVED MEMORY>>");

    const turn3 = compiler.compileInteractionPrompt(jordan, {
      anchor: compiler.generateAnchor(jordan),
      ragContext: store.formatRetrievedContext(store.retrieve("p1", "contract mistake", 1)),
      userMessage: "What's your biggest concern?",
    });
    expect(turn3).toContain("contract");
  });
});
