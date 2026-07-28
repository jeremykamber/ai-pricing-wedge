/**
 * Cross-persona synthesis computed from PersonaResponse[].
 * Not LLM-generated — derived from observed agreement patterns across personas.
 */
export interface ArtifactSynthesis {
  overview: string
  researchQuestionAnswer: string
  topFindings: SynthesizedFinding[]
  consensus: ConsensusArea[]
  disagreements: Disagreement[]
  biggestFrictions: string[]
  personaCount: number
}

export interface SynthesizedFinding {
  observation: string
  evidence: string
  impact: string
  confidence: 'High' | 'Medium' | 'Low'
  affectedPersonas: string[]
}

export interface ConsensusArea {
  topic: string
  agreement: string
  personaCount: number
  personaNames: string[]
}

export interface Disagreement {
  topic: string
  split: { view: string; personaNames: string[] }[]
  significance: 'High' | 'Medium' | 'Low'
}
