import type { AnalysisProgressStep } from '@/domain/entities/ArtifactAnalysis'
import { generateAnalysisName } from '@/domain/entities/ArtifactAnalysis'
type PricingAnalysisProgressStep = AnalysisProgressStep

export type SimulationStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | 'CANCELLED'

export interface Simulation {
    id: string
    name: string
    url: string
    status: SimulationStatus
    batchId?: string
    batchName?: string
    personaCount: number
    personaNames?: string[]
    createdAt: string
    completedAt?: string
    currentStep?: PricingAnalysisProgressStep
    completedAnalyses?: number
    totalAnalyses?: number
    analyses?: any[]
    screenshot?: string
    streamingTexts?: Record<string, string>
    error?: string
    synthesis?: import('@/domain/entities/ArtifactSynthesis').ArtifactSynthesis
}

export function generateSimulationName(url: string, batchName?: string): string {
    return generateAnalysisName(url, batchName)
}
