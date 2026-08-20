'use client'

import { AnalysisToaster } from './SimulationToaster'
import { PersonaProgressToaster } from './PersonaProgressToaster'

export function ToasterProvider() {
  return (
    <>
      <AnalysisToaster />
      <PersonaProgressToaster />
    </>
  )
}
