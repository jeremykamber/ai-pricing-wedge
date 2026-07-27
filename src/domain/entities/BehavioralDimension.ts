import { z } from "zod";

export interface BehavioralDimension {
  name: string;
  score: number;
  context: string;
  description: string;
  evidence?: string;
}

export const BehavioralDimensionSchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(100),
  context: z.string().min(1),
  description: z.string().min(1),
  evidence: z.string().optional(),
});
