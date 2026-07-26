import { useState, useEffect, useRef, useCallback } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { generatePersonasAction } from '@/actions/generatePersonas'
import { getPersonaGenerationResultAction } from '@/actions/getPersonaGenerationResult'
import { getProgressAction } from '@/actions/getProgress'
import { usePersonaStore, type PersonaBatch } from '@/ui/stores/personaStore'
import { readStreamableValue } from '@ai-sdk/rsc'

export type PersonaProgressStep = 'BRAINSTORMING_PERSONAS' | 'GENERATING_BACKSTORIES' | 'ADDING_BEHAVIORAL_DEPTH' | 'GENERATING_INSIGHTS' | 'DONE' | 'ERROR'

export interface PersonaProgress {
  step: PersonaProgressStep
  streamingText?: string
  personaName?: string
  completedCount?: number
  totalCount?: number
  completedSubSteps?: number
  totalSubSteps?: number
  personas?: Persona[]
  error?: string
}

export function usePersonaFlow(onSuccess?: (personas: Persona[]) => void) {
  const [customerProfile, setCustomerProfile] = useState('')
  const [personaCount, setPersonaCount] = useState(5)
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [personaProgress, setPersonaProgress] = useState<PersonaProgress | null>(null)
  const [lastCompletedBatchId, setLastCompletedBatchId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setPersonaProgress(null)
    setError('Persona generation cancelled')
    setIsPending(false)
  }, [])

  const handleClearProgress = useCallback(() => {
    setPersonaProgress(null)
    abortControllerRef.current = null
    setIsPending(false)
  }, [])

  // ── Polling helper — runs in a useEffect triggered by runId ────────────
  const [runId, setRunId] = useState<string | null>(null)

  useEffect(() => {
    if (!runId) return

    const controller = abortControllerRef.current
    let cancelled = false
    let progressInterval: ReturnType<typeof setInterval> | null = null

    // Progress polling (fires immediately, then every 2s)
    const pollProgress = async () => {
      if (controller?.signal.aborted || !mountedRef.current || cancelled) return
      try {
        const p = await getProgressAction(runId)
        if (p.found && p.progress && mountedRef.current) {
          setPersonaProgress({
            step: (p.progress.step as PersonaProgressStep) || 'BRAINSTORMING_PERSONAS',
            streamingText: p.progress.streamingText,
            personaName: p.progress.personaName,
            completedCount: p.progress.completedCount ?? p.progress.completedAnalyses,
            totalCount: p.progress.totalCount ?? p.progress.totalAnalyses,
          })
        }
      } catch { /* non-critical */ }
    }
    pollProgress()
    progressInterval = setInterval(pollProgress, 2000)

    ;(async () => {
      for (let attempt = 0; attempt < 300; attempt++) {
        if (controller?.signal.aborted || !mountedRef.current || cancelled) break
        await new Promise((r) => setTimeout(r, 2000))

        try {
          const pollResult = await getPersonaGenerationResultAction(runId)
          if (!pollResult.found) continue

          cancelled = true
          if (progressInterval) clearInterval(progressInterval)

          // Don't removeActiveGeneration here — the background toaster
          // (PersonaProgressToaster) detects completion independently and
          // owns cleanup. The runId stays in activeGenerationRunIds until
          // the toast is dismissed or the user explicitly cancels.

          if (pollResult.error) {
            if (mountedRef.current) {
              setError(pollResult.error)
              setPersonaProgress(null)
              abortControllerRef.current = null
            }
            return
          }

          if (pollResult.personas && pollResult.personas.length > 0) {
            const batch: PersonaBatch = {
              id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              label: `"${customerProfile.slice(0, 40)}${customerProfile.length > 40 ? '...' : ''}"`,
              source: 'description',
              createdAt: new Date().toISOString(),
              personas: pollResult.personas,
            }
            usePersonaStore.getState().addBatch(batch)
            if (mountedRef.current) {
              setLastCompletedBatchId(batch.id)
              setPersonas(pollResult.personas)
              setPersonaProgress({ step: 'DONE', personas: pollResult.personas, completedCount: pollResult.personas.length, totalCount: pollResult.personas.length })
              abortControllerRef.current = null
            }
            if (onSuccess) onSuccess(pollResult.personas)
            return
          }
        } catch { /* retry */ }
      }

      // Only set timeout error if we actually timed out (not cancelled)
      if (!cancelled && !controller?.signal.aborted) {
        if (progressInterval) clearInterval(progressInterval)
        if (mountedRef.current) {
          setError('Persona generation timed out. Please try again.')
          setPersonaProgress(null)
          abortControllerRef.current = null
        }
      }
    })()

    return () => {
      cancelled = true
      if (progressInterval) clearInterval(progressInterval)
    }
  }, [runId, customerProfile, onSuccess])

  // ── Generate handler ───────────────────────────────────────────────────
  const handleGeneratePersonas = useCallback((promptOverride?: string) => {
    const prompt = promptOverride ?? customerProfile
    if (!prompt.trim()) return

    setError(null)
    setRunId(null)
    setLastCompletedBatchId(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setPersonaProgress({ step: 'BRAINSTORMING_PERSONAS' })
    setIsPending(true)

    ;(async () => {
      try {
        const result: any = await generatePersonasAction(prompt, personaCount)
        const streamData = result.streamData
        const id = result.runId as string | undefined
        setIsPending(false) // core action returned — release loading state

        if (id) {
          usePersonaStore.getState().addActiveGeneration(id)
        }

        if (streamData) {
          for await (const update of readStreamableValue<any>(streamData)) {
            if (!update) continue

            if (update.step === 'ERROR') {
              if (mountedRef.current) {
                setError(update.error)
                setPersonaProgress(null)
                abortControllerRef.current = null
              }
              return
            }

            if (update.step === 'DONE') {
              const label = promptOverride
                ? promptOverride.slice(0, 60)
                : customerProfile.slice(0, 40)
              const batch: PersonaBatch = {
                id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                label: `"${label}${label.length >= 60 ? '...' : ''}"`,
                source: 'description',
                createdAt: new Date().toISOString(),
                personas: update.personas!,
              }
              usePersonaStore.getState().addBatch(batch)
              if (mountedRef.current) {
                setLastCompletedBatchId(batch.id)
                setPersonas(update.personas)
                setPersonaProgress({ step: 'DONE', personas: update.personas, completedCount: update.personas!.length, totalCount: update.personas!.length })
                abortControllerRef.current = null
              }
              if (onSuccess) onSuccess(update.personas)
              return
            }

            if (mountedRef.current) {
              setPersonaProgress(update as PersonaProgress)
            }
          }
        } else if (id) {
          setRunId(id)
        }
      } catch (err) {
        setIsPending(false)
        if (mountedRef.current && !controller.signal.aborted) {
          setError((err as Error).message)
          setPersonaProgress(null)
          abortControllerRef.current = null
        }
      }
    })()
  }, [customerProfile, personaCount, onSuccess])

  return {
    customerProfile,
    setCustomerProfile,
    personaCount,
    setPersonaCount,
    personas,
    setPersonas,
    error,
    setError,
    isPending,
    personaProgress,
    lastCompletedBatchId,
    handleGeneratePersonas,
    handleCancel,
    handleClearProgress,
  }
}
