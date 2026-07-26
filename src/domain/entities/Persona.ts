import { z } from "zod";

/**
 * Persona entity — grounded in the inference-time persona construction literature.
 *
 * Research foundations:
 * - Big Five (OCEAN): Joshi et al. (2025) demonstrate 6-9% better behavioral
 *   adherence over unstructured trait lists via psychometric grounding.
 * - Psychographic specification (values, fears, communication style, goals):
 *   Wang et al. (2024b) compartmentalized architecture, Section 3.1.
 * - Narrative backstory: Moon et al. (2024) Anthology framework — backstories
 *   provide causally coherent constraints that out-perform flat demographics
 *   by 14-18% on distributional alignment.
 * - Epistemic boundaries + behavioral guardrails: Wang et al. (2024b) Sections 3.1(3)-(4).
 *
 * Deliberately excluded (not research-backed for inference-time persona work):
 * - cognitiveReflex (System 1/2): not a validated psychometric construct
 * - technicalFluency, economicSensitivity: not standard psychometric dimensions
 * - designStyle, livingEnvironment: narrative details → backstory
 */
export interface Persona {
  id: string;
  name: string;
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];
  goals: string[];

  // Big Five Personality Traits (0-100) — Joshi et al. (2025) Section 3.2
  conscientiousness: number;
  neuroticism: number;
  openness: number;
  extraversion: number;
  agreeableness: number;

  // Psychographic Specification — Wang et al. (2024b) Section 3.1(2)
  values: string[];            // Core values that drive decisions
  fears: string[];             // Anxieties and risk concerns
  communicationStyle: string;  // How they speak (e.g. "direct", "analytical", "collaborative")
  decisionStyle: string;       // Decision process (e.g. "data-driven", "gut-driven", "consensus-seeking")

  // Pricing calibration — LLM-generated per persona based on role + context
  pricingSensitivity: number;  // 0-100: how price-sensitive they are (derived from Big Five + role)
  typicalBudget: string;       // What they're used to paying (e.g. "Up to $20/user/month")

  // Epistemic boundaries — Wang et al. (2024b) Section 3.1(3)
  domainExpertise?: string[];
  epistemicBoundaries?: string[];

  // Behavioral guardrails — Wang et al. (2024b) Section 3.1(4)
  responseConstraints?: string[];
  refusalPatterns?: string[];

  // Narrative container — Moon et al. (2024) Section 2.2
  backstory?: string;

  // Variant tracking — set when this persona was generated as a variant of another
  variantOf?: { id: string; name: string };
}

export const PersonaSchema = z.object({
  id: z.string().describe("Unique identifier for the persona"),
  name: z.string().describe("Full name of the persona"),
  age: z.number().describe("Age of the persona"),
  occupation: z.string().describe("Job title or role"),
  educationLevel: z.string().describe("Highest level of education"),
  interests: z.array(z.string()).describe("Personal interests and hobbies"),
  goals: z.array(z.string()).describe("Professional or personal goals"),

  // Big Five
  conscientiousness: z.number().min(0).max(100).describe("High=Meticulous, Low=Chaotic"),
  neuroticism: z.number().min(0).max(100).describe("High=Anxious, Low=Stable"),
  openness: z.number().min(0).max(100).describe("High=Curious, Low=Traditional"),
  extraversion: z.number().min(0).max(100).describe("High=Outgoing, Low=Solitary"),
  agreeableness: z.number().min(0).max(100).describe("High=Compassionate, Low=Competitive"),

  // Psychographic Specification
  values: z.array(z.string()).describe("Core values driving decisions"),
  fears: z.array(z.string()).describe("Anxieties and risk concerns"),
  communicationStyle: z.string().describe("How they speak — direct, analytical, collaborative, etc."),
  decisionStyle: z.string().describe("Decision process — data-driven, gut-driven, consensus-seeking, etc."),

  // Pricing calibration
  pricingSensitivity: z.number().min(0).max(100).describe("0-100: how price-sensitive they are"),
  typicalBudget: z.string().describe("What they're used to paying (e.g. 'Up to $20/user/month')"),

  // Epistemic boundaries
  domainExpertise: z.array(z.string()).optional().describe("Domains the persona knows well"),
  epistemicBoundaries: z.array(z.string()).optional().describe("Domains the persona does NOT have access to"),

  // Behavioral guardrails
  responseConstraints: z.array(z.string()).optional().describe("Response format constraints"),
  refusalPatterns: z.array(z.string()).optional().describe("Behaviors the persona should refuse"),

  // Narrative
  backstory: z.string().optional().describe("Life narrative — causally coherent backstory (Moon 2024)"),
});

export function validatePersona(entity: Persona): boolean {
  return !!entity.id;
}

export function stringifyPersona(entity: Persona): string {
  const join = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "—");
  const normalize = (text?: string) => (text ? text.replace(/\s+/g, " ").trim() : undefined);

  const lines: string[] = [
    `Name: ${entity.name ?? "—"}`,
    `Age: ${entity.age ?? "—"}`,
    `Occupation: ${entity.occupation ?? "—"}`,
    `Education: ${entity.educationLevel ?? "—"}`,
    `Interests: ${join(entity.interests)}`,
    `Goals: ${join(entity.goals)}`,
    `--- BIG FIVE (0-100) ---`,
    `Conscientiousness: ${entity.conscientiousness ?? 50} (Low=Chaotic, High=Meticulous)`,
    `Neuroticism: ${entity.neuroticism ?? 50} (Low=Stable, High=Anxious/Risk-Averse)`,
    `Openness: ${entity.openness ?? 50} (Low=Traditional, High=Early Adopter)`,
    `Extraversion: ${entity.extraversion ?? 50} (Low=Solitary, High=Outgoing)`,
    `Agreeableness: ${entity.agreeableness ?? 50} (Low=Competitive, High=Compassionate)`,
    `--- PSYCHOGRAPHIC SPECIFICATION ---`,
    `Values: ${join(entity.values)}`,
    `Fears: ${join(entity.fears)}`,
    `Communication Style: ${entity.communicationStyle ?? "—"}`,
    `Decision Style: ${entity.decisionStyle ?? "—"}`,
    `Pricing Sensitivity: ${entity.pricingSensitivity ?? 50}/100`,
    `Typical Budget: ${entity.typicalBudget ?? "—"}`,
  ];

  // Epistemic boundaries
  const expertise = join(entity.domainExpertise);
  if (expertise && expertise !== "—") lines.push(`Domain Expertise: ${expertise}`);
  const boundaries = join(entity.epistemicBoundaries);
  if (boundaries && boundaries !== "—") lines.push(`Epistemic Boundaries: ${boundaries}`);

  // Narrative
  const backstory = normalize(entity.backstory);
  if (backstory) lines.push(`Backstory: ${backstory}`);

  return lines.join("\n");
}
