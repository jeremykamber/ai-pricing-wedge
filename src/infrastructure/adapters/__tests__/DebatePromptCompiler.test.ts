import { describe, it, expect } from "vitest";
import { DebatePromptCompiler } from "../DebatePromptCompiler";
import type { Persona } from "@/domain/entities/Persona";

const alice: Persona = {
  id: "p1",
  name: "Alice Chen",
  age: 38,
  occupation: "CTO",
  educationLevel: "MSc Computer Science",
  interests: ["cloud", "security"],
  goals: ["scale infrastructure"],
  conscientiousness: 85,
  neuroticism: 65,
  openness: 60,
  extraversion: 40,
  agreeableness: 30,
  values: ["security", "reliability", "evidence"],
  fears: ["data breach", "compliance failure"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  pricingSensitivity: 60,
  typicalBudget: "$100/mo",
  backstory: "I've led engineering teams through two SOC2 audits.",
};

const bob: Persona = {
  id: "p2",
  name: "Bob Martinez",
  age: 32,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["UX", "analytics"],
  goals: ["increase engagement"],
  conscientiousness: 70,
  neuroticism: 35,
  openness: 80,
  extraversion: 65,
  agreeableness: 70,
  values: ["user delight", "speed", "collaboration"],
  fears: ["building the wrong thing"],
  communicationStyle: "collaborative",
  decisionStyle: "consensus-seeking",
  pricingSensitivity: 40,
  typicalBudget: "$50/mo",
};

describe("DebatePromptCompiler", () => {
  const compiler = new DebatePromptCompiler();

  it("includes all prompt sections", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Raise prices 60%", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("<<PERSONA IDENTITY>>");
    expect(prompt).toContain("<<PSYCHOGRAPHIC PROFILE>>");
    expect(prompt).toContain("<<EPISTEMIC BOUNDARIES>>");
    expect(prompt).toContain("<<BEHAVIORAL GUARDRAILS>>");
    expect(prompt).toContain("<<DEBATE CONTEXT>>");
    expect(prompt).toContain("<<CURRENT DEBATE STATE>>");
    expect(prompt).toContain("<<YOUR RESPONSE>>");
  });

  it("includes the persona's name and proposal", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Raise prices 60%", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("Alice Chen");
    expect(prompt).toContain("Raise prices 60%");
  });

  it("lists each participant with their values", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("Alice Chen");
    expect(prompt).toContain("CTO");
    expect(prompt).toContain("Bob Martinez");
    expect(prompt).toContain("Product Manager");
  });

  it("includes round indicator", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("Round 1 of 3");
  });

  it("includes transcript when round > 1", () => {
    const transcript = `Round 1:\n  Alice Chen: "I have concerns."\n  Bob Martinez: "I disagree."`;
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", transcript, 2, 3);
    expect(prompt).toContain("Alice Chen: \"I have concerns.\"");
    expect(prompt).toContain("Bob Martinez: \"I disagree.\"");
  });

  it("adds deterministic trait directives based on Big Five", () => {
    // Alice: high neuroticism (65), low agreeableness (30)
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("risk awareness is high");
    expect(prompt).toContain("Challenge assumptions");

    // Bob: low neuroticism (35), high agreeableness (70)
    const prompt2 = compiler.buildPersonaPrompt(bob, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt2).toContain("naturally optimistic");
    expect(prompt2).toContain("Seek common ground");
  });

  it("includes response instructions", () => {
    const prompt = compiler.buildPersonaPrompt(alice, [alice, bob], "Test", "Awaiting first responses.", 1, 3);
    expect(prompt).toContain("Address specific points");
    expect(prompt).toContain("2-3 paragraphs");
    expect(prompt).toContain("strategy discussion");
  });
});
