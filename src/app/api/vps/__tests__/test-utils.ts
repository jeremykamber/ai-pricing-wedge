// ─── Shared test data & helpers for VPS API route tests ─────────────────────
import type { Persona } from "@/domain/entities/Persona";
import type { PricingAnalysis } from "@/domain/entities/PricingAnalysis";
import type { TestingSession } from "@/domain/entities/TestingSession";
import type { InteractionStep } from "@/domain/entities/InteractionStep";
import type { CriticEvaluation } from "@/domain/entities/CriticEvaluation";
import type { GazePoint } from "@/domain/entities/PricingAnalysis";

// ── Mock data ───────────────────────────────────────────────────────────────

export const mockPersona: Persona = {
  id: "persona-1",
  name: "Test Persona",
  age: 30,
  occupation: "Developer",
  educationLevel: "BS",
  interests: ["tech"],
  goals: ["learn"],
  conscientiousness: 70,
  neuroticism: 30,
  openness: 80,
  extraversion: 50,
  agreeableness: 60,
  values: ["efficiency"],
  fears: ["failure"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  pricingSensitivity: 50,
  typicalBudget: "$20/mo",
  backstory: "A test persona",
};

export const mockAnalysis: PricingAnalysis = {
  id: "analysis-1",
  url: "https://example.com/pricing",
  screenshotBase64: "iVBOR...",
  thoughts: "This is a test analysis.",
  scores: {
    clarity: 7,
    clarityReason: "Clear enough",
    valuePerception: 6,
    valuePerceptionReason: "Decent value",
    trust: 8,
    trustReason: "Trustworthy",
    explorationIntent: 7,
    explorationIntentReason: "Would explore",
    analysisIntent: 6,
    analysisIntentReason: "Would analyze",
    buyIntent: 5,
    buyIntentReason: "Might buy",
  },
  risks: ["Risk 1", "Risk 2"],
  recommendations: ["Rec 1", "Rec 2"],
  aiSuggestion: "Try this",
};

export const mockSession: TestingSession = {
  id: "session-1",
  personaId: "persona-1",
  steps: [],
  shortTermMemory: "",
};

export const mockInteractionStep: InteractionStep = {
  url: "https://example.com",
  action: "click",
  elementDescription: "#pricing-button",
  thought: "Checking pricing",
  timestamp: Date.now(),
};

export const mockCriticEvaluation: CriticEvaluation = {
  id: "eval-1",
  analysisId: "analysis-1",
  personaId: "persona-1",
  coherenceScore: 8,
  isHallucinating: false,
  critique: "Looks coherent",
};

export const mockGazePoints: GazePoint[] = [
  { x: 50, y: 30, focusLabel: "Headline" },
  { x: 70, y: 60, focusLabel: "CTA Button" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}
