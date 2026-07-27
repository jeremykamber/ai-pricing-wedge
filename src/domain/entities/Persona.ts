import { z } from "zod";
import type {
  PersonaProvenance,
  EvidenceLink,
  ClusterInfo,
  PersonaGenerationMode,
} from "./PersonaProvenance";
import type { BehavioralDimension } from "./BehavioralDimension";
import {
  PersonaProvenanceSchema,
  PersonaGenerationModeSchema,
  EvidenceLinkSchema,
  ClusterInfoSchema,
} from "./PersonaProvenance";
import { BehavioralDimensionSchema } from "./BehavioralDimension";

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
 *
 * Generation modes (2025 philosophy):
 * - research: evidence-first, minimal invention, no fabricated memories
 * - strategy: richer storytelling, representative assumptions, optimized for imagination
 * - cluster: synthetic representative from multiple interview signals
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

  // --- Persona Modeling Philosophy (2025) ---

  // Generation mode: how this persona was created
  generationMode?: PersonaGenerationMode;

  // Behavioral dimensions: domain-specific axes (contextual, not universal traits)
  // Supplements the universal Big Five with contextual behavioral dimensions.
  // Example: "friction-tolerance" in job search context, not general personality.
  behavioralDimensions?: BehavioralDimension[];

  // Provenance tracking: per-attribute confidence and tier labeling
  provenance?: PersonaProvenance;

  // Evidence links: direct interview/source excerpts backing persona attributes
  evidenceLinks?: EvidenceLink[];

  // Cluster info: for personas representing a group of interview subjects
  clusterInfo?: ClusterInfo;

  // Identity vs situation distinction:
  // identityContext = stable traits (applies across domains)
  // situationContext = contextual behavior (domain-specific)
  identityContext?: string;
  situationContext?: string;

  // Counterfactual removal test: "If this detail were false, would a different
  // product decision be made?" Details that fail this test should not influence
  // product decisions.
  counterfactualTest?: string;

  // Prediction scope: what this persona is good at / less reliable for
  bestFor?: string[];
  lessReliableFor?: string[];

  // PB&J (Psychology of Behavior and Judgment) rationales — Joshi et al. (2025)
  // Causal explanations connecting the persona's profile to their values, fears, and decisions.
  // Displayed in the Advanced Model Details section, not in the backstory.
  pbjRationales?: string;
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

  // Variant tracking
  variantOf: z.object({
    id: z.string(),
    name: z.string(),
  }).optional().describe("Reference to source persona when this is a variant"),

  // --- Persona Modeling Philosophy (2025) ---
  generationMode: PersonaGenerationModeSchema.optional()
    .describe("How this persona was created: research, strategy, or cluster"),
  behavioralDimensions: z.array(BehavioralDimensionSchema).optional()
    .describe("Domain-specific behavioral axes (contextual, not universal traits)"),
  provenance: PersonaProvenanceSchema.optional()
    .describe("Per-attribute confidence and tier labeling"),
  evidenceLinks: z.array(EvidenceLinkSchema).optional()
    .describe("Direct interview/source excerpts backing persona attributes"),
  clusterInfo: ClusterInfoSchema.optional()
    .describe("Cluster info for personas representing a group of interview subjects"),
  identityContext: z.string().optional()
    .describe("Stable traits that apply across domains"),
  situationContext: z.string().optional()
    .describe("Contextual behavior specific to a domain"),
  counterfactualTest: z.string().optional()
    .describe("If this detail were false, would a different product decision be made?"),
  bestFor: z.array(z.string()).optional()
    .describe("What this persona model is good at predicting"),
  lessReliableFor: z.array(z.string()).optional()
    .describe("What this persona model is less reliable for"),
  pbjRationales: z.string().optional()
    .describe("PB&J rationales — causal explanations connecting the persona's profile to their values, fears, and decisions"),
});

export function validatePersona(entity: unknown): boolean {
  if (!entity || typeof entity !== 'object') return false;
  return PersonaSchema.safeParse(entity).success;
}

export function stringifyPersona(entity: unknown): string {
  if (!entity || typeof entity !== 'object') return "—";
  const p = entity as Record<string, unknown>;
  const str = (val: unknown): string => (val != null && val !== "" ? String(val) : "—");
  const join = (arr?: unknown) =>
    Array.isArray(arr) && arr.length > 0 ? arr.map(String).join(", ") : "—";
  const normalize = (text?: unknown) =>
    typeof text === "string" ? text.replace(/\s+/g, " ").trim() : undefined;

  const lines: string[] = [
    `Name: ${str(p.name)}`,
    `Age: ${str(p.age)}`,
    `Occupation: ${str(p.occupation)}`,
    `Education: ${str(p.educationLevel)}`,
    `Interests: ${join(p.interests)}`,
    `Goals: ${join(p.goals)}`,
    `--- BIG FIVE (0-100) ---`,
    `Conscientiousness: ${str(p.conscientiousness)} (Low=Chaotic, High=Meticulous)`,
    `Neuroticism: ${str(p.neuroticism)} (Low=Stable, High=Anxious/Risk-Averse)`,
    `Openness: ${str(p.openness)} (Low=Traditional, High=Early Adopter)`,
    `Extraversion: ${str(p.extraversion)} (Low=Solitary, High=Outgoing)`,
    `Agreeableness: ${str(p.agreeableness)} (Low=Competitive, High=Compassionate)`,
    `--- PSYCHOGRAPHIC SPECIFICATION ---`,
    `Values: ${join(p.values)}`,
    `Fears: ${join(p.fears)}`,
    `Communication Style: ${str(p.communicationStyle)}`,
    `Decision Style: ${str(p.decisionStyle)}`,
    `Pricing Sensitivity: ${str(p.pricingSensitivity)}/100`,
    `Typical Budget: ${str(p.typicalBudget)}`,
  ];

  // Epistemic boundaries
  const expertise = join(p.domainExpertise);
  if (expertise && expertise !== "—") lines.push(`Domain Expertise: ${expertise}`);
  const boundaries = join(p.epistemicBoundaries);
  if (boundaries && boundaries !== "—") lines.push(`Epistemic Boundaries: ${boundaries}`);

  // Narrative
  const backstory = normalize(p.backstory);
  if (backstory) lines.push(`Backstory: ${backstory}`);

  // Generation mode
  if (p.generationMode) lines.push(`Generation Mode: ${p.generationMode}`);

  // Behavioral dimensions
  if (Array.isArray(p.behavioralDimensions) && p.behavioralDimensions.length > 0) {
    lines.push(`--- BEHAVIORAL DIMENSIONS ---`);
    for (const dim of p.behavioralDimensions) {
      const d = dim as Record<string, unknown>;
      lines.push(`${d.name}: ${d.score}/100 (${d.context}) — ${d.description}`);
    }
  }

  // Provenance
  if (p.provenance) {
    const prov = p.provenance as Record<string, unknown>;
    lines.push(`--- PROVENANCE ---`);
    lines.push(`Overall Confidence: ${prov.overallConfidence}`);
    lines.push(`Generation Mode: ${prov.generationMode}`);
    lines.push(`Attribute Provenance:`);
    if (Array.isArray(prov.attributes)) {
      for (const attr of prov.attributes) {
        const a = attr as Record<string, unknown>;
        lines.push(`  ${a.attribute}: tier=${a.tier}, confidence=${a.confidence}`);
      }
    }
  }

  // Evidence links
  if (Array.isArray(p.evidenceLinks) && p.evidenceLinks.length > 0) {
    lines.push(`--- EVIDENCE LINKS ---`);
    for (const link of p.evidenceLinks) {
      const l = link as Record<string, unknown>;
      lines.push(`${l.attribute}: "${l.excerpt}" (${l.transcriptId})`);
    }
  }

  // Cluster info
  if (p.clusterInfo) {
    const ci = p.clusterInfo as Record<string, unknown>;
    lines.push(`--- CLUSTER INFO ---`);
    lines.push(`Representing ${ci.representedCount} interview subjects`);
    if (Array.isArray(ci.sourceIds)) lines.push(`Sources: ${ci.sourceIds.join(", ")}`);
  }

  // Identity/Situation context
  const identityContext = normalize(p.identityContext);
  if (identityContext) lines.push(`Identity Context: ${identityContext}`);
  const situationContext = normalize(p.situationContext);
  if (situationContext) lines.push(`Situation Context: ${situationContext}`);

  // Counterfactual test
  const counterfactualTest = normalize(p.counterfactualTest);
  if (counterfactualTest) lines.push(`Counterfactual Test: ${counterfactualTest}`);

  return lines.join("\n");
}
