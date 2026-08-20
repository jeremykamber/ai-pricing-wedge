import type { PersonaResponse } from './PersonaResponse'
import type { ArtifactSynthesis } from './ArtifactSynthesis'

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
    url: string
    status: AnalysisStatus
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
    synthesis?: ArtifactSynthesis
}

export function generateAnalysisName(url: string, batchName?: string): string {
    if (url === "Screenshot Upload") {
        return batchName
            ? `"${batchName}" — Screenshot`
            : 'Analysis — Screenshot'
    }
    try {
        const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
        const siteName = hostname.replace(/^www\./, '').split('.')[0]
        return batchName
            ? `"${batchName}" on ${siteName}`
            : `Analysis — ${siteName}`
    } catch {
        return batchName
            ? `"${batchName}" — ${url}`
            : `Analysis — ${url}`
    }
}
