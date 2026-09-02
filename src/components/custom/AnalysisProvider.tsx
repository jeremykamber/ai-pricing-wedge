'use client'

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import type { AnalysisProgress } from '@/ui/hooks/useAnalysisFlow'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { Persona } from '@/domain/entities/Persona'
import type { ArtifactInput } from '@/infrastructure/adapters/ArtifactIntakeAdapter'

interface AnalysisContextValue {
  artifactUrl: string
  setArtifactUrl: Dispatch<SetStateAction<string>>
  artifactImageBase64: string | null
  setArtifactImageBase64: Dispatch<SetStateAction<string | null>>
  businessGoal: string
  setBusinessGoal: Dispatch<SetStateAction<string>>
  researchQuestion: string
  setResearchQuestion: Dispatch<SetStateAction<string>>
  analyses: PersonaResponse[] | null
  setAnalyses: Dispatch<SetStateAction<PersonaResponse[] | null>>
  error: string | null
  setError: Dispatch<SetStateAction<string | null>>
  isPending: boolean
  analysisProgress: AnalysisProgress | null
  handleAnalyzeArtifact: (personas: Persona[], input?: ArtifactInput, businessGoal?: string, researchQuestion?: string) => void
  handleCancel: () => Promise<void>
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null)

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const analysisFlow = useAnalysisFlow()

  return (
    <AnalysisContext.Provider value={analysisFlow as any}>
      {children}
    </AnalysisContext.Provider>
  )
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysis must be used within an AnalysisProvider')
  return ctx
}
