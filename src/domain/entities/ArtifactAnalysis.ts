import type { PersonaResponse } from './PersonaResponse'

export type AnalysisStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | 'CANCELLED'

export type AnalysisProgressStep =
  | 'STARTING'
  | 'INTAKE'
  | 'ANALYZING'
  | 'DONE'
  | 'ERROR'
  | 'CANCELLED'

export interface ArtifactAnalysis {
    id: string
    name: string
    artifactType: 'url' | 'screenshot'
    artifactUrl?: string
    status: AnalysisStatus
    businessGoal: string
    researchQuestion: string
    batchId?: string
    batchName?: string
    personaCount: number
    personaNames?: string[]
    createdAt: string
    completedAt?: string
    currentStep?: AnalysisProgressStep
    completedResponses?: number
    totalResponses?: number
    responses?: PersonaResponse[]
    screenshot?: string
    streamingTexts?: Record<string, string>
    error?: string
}

export function generateAnalysisName(artifactUrl: string, batchName?: string): string {
    if (artifactUrl === "Screenshot Upload") {
        return batchName
            ? `"${batchName}" — Screenshot`
            : 'Analysis — Screenshot'
    }
    try {
        const hostname = new URL(artifactUrl.startsWith('http') ? artifactUrl : `https://${artifactUrl}`).hostname
        const siteName = hostname.replace(/^www\./, '').split('.')[0]
        return batchName
            ? `"${batchName}" on ${siteName}`
            : `Analysis — ${siteName}`
    } catch {
        return batchName
            ? `"${batchName}" — ${artifactUrl}`
            : `Analysis — ${artifactUrl}`
    }
}
