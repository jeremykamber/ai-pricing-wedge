'use client'

import { AnalysisToaster } from './AnalysisToaster'
import { PersonaProgressToaster } from './PersonaProgressToaster'

export function ToasterProvider() {
  return (
    <>
      <AnalysisToaster />
      <PersonaProgressToaster />
    </>
  )
}
