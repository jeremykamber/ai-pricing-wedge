'use client'

import { useRouter } from 'next/navigation'
import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'
import { SetupView } from './views/SetupView'

export function NewBatchPage() {
  const router = useRouter()
  const personaFlow = usePersonaFlow()

  return (
    <SetupView personaFlow={personaFlow} onBack={() => router.push('/dashboard')} />
  )
}
