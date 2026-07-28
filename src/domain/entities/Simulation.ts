import type { AnalysisProgressStep } from '@/domain/entities/ArtifactAnalysis'
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
}

export function generateSimulationName(url: string, batchName?: string): string {
    if (url === "Screenshot Upload") {
        return batchName
            ? `"${batchName}" — Screenshot`
            : 'Pricing Analysis — Screenshot'
    }
    try {
        const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
        const siteName = hostname.replace(/^www\./, '').split('.')[0]
        return batchName
            ? `"${batchName}" on ${siteName}`
            : `Pricing Analysis — ${siteName}`
    } catch {
        const label = url || 'Pricing Page'
        return batchName
            ? `"${batchName}" — ${label}`
            : `Pricing Analysis — ${label}`
    }
}
