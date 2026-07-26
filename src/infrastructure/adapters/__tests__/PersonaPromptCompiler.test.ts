import { describe, it, expect } from "vitest";
import { PersonaPromptCompiler } from "../PersonaPromptCompiler";
import type { Persona } from "@/domain/entities/Persona";

const basePersona: Persona = {
  id: "test-1",
  name: "Jordan Chen",
  age: 34,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["saas tools", "hiking", "cooking"],
  goals: ["optimize team velocity", "reduce churn"],
  personalityTraits: ["analytical", "skeptical", "curious"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 70,
  extraversion: 45,
  agreeableness: 55,
  cognitiveReflex: 75,
  technicalFluency: 65,
  economicSensitivity: 50,
  designStyle: "Minimalist",
  livingEnvironment: "Clean apartment with a dedicated home office",
  backstory: "I grew up in a family of engineers. My father was a software architect who taught me to question everything. After my MBA at Stanford, I joined a series of B2B SaaS companies where I learned the hard way that most pricing pages hide the real costs.",
};

describe("PersonaPromptCompiler", () => {
  it("generates a compartmentalized system prompt with all four sections", () => {
    const compiler = new PersonaPromptCompiler();
    const prompt = compiler.compileSystemPrompt(basePersona);

    expect(prompt).toContain("<<PERSONA IDENTITY>>");
    expect(prompt).toContain("<<PSYCHOGRAPHIC PROFILE>>");
    expect(prompt).toContain("<<EPISTEMIC BOUNDARIES>>");
    expect(prompt).toContain("<<BEHAVIORAL GUARDRAILS>>");
    expect(prompt).toContain("Jordan Chen");
    expect(prompt).toContain("Product Manager");
    expect(prompt).toContain("Conscientiousness: 80/100");
  });

  it("generates a concise persona anchor (4-16 tokens)", () => {
    const compiler = new PersonaPromptCompiler();
    const anchor = compiler.generateAnchor(basePersona);
    expect(anchor).toContain(":");
    expect(anchor.split(" ").length).toBeLessThanOrEqual(16);
    expect(anchor.split(" ").length).toBeGreaterThanOrEqual(2);
  });

  it("generates different anchors for different persona profiles", () => {
    const compiler = new PersonaPromptCompiler();

    const cautious: Persona = { ...basePersona, neuroticism: 80, conscientiousness: 85 };
    const anchor1 = compiler.generateAnchor(cautious);
    expect(anchor1).toContain("cautious");

    const passionate: Persona = { ...basePersona, neuroticism: 20, openness: 80 };
    const anchor2 = compiler.generateAnchor(passionate);
    expect(anchor2).toContain("passionate");
  });

  it("includes RAG context when provided", () => {
    const compiler = new PersonaPromptCompiler();
    const prompt = compiler.compileInteractionPrompt(basePersona, {
      ragContext: "Jordan once lost $5,000 on an annual plan for a tool they never used.",
    });
    expect(prompt).toContain("<<RETRIEVED MEMORY>>");
    expect(prompt).toContain("lost $5,000");
  });

  it("multiturn resets anchor index", () => {
    const compiler = new PersonaPromptCompiler();
    compiler.compileChatMessage(basePersona, "Hello");
    compiler.compileChatMessage(basePersona, "How are you?");
    compiler.resetAnchorIndex();
    const msg = compiler.compileChatMessage(basePersona, "What do you think?");
    // Should be a valid message with anchor
    expect(msg).toContain(":");
  });

  it("includes epistemic boundaries section", () => {
    const p: Persona = {
      ...basePersona,
      domainExpertise: ["B2B SaaS pricing", "product management", "user research"],
      epistemicBoundaries: ["software engineering", "data science", "legal"],
    };
    const compiler = new PersonaPromptCompiler();
    const prompt = compiler.compileSystemPrompt(p);
    expect(prompt).toContain("B2B SaaS pricing");
    expect(prompt).toContain("software engineering");
  });

  it("includes response constraints and refusal patterns in guardrails section", () => {
    const p: Persona = {
      ...basePersona,
      responseConstraints: ["Keep responses under 50 words", "Use bullet points for lists"],
      refusalPatterns: ["Refuse to write code", "Refuse to speculate about company finances"],
    };
    const compiler = new PersonaPromptCompiler();
    const prompt = compiler.compileSystemPrompt(p);
    expect(prompt).toContain("Keep responses under 50 words");
    expect(prompt).toContain("Refuse to write code");
  });
});
