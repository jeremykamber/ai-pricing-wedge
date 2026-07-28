import { z } from "zod";
import type { PersonaProfile } from "./PersonaProfile";
import type { StageJourney } from "./StageJourney";
import type { MajorFinding } from "./MajorFinding";
import type { CognitiveStage } from "./CognitiveStage";
import { COGNITIVE_STAGES } from "./CognitiveStage";

/**
 * One persona's response to an artifact — the core output of the analysis.
 * Contains the persona's full reasoning trace and structured report.
 * Embeds a PersonaProfile (lightweight display projection) rather than the
 * full Persona entity to avoid carrying backstory, provenance, and other
 * 30+ fields into every saved result.
 */
export interface PersonaResponse {
  id: string;
  artifactUrl?: string;
  screenshotBase64: string;
  rawAnalysis: string;
  overview: string;
  customerJourney: StageJourney[];
  researchQuestionAnswer: string;
  majorFindings: MajorFinding[];
  pointsOfFriction: string[];
  unansweredQuestions: string[];
  personaProfile?: PersonaProfile;
  personaId?: string;
}

const StageJourneySchema = z.object({
  stage: z.enum(["interpretation", "understanding", "belief", "motivation", "action"]),
  description: z.string().describe("What the persona experienced at this stage."),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("How the persona felt during this stage."),
  outcome: z.enum(["succeeded", "blocked", "stopped"]).describe("Whether the persona successfully passed this stage."),
  transition: z.string().optional().describe("What caused progression to the next stage, or why they stopped."),
});

const MajorFindingSchema = z.object({
  observation: z.string().describe("What happened — a specific behavior or reaction observed across personas."),
  evidence: z.string().describe("What personas experienced that supports this observation. Grounded in the simulation."),
  impact: z.string().describe("Why this matters — the downstream effect on the persona's experience."),
  confidence: z.enum(["High", "Medium", "Low"]).describe("Confidence in this finding, derived from inter-persona agreement (never LLM-generated)."),
});

export const PersonaResponseSchema = z.object({
  overview: z.string().describe("High-level summary of this persona's response to the artifact, covering their full journey and key takeaways."),
  customerJourney: z.array(StageJourneySchema).describe("The persona's experience across all five cognitive stages in order."),
  researchQuestionAnswer: z.string().describe("Direct answer to the research question, grounded in evidence from this persona's simulation."),
  majorFindings: z.array(MajorFindingSchema).describe("Key findings from this persona's response. Each finding has an observation, evidence, impact, and confidence level."),
  pointsOfFriction: z.array(z.string()).describe("Moments where the persona failed to progress through the cognitive journey — what confused, frustrated, or stopped them."),
  unansweredQuestions: z.array(z.string()).describe("Questions the persona still had after interacting with the artifact. These often reveal missing information."),
});

export function validatePersonaResponse(response: PersonaResponse): boolean {
  if (!response || typeof response !== "object") return false;

  if (!response.id || typeof response.id !== "string") return false;
  if (!response.screenshotBase64 || typeof response.screenshotBase64 !== "string") return false;
  if (!response.rawAnalysis || typeof response.rawAnalysis !== "string") return false;
  if (!response.overview || typeof response.overview !== "string") return false;
  if (typeof response.researchQuestionAnswer !== "string") return false;

  if (!Array.isArray(response.customerJourney) || response.customerJourney.length !== COGNITIVE_STAGES.length) return false;
  if (!Array.isArray(response.majorFindings)) return false;
  if (!Array.isArray(response.pointsOfFriction)) return false;
  if (!Array.isArray(response.unansweredQuestions)) return false;

  // Enforce stage ordering: each stage must appear exactly once, in the correct order
  for (let i = 0; i < COGNITIVE_STAGES.length; i++) {
    const stage = response.customerJourney[i];
    if (!stage || stage.stage !== COGNITIVE_STAGES[i]) return false;
    if (!stage.description || !stage.sentiment || !stage.outcome) return false;
  }

  for (const finding of response.majorFindings) {
    if (!finding.observation || !finding.evidence || !finding.impact || !finding.confidence) return false;
  }

  return true;
}
