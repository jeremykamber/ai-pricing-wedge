import { z } from "zod";

export type TierLabel = 'observed' | 'interpreted' | 'synthetic';

export type PersonaGenerationMode = 'research' | 'strategy' | 'cluster';

export interface AttributeProvenance {
  attribute: string;
  tier: TierLabel;
  confidence: number;
  evidence?: string;
  source?: string;
}

export interface PersonaProvenance {
  attributes: AttributeProvenance[];
  generationMode: PersonaGenerationMode;
  overallConfidence: number;
}

export interface EvidenceLink {
  transcriptId: string;
  excerpt: string;
  attribute: string;
  timestamp?: string;
}

export interface ClusterInfo {
  representedCount: number;
  sourceIds: string[];
  confidenceInterval?: string;
}

export const TierLabelSchema = z.enum(['observed', 'interpreted', 'synthetic']);

export const PersonaGenerationModeSchema = z.enum(['research', 'strategy', 'cluster']);

export const AttributeProvenanceSchema = z.object({
  attribute: z.string().min(1),
  tier: TierLabelSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional(),
  source: z.string().optional(),
});

export const PersonaProvenanceSchema = z.object({
  attributes: z.array(AttributeProvenanceSchema),
  generationMode: PersonaGenerationModeSchema,
  overallConfidence: z.number().min(0).max(1),
});

export const EvidenceLinkSchema = z.object({
  transcriptId: z.string().min(1),
  excerpt: z.string().min(1),
  attribute: z.string().min(1),
  timestamp: z.string().optional(),
});

export const ClusterInfoSchema = z.object({
  representedCount: z.number().int().min(1),
  sourceIds: z.array(z.string()).min(1),
  confidenceInterval: z.string().optional(),
});
