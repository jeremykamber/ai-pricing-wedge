import { z } from "zod";

const BasePersonaConfigSchema = z.object({
  count: z.number().int().min(1).max(10).describe("Number of personas to generate (1-10)"),
  personaDescription: z.string().min(1).describe("Textual description of the target persona(s)"),
  contextNotes: z.string().optional().describe("Additional context or notes for generation"),
});

export const ResearchPersonaConfigSchema = BasePersonaConfigSchema.extend({
  interviewIds: z.array(z.string()).optional().describe("Interview transcript IDs to ground the personas"),
  evidenceThreshold: z.number().min(0).max(1).optional().describe("Minimum confidence (0-1) to include an attribute"),
  preserveUncertainty: z.boolean().optional().describe("Explicitly mark low-confidence attributes"),
  verbatimSource: z.string().optional().describe("Raw interview transcript text that evidence quotes must be verbatim fragments of; distinct from the prompt description"),
});

export const StrategyPersonaConfigSchema = BasePersonaConfigSchema.extend({
  icpDescription: z.string().optional().describe("Ideal Customer Profile description"),
  allowSyntheticBackstory: z.boolean().optional().describe("Allow fabricated narrative details"),
  storytellingLevel: z.enum(['conservative', 'moderate', 'rich']).optional().describe("Level of narrative enrichment"),
});

export const ClusterPersonaConfigSchema = BasePersonaConfigSchema.extend({
  personaDescription: z.string().optional().describe("Optional description hint; derived from cluster if absent"),
  interviewIds: z.array(z.string()).min(1).describe("Source interview IDs forming this cluster"),
  clusterLabel: z.string().min(1).describe("Human-readable label for the cluster (e.g. 'Efficiency-focused engineers')"),
  minClusterSize: z.number().int().min(1).describe("Minimum interview subjects required to form a cluster"),
});

export type ResearchPersonaConfig = z.infer<typeof ResearchPersonaConfigSchema>;
export type StrategyPersonaConfig = z.infer<typeof StrategyPersonaConfigSchema>;
export type ClusterPersonaConfig = z.infer<typeof ClusterPersonaConfigSchema>;
