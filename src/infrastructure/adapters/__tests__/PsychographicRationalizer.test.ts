import { describe, it, expect, vi } from "vitest";
import { PsychographicRationalizer } from "../PsychographicRationalizer";
import type { Persona } from "@/domain/entities/Persona";

const basePersona: Persona = {
  id: "test-1",
  name: "Jordan Chen",
  age: 34,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["saas tools", "hiking"],
  goals: ["optimize team velocity", "reduce churn"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 70,
  extraversion: 45,
  agreeableness: 55,
  values: ["efficiency", "innovation"],
  fears: ["stagnation", "wasted effort"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  pricingSensitivity: 50,
  typicalBudget: "unknown",
};

describe("PsychographicRationalizer", () => {
  it("generates rationales for each scaffold in parallel", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue(
        "High conscientiousness stems from early exposure to structured environments.",
      ),
    };
    const enhancer = new PsychographicRationalizer(mockLlm as any);
    const rationales = await enhancer.generateAllRationales(basePersona);

    expect(rationales.length).toBeGreaterThanOrEqual(1);
    expect(rationales[0].scaffold).toBeTruthy();
    expect(rationales[0].rationale).toBeTruthy();
  });

  it("formats rationales into a backstory appendix", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue(
        "This persona makes decisions analytically due to their high cognitive reflex.",
      ),
    };
    const enhancer = new PsychographicRationalizer(mockLlm as any);
    const text = await enhancer.rationalizeBackstory(basePersona);

    expect(text).toContain("<<PSYCHOLOGICAL RATIONALES (PB&J)>>");
    expect(text).toContain("[Big Five Personality Roots]");
  });

  it("handles LLM failures gracefully (partial results)", async () => {
    const mockLlm = {
      createChatCompletion: vi
        .fn()
        .mockRejectedValueOnce(new Error("LLM error"))
        .mockResolvedValueOnce("Stable output")
        .mockResolvedValueOnce("Stable output"),
    };
    const enhancer = new PsychographicRationalizer(mockLlm as any);
    const rationales = await enhancer.generateAllRationales(basePersona);

    expect(rationales.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty string when no rationales generated", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockRejectedValue(new Error("LLM error")),
    };
    const enhancer = new PsychographicRationalizer(mockLlm as any);
    const text = await enhancer.rationalizeBackstory(basePersona);
    expect(text).toBe("");
  });

  it("calls createChatCompletion for each scaffold type", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("Test rationale output"),
    };
    const enhancer = new PsychographicRationalizer(mockLlm as any);
    await enhancer.generateAllRationales(basePersona);

    expect(mockLlm.createChatCompletion).toHaveBeenCalledTimes(3);
  });

  it("handles partial scaffold failures with precise count", async () => {
    const mockLlm = {
      createChatCompletion: vi
        .fn()
        .mockRejectedValueOnce(new Error("Scaffold A failed"))
        .mockResolvedValueOnce("Values scaffold output")
        .mockResolvedValueOnce("Risk scaffold output"),
    };
    const enhancer = new PsychographicRationalizer(mockLlm as any);
    const rationales = await enhancer.generateAllRationales(basePersona);

    expect(rationales).toHaveLength(2);
    expect(rationales[0].scaffold).toBe("Decision Style & Values Integration");
    expect(rationales[1].scaffold).toBe("Core Values & Risk Worldview");
  });

  it("processes multiple personas like rationalizePersonas port would", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("Rationale output"),
    };
    const enhancer = new PsychographicRationalizer(mockLlm as any);

    const persona2: Persona = {
      ...basePersona,
      id: "test-2",
      name: "Sarah Kim",
      occupation: "Designer",
    };

    const results = await Promise.all([
      enhancer.rationalizeBackstory(basePersona),
      enhancer.rationalizeBackstory(persona2),
    ]);

    expect(results).toHaveLength(2);
    for (const text of results) {
      expect(text).toContain("<<PSYCHOLOGICAL RATIONALES (PB&J)>>");
    }
    expect(mockLlm.createChatCompletion).toHaveBeenCalledTimes(6);
  });

  it("minimal persona still generates scaffold rationales", async () => {
    const minimalPersona: Persona = {
      id: "minimal-1",
      name: "Test",
      age: 30,
      occupation: "Engineer",
      educationLevel: "Bachelors",
      interests: [],
      goals: ["test"],
      conscientiousness: 50,
      neuroticism: 50,
      openness: 50,
      extraversion: 50,
      agreeableness: 50,
      values: [],
      fears: [],
      communicationStyle: "direct",
      decisionStyle: "data-driven",
      pricingSensitivity: 50,
      typicalBudget: "unknown",
    };
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("Rationale for minimal persona"),
    };
    const enhancer = new PsychographicRationalizer(mockLlm as any);
    const text = await enhancer.rationalizeBackstory(minimalPersona);

    expect(text).toContain("<<PSYCHOLOGICAL RATIONALES (PB&J)>>");
    expect(text.length).toBeGreaterThan(0);
  });
});
