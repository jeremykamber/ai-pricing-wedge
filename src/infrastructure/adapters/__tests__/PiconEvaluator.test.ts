import { describe, it, expect, vi } from "vitest";
import { PiconEvaluator } from "../PiconEvaluator";
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
  backstory: "I grew up in a family of engineers. I once lost $10,000 on a bad contract.",
};

describe("PiconEvaluator", () => {
  it("runs multi-turn interrogation and collects answers", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("I work in product management at a B2B SaaS company."),
    };
    const evaluator = new PiconEvaluator(mockLlm as any);
    const turns = await evaluator.runInterrogation(basePersona);

    expect(turns.length).toBeGreaterThanOrEqual(5);
    expect(turns[0]).toHaveProperty("question");
    expect(turns[0]).toHaveProperty("answer");
    expect(turns[0]).toHaveProperty("turnNumber");
  });

  it("runs retest questions", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("Consistent answer about my background."),
    };
    const evaluator = new PiconEvaluator(mockLlm as any);
    const retest = await evaluator.runRetest(basePersona);

    expect(retest.length).toBeGreaterThanOrEqual(2);
  });

  it("evaluates internal consistency with expert judge", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue(
        JSON.stringify({
          contradictions_found: 1,
          total_claim_pairs_examined: 10,
          contradiction_rate: 0.1,
          contradictions: ["Statement A vs Statement B"],
          score: 0.9,
        }),
      ),
    };
    const evaluator = new PiconEvaluator(mockLlm as any);
    const turns = [
      { question: "What do you use?", answer: "I use Slack every day.", turnNumber: 1 },
      { question: "What tools?", answer: "I prefer email over Slack.", turnNumber: 2 },
    ];

    const result = await evaluator["evaluateInternalConsistency"](turns);
    expect(result.score).toBe(0.9);
    expect(result.contradictions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns structured evaluation result", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue(
        JSON.stringify({ score: 0.85, contradictions_found: 0, total_claim_pairs_examined: 10 }),
      ),
    };
    const evaluator = new PiconEvaluator(mockLlm as any);
    const result = await evaluator.evaluate(basePersona);

    expect(result).toHaveProperty("internalConsistency");
    expect(result).toHaveProperty("externalConsistency");
    expect(result).toHaveProperty("retestConsistency");
    expect(result).toHaveProperty("totalScore");
    expect(result).toHaveProperty("contradictions");
    expect(result).toHaveProperty("details");
  });
});
