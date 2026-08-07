import { describe, it, expect, vi } from "vitest";
import { InCharacterEvaluator } from "../InCharacterEvaluator";
import type { Persona } from "@/domain/entities/Persona";

const basePersona: Persona = {
  id: "test-1",
  name: "Jordan Chen",
  age: 34,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["saas"],
  goals: ["optimize"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 70,
  extraversion: 45,
  agreeableness: 55,
  values: ["Efficiency", "Transparency"],
  fears: ["Wasted effort", "Vendor lock-in"],
  communicationStyle: "Direct",
  decisionStyle: "Data-driven",
};

describe("InCharacterEvaluator", () => {
  it("builds interview questions for all Big Five dimensions", () => {
    const mockLlm = { createChatCompletion: vi.fn().mockResolvedValue("I like trying new tools.") };
    const evaluator = new InCharacterEvaluator(mockLlm as any);

    expect(evaluator["interviewQuestions"].length).toBeGreaterThanOrEqual(10);
    const dimensions = evaluator["interviewQuestions"].map((q) => q.dimension);
    expect(dimensions.filter((d) => d === "openness").length).toBeGreaterThanOrEqual(2);
    expect(dimensions.filter((d) => d === "conscientiousness").length).toBeGreaterThanOrEqual(2);
    expect(dimensions.filter((d) => d === "extraversion").length).toBeGreaterThanOrEqual(2);
    expect(dimensions.filter((d) => d === "agreeableness").length).toBeGreaterThanOrEqual(2);
    expect(dimensions.filter((d) => d === "neuroticism").length).toBeGreaterThanOrEqual(2);
  });

  it("conducts an interview and collects responses", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("I believe in trying new things when they solve real problems."),
    };
    const evaluator = new InCharacterEvaluator(mockLlm as any);
    const transcript = await evaluator.runInterview(basePersona);

    expect(transcript).toContain("Q:");
    expect(transcript).toContain("A:");
    expect(mockLlm.createChatCompletion).toHaveBeenCalled();
  });

  it("generates expert analysis from transcript", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue(
        "Openness: 72/100 - Shows curiosity about new approaches.\nConscientiousness: 80/100 - Methodical decision process."
      ),
    };
    const evaluator = new InCharacterEvaluator(mockLlm as any);
    const analysis = await evaluator.expertEvaluate(basePersona, "Q: Tell me about trying new things.\nA: I love exploring new SaaS tools.");

    expect(analysis.length).toBeGreaterThan(0);
  });

  it("parses expert trait scores from text", () => {
    const evaluator = new InCharacterEvaluator({} as any);
    const text = `Openness: 72/100\nConscientiousness: 80/100\nExtraversion: 35/100\nAgreeableness: 60/100\nNeuroticism: 55/100`;
    const scores = evaluator["parseExpertScores"](text);

    expect(scores.openness).toBe(72);
    expect(scores.conscientiousness).toBe(80);
    expect(scores.extraversion).toBe(35);
    expect(scores.agreeableness).toBe(60);
    expect(scores.neuroticism).toBe(55);
  });

  it("runs full evaluation with interview + expert analysis", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("I evaluate tools carefully before buying."),
    };
    const evaluator = new InCharacterEvaluator(mockLlm as any);
    const result = await evaluator.evaluate(basePersona);

    expect(result).toHaveProperty("traitScores");
    expect(result).toHaveProperty("expertAnalysis");
  });
});
