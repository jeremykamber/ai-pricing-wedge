import { describe, it, expect } from "vitest";
import { resolveChatPersona, personaFromProfile } from "../resolveChatPersona";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { PersonaBatch } from "@/ui/stores/personaStore";

const profile = {
  name: "Sarah Chen",
  occupation: "Senior Engineer",
  bigFive: { conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 50, agreeableness: 60 },
  values: ["Transparency"],
  fears: ["Hidden costs"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
};

const fullPersona = {
  id: "persona-full",
  name: "Sarah Chen",
  age: 34,
  occupation: "Senior Engineer",
  educationLevel: "MS",
  interests: ["sailing"],
  goals: ["ship reliable code"],
  conscientiousness: 80,
  neuroticism: 30,
  openness: 70,
  extraversion: 50,
  agreeableness: 60,
  values: ["Transparency"],
  fears: ["Hidden costs"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  backstory: "Grew up in a family of engineers.",
};

const batch: PersonaBatch = {
  id: "batch-1",
  label: "Q3 cohort",
  source: "description",
  createdAt: new Date().toISOString(),
  personas: [fullPersona],
};

const response = (overrides: Partial<PersonaResponse> = {}): PersonaResponse => ({
  id: "r-1",
  screenshotBase64: "",
  rawAnalysis: "raw",
  overview: "Clear pricing but wanted a monthly option.",
  customerJourney: [
    { stage: "interpretation", description: "d", sentiment: "neutral", outcome: "succeeded" },
    { stage: "understanding", description: "d", sentiment: "positive", outcome: "succeeded" },
    { stage: "belief", description: "d", sentiment: "neutral", outcome: "succeeded" },
    { stage: "motivation", description: "d", sentiment: "positive", outcome: "succeeded" },
    { stage: "action", description: "d", sentiment: "negative", outcome: "blocked" },
  ],
  researchQuestionAnswer: "Monthly pricing would help.",
  majorFindings: [],
  pointsOfFriction: [],
  unansweredQuestions: [],
  personaProfile: profile,
  ...overrides,
});

describe("resolveChatPersona", () => {
  it("returns the full persona on exact personaId match", () => {
    const resolved = resolveChatPersona(response({ personaId: "persona-full" }), [batch]);
    expect(resolved).toEqual(fullPersona);
  });

  it("matches by name when personaId is missing (older runs)", () => {
    const resolved = resolveChatPersona(response(), [batch]);
    expect(resolved).toEqual(fullPersona);
  });

  it("matches by name across a later batch when the first batch lacks the persona", () => {
    const emptyBatch: PersonaBatch = { ...batch, id: "other", personas: [] };
    const resolved = resolveChatPersona(response(), [emptyBatch, batch]);
    expect(resolved).toEqual(fullPersona);
  });

  it("falls back to a profile-derived persona when no batch holds the persona", () => {
    const resolved = resolveChatPersona(response({ personaId: "gone" }), []);
    expect(resolved).not.toBeNull();
    expect(resolved!.name).toBe("Sarah Chen");
    expect(resolved!.occupation).toBe("Senior Engineer");
    expect(resolved!.conscientiousness).toBe(80);
    expect(resolved!.values).toEqual(["Transparency"]);
    expect(resolved!.age).toBe(0); // unknown — compiler renders "—"
  });

  it("returns null when there is no profile to fall back on", () => {
    const resolved = resolveChatPersona(response({ personaProfile: undefined }), []);
    expect(resolved).toBeNull();
  });
});

describe("personaFromProfile", () => {
  it("reconstructs a chat-capable persona from the display projection", () => {
    const p = personaFromProfile(profile, "derived-1");
    expect(p.id).toBe("derived-1");
    expect(p.name).toBe("Sarah Chen");
    expect(p.communicationStyle).toBe("direct");
    expect(p.interests).toEqual([]);
    expect(p.goals).toEqual([]);
  });
});
