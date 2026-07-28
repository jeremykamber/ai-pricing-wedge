import { useState, useEffect, useRef } from 'react'
import { Persona } from '@/domain/entities/Persona'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import { analyzeArtifactAction } from '@/actions/analyzeArtifactAction'
import type { ArtifactInput } from '@/infrastructure/adapters/ArtifactIntakeAdapter'
import { getSimulationResultAction } from '@/actions/getSimulationResult'
import { getProgressAction } from '@/actions/getProgress'
import { getScreenshotAction } from '@/actions/getScreenshot'
import { readStreamableValue } from '@ai-sdk/rsc'
import type { AnalysisProgressStep } from '@/domain/entities/ArtifactAnalysis'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import { generateSimulationName } from '@/domain/entities/Simulation'

export interface AnalysisProgress {
  step: AnalysisProgressStep | 'DONE' | 'ERROR' | 'CANCELLED'
  screenshot?: string
  personaName?: string
  completedCount?: number
  totalCount?: number
  error?: string
  analyses?: PersonaResponse[]
}

export function useAnalysisFlow(onSuccess?: (analyses: PersonaResponse[]) => void) {
  const [artifactUrl, setArtifactUrl] = useState('')
  const [artifactImageBase64, setArtifactImageBase64] = useState<string | null>(null)
  const [businessGoal, setBusinessGoal] = useState('')
  const [researchQuestion, setResearchQuestion] = useState('')
  const [analyses, setAnalyses] = useState<PersonaResponse[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)

  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const handleCancel = async () => {
    const { cancelRequestAction } = await import('@/actions/cancelRequest')
    if (currentRequestId) {
      await cancelRequestAction(currentRequestId)
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setCurrentRequestId(null)
    setAnalysisProgress(null)
    setError('Analysis cancelled by user')
  }

  const handleAnalyzeArtifact = (
    personas: Persona[],
    overrideInput?: ArtifactInput,
    overrideBusinessGoal?: string,
    overrideResearchQuestion?: string,
  ) => {
    const activeGoal = (overrideBusinessGoal || businessGoal).trim()
    const activeQuestion = (overrideResearchQuestion || researchQuestion).trim()
    const activeInput = overrideInput

    if (!activeInput) {
      const activeUrl = artifactUrl.trim()
      const activeImage = artifactImageBase64
      if (!activeUrl && !activeImage) return
      if (!personas || personas.length === 0) return
    }

    if (!personas || personas.length === 0) return

    setError(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setAnalysisProgress({ step: 'STARTING' })

    const simulationId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const resolvedInput: ArtifactInput = activeInput || (artifactImageBase64
      ? { type: 'screenshot', imageBase64: artifactImageBase64, url: artifactUrl || undefined }
      : { type: 'url', url: artifactUrl })

    useSimulationStore.getState().addSimulation({
      id: simulationId,
      name: generateSimulationName('url' in resolvedInput ? resolvedInput.url || 'Screenshot Upload' : 'Screenshot Upload'),
      url: 'url' in resolvedInput ? resolvedInput.url || '' : '',
      status: 'IN_PROGRESS',
      personaCount: personas.length,
      personaNames: personas.map((p) => p.name),
      createdAt: new Date().toISOString(),
      currentStep: 'STARTING',
      completedAnalyses: 0,
      totalAnalyses: personas.length,
    })

    setIsPending(true)
    ;(async () => {
      let screenshotPollInterval: ReturnType<typeof setInterval> | null = null
      const clearScreenshotPoll = () => {
        if (screenshotPollInterval) {
          clearInterval(screenshotPollInterval)
          screenshotPollInterval = null
        }
      }

      try {
        const { streamData, requestId } = await analyzeArtifactAction(
          resolvedInput,
          personas,
          activeGoal,
          activeQuestion,
          simulationId,
        )
        setCurrentRequestId(requestId)

        if (requestId) {
          screenshotPollInterval = setInterval(async () => {
            try {
              const result = await getScreenshotAction(requestId)
              if (result.found && result.base64) {
                useSimulationStore.getState().updateSimulation(simulationId, {
                  screenshot: result.base64,
                })
              }
            } catch { /* non-critical */ }
          }, 2000)
        }

        if (streamData) {
          for await (const update of readStreamableValue(streamData)) {
            if (controller.signal.aborted) {
              clearScreenshotPoll()
              return
            }
            if (!update) continue

            if (update.step === 'CANCELLED') {
              clearScreenshotPoll()
              useSimulationStore.getState().markCancelled(simulationId)
              if (mountedRef.current) {
                setAnalysisProgress(null)
                setCurrentRequestId(null)
                setError('Analysis was cancelled')
              }
              return
            }

            if (update.step === 'ERROR') {
              clearScreenshotPoll()
              useSimulationStore.getState().markError(simulationId, update.error ?? 'Analysis failed')
              if (mountedRef.current) {
                setError(update.error)
                setAnalysisProgress(null)
                setCurrentRequestId(null)
              }
              return
            }

            if (update.step === 'DONE') {
              clearScreenshotPoll()
              const results = update.analyses as PersonaResponse[] | undefined
              useSimulationStore.getState().markComplete(simulationId, results ?? [])
              if (mountedRef.current) {
                setAnalyses(results ?? null)
                setAnalysisProgress(null)
                setCurrentRequestId(null)
              }
              if (results && onSuccess) onSuccess(results)
              return
            }

            useSimulationStore.getState().updateSimulation(simulationId, {
              currentStep: update.step as any,
              completedAnalyses: update.completedCount,
              ...(update.screenshot ? { screenshot: update.screenshot } : {}),
            })

            if (mountedRef.current) {
              setAnalysisProgress(update as AnalysisProgress)
            }
          }
          clearScreenshotPoll()
        }

        // Fallback polling for VPS / stream-disconnected
        for (let attempt = 0; attempt < 600; attempt++) {
          if (!mountedRef.current || controller.signal.aborted) break
          await new Promise((r) => setTimeout(r, 1000))

          if (attempt % 3 === 0) {
            try {
              const progressResult = await getProgressAction(simulationId)
              if (progressResult.found && progressResult.progress) {
                const p = progressResult.progress
                useSimulationStore.getState().updateSimulation(simulationId, {
                  currentStep: (p.step as any) ?? undefined,
                  completedAnalyses: p.completedCount ?? p.completedAnalyses,
                })
              }
            } catch { /* non-critical */ }
          }

          try {
            const result = await getSimulationResultAction(simulationId)
            if (!result.found) continue
            clearScreenshotPoll()
            if (result.error) {
              useSimulationStore.getState().markError(simulationId, result.error)
            } else if (result.analyses && result.analyses.length > 0) {
              useSimulationStore.getState().markComplete(simulationId, result.analyses)
            }
            if (mountedRef.current) {
              setAnalyses(result.analyses ?? null)
              setAnalysisProgress(null)
              setCurrentRequestId(null)
            }
            if (result.analyses && onSuccess) onSuccess(result.analyses)
            return
          } catch { /* retry */ }
        }

        clearScreenshotPoll()
        if (mountedRef.current && !controller.signal.aborted) {
          setError('Analysis timed out. Please try again.')
          useSimulationStore.getState().markError(simulationId, 'Timed out after 600 polling attempts')
          setAnalysisProgress(null)
          setCurrentRequestId(null)
        }
      } catch (err) {
        clearScreenshotPoll()
        useSimulationStore.getState().markError(simulationId, (err as Error).message)
        if (mountedRef.current) {
          if (!controller.signal.aborted) {
            setError((err as Error).message)
          }
          setAnalysisProgress(null)
          setCurrentRequestId(null)
        }
      } finally {
        setIsPending(false)
      }
    })()
  }

  return {
    artifactUrl,
    setArtifactUrl,
    artifactImageBase64,
    setArtifactImageBase64,
    businessGoal,
    setBusinessGoal,
    researchQuestion,
    setResearchQuestion,
    analyses,
    setAnalyses,
    error,
    setError,
    isPending,
    analysisProgress,
    handleAnalyzeArtifact,
    handleCancel,
  }
}
