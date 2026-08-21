import { useState, useEffect, useRef } from 'react'
import { Persona } from '@/domain/entities/Persona'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'
import { analyzeArtifactAction } from '@/actions/analyzeArtifactAction'
import type { ArtifactInput } from '@/infrastructure/adapters/ArtifactIntakeAdapter'
import { getAnalysisResultAction } from '@/actions/getAnalysisResult'
import { getProgressAction } from '@/actions/getProgress'
import { getScreenshotAction } from '@/actions/getScreenshot'
import { readStreamableValue } from '@ai-sdk/rsc'
import type { AnalysisProgressStep } from '@/domain/entities/ArtifactAnalysis'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import { generateAnalysisName } from '@/domain/entities/ArtifactAnalysis'

export interface AnalysisProgress {
  step: AnalysisProgressStep | 'DONE' | 'ERROR' | 'CANCELLED'
  screenshot?: string
  personaName?: string
  completedCount?: number
  totalCount?: number
  error?: string
  analyses?: PersonaResponse[]
  synthesis?: ArtifactSynthesis
}

export function useAnalysisFlow(onSuccess?: (analyses: PersonaResponse[]) => void) {
  const [artifactUrl, setArtifactUrl] = useState('')
  const [artifactImageBase64, setArtifactImageBase64] = useState<string | null>(null)
  const [businessGoal, setBusinessGoal] = useState('')
  const [researchQuestion, setResearchQuestion] = useState('')
  const [analyses, setAnalyses] = useState<PersonaResponse[] | null>(null)
  const [synthesis, setSynthesis] = useState<ArtifactSynthesis | null>(null)
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
    setIsPending(false)
    setCurrentRequestId(null)
    setAnalysisProgress(null)
    setError('Analysis cancelled by user')
  }

  const handleAnalyzeArtifact = (
    personas: Persona[],
    overrideInput?: ArtifactInput,
    overrideBusinessGoal?: string,
    overrideResearchQuestion?: string,
    batchId?: string,
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

    const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const resolvedInput: ArtifactInput = activeInput || (artifactImageBase64
      ? { type: 'screenshot', imageBase64: artifactImageBase64, url: artifactUrl || undefined }
      : { type: 'url', url: artifactUrl })

    useAnalysisStore.getState().addAnalysis({
      id: analysisId,
      name: generateAnalysisName('url' in resolvedInput ? resolvedInput.url || 'Screenshot Upload' : 'Screenshot Upload'),
      url: 'url' in resolvedInput ? resolvedInput.url || '' : '',
      status: 'IN_PROGRESS',
      personaCount: personas.length,
      personaNames: personas.map((p) => p.name),
      createdAt: new Date().toISOString(),
      currentStep: 'STARTING',
      completedResponses: 0,
      totalResponses: personas.length,
      batchId,
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
          analysisId,
        )
        setCurrentRequestId(requestId)

        if (requestId) {
          screenshotPollInterval = setInterval(async () => {
            try {
              const result = await getScreenshotAction(requestId)
              if (result.found && result.base64) {
                useAnalysisStore.getState().updateAnalysis(analysisId, {
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
              useAnalysisStore.getState().markCancelled(analysisId)
              if (mountedRef.current) {
                setAnalysisProgress(null)
                setCurrentRequestId(null)
                setError('Analysis was cancelled')
              }
              return
            }

            if (update.step === 'ERROR') {
              clearScreenshotPoll()
              useAnalysisStore.getState().markError(analysisId, update.error ?? 'Analysis failed')
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
              const synth = (update as any).synthesis as ArtifactSynthesis | undefined
              useAnalysisStore.getState().markComplete(analysisId, results ?? [])
              if (mountedRef.current) {
                setAnalyses(results ?? null)
                setSynthesis(synth ?? null)
                setAnalysisProgress(null)
                setCurrentRequestId(null)
              }
              if (results && onSuccess) onSuccess(results)
              return
            }

            useAnalysisStore.getState().updateAnalysis(analysisId, {
              currentStep: update.step as any,
              completedResponses: update.completedCount,
              ...(update.screenshot ? { screenshot: update.screenshot } : {}),
              ...(update.title ? { name: update.title } : {}),
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
              const progressResult = await getProgressAction(analysisId)
              if (progressResult.found && progressResult.progress) {
                const p = progressResult.progress
                useAnalysisStore.getState().updateAnalysis(analysisId, {
                  currentStep: (p.step as any) ?? undefined,
                  completedResponses: p.completedCount ?? p.completedResponses,
                  ...(p.title ? { name: p.title } : {}),
                })
              }
            } catch { /* non-critical */ }
          }

          try {
            const result = await getAnalysisResultAction(analysisId)
            if (!result.found) continue
            clearScreenshotPoll()

            if (result.error) {
              useAnalysisStore.getState().markError(analysisId, result.error)
              if (mountedRef.current) {
                setError(result.error)
                setAnalysisProgress(null)
                setCurrentRequestId(null)
              }
              return
            }

            const responses = result.analyses ?? []
            useAnalysisStore.getState().markComplete(analysisId, responses)
            if (mountedRef.current) {
              setAnalyses(responses)
              setAnalysisProgress(null)
              setCurrentRequestId(null)
            }
            if (responses.length > 0 && onSuccess) onSuccess(responses)
            return
          } catch { /* retry */ }
        }

        clearScreenshotPoll()
        if (mountedRef.current && !controller.signal.aborted) {
          setError('Analysis timed out. Please try again.')
          useAnalysisStore.getState().markError(analysisId, 'Timed out after 600 polling attempts')
          setAnalysisProgress(null)
          setCurrentRequestId(null)
        }
      } catch (err) {
        clearScreenshotPoll()
        useAnalysisStore.getState().markError(analysisId, (err as Error).message)
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
    synthesis,
    setSynthesis,
    error,
    setError,
    isPending,
    analysisProgress,
    handleAnalyzeArtifact,
    handleCancel,
  }
}
