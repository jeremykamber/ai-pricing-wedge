export interface ArtifactSynthesis {
  overview: string
  researchQuestionAnswer: string
  topFindings: SynthesizedFinding[]
  disagreements: Disagreement[]
  biggestFrictions: string[]
  completedCount: number
  failedCount: number
  totalPersonaCount: number
}

export interface SynthesizedFinding {
  observation: string
  evidence: string
  impact: string
  confidence: 'strongly supported' | 'some support' | 'weakly supported'
  affectedPersonaCount: number
  totalPersonaCount: number
}

export interface Disagreement {
  topic: string
  split: { view: string; personaCount: number }[]
  significance: 'High' | 'Medium' | 'Low'
}
