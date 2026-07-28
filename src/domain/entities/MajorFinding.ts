export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface MajorFinding {
  observation: string;
  evidence: string;
  impact: string;
  confidence: ConfidenceLevel;
}
