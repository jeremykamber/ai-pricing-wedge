import { useState, useRef, useEffect, useCallback } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { generatePersonasFromInterviewsAction } from '@/actions/generatePersonasFromInterviews'
import { getPersonaGenerationResultAction } from '@/actions/getPersonaGenerationResult'
import { getProgressAction } from '@/actions/getProgress'
import { usePersonaStore, type PersonaBatch } from '@/ui/stores/personaStore'
import { readStreamableValue } from '@ai-sdk/rsc'

export type InterviewProgressStep = 'UPLOADING' | 'EXTRACTING' | 'POOLING' | 'SAMPLING' | 'GENERATING' | 'INGESTING' | 'DONE' | 'ERROR'

export interface InterviewProgress {
  step: InterviewProgressStep
  current?: number
  total?: number
  message?: string
  personas?: Persona[]
  error?: string
}

export interface InterviewFile {
  id: string
  name: string
  content: string
}

export function useInterviewPipeline(onSuccess?: (personas: Persona[]) => void) {
  const [files, setFiles] = useState<InterviewFile[]>([])
  const [personaCount, setPersonaCount] = useState(3)
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [generationMode, setGenerationMode] = useState<'individual' | 'synthesized'>('individual')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [progress, setProgress] = useState<InterviewProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const addFile = (name: string, content: string) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setFiles(prev => [...prev, { id, name, content }])
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearFiles = () => setFiles([])

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setProgress(null)
    setError('Pipeline cancelled')
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
        if (p.found && p.progress && p.progress.step && mountedRef.current) {
          // ProgressState uses completedCount/totalCount; InterviewProgress uses current/total
          setProgress({
            step: p.progress.step as InterviewProgress['step'],
            current: p.progress.completedCount ?? p.progress.completedAnalyses,
            total: p.progress.totalCount ?? p.progress.totalAnalyses,
            message: p.progress.streamingText,
            error: p.progress.error,
          })
        }
      } catch { /* non-critical */ }
    }
    pollProgress()
    progressInterval = setInterval(pollProgress, 2000)

    // Result polling (every 2s, up to 10 min)
    ;(async () => {
      for (let attempt = 0; attempt < 300; attempt++) {
        if (controller?.signal.aborted || !mountedRef.current || cancelled) break
        await new Promise((r) => setTimeout(r, 2000))

        try {
          const pollResult = await getPersonaGenerationResultAction(runId)
          if (!pollResult.found) continue

          cancelled = true
          if (progressInterval) clearInterval(progressInterval)

          if (pollResult.error) {
            if (mountedRef.current) {
              setError(pollResult.error)
              setProgress(null)
              abortControllerRef.current = null
            }
            return
          }

          if (pollResult.personas && pollResult.personas.length > 0) {
            const batch: PersonaBatch = {
              id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              label: `${files.length} Interview${files.length !== 1 ? 's' : ''}${files.length > 0 ? ' (' + files[0].name + (files.length > 1 ? ` +${files.length - 1}` : '') + ')' : ''}`,
              source: 'interviews',
              transcriptCount: files.length,
              createdAt: new Date().toISOString(),
              personas: pollResult.personas!,
            }
            usePersonaStore.getState().addBatch(batch)
            if (mountedRef.current) {
              setPersonas(pollResult.personas)
              setProgress(null)
              abortControllerRef.current = null
            }
            if (onSuccess) onSuccess(pollResult.personas)
            return
          }
        } catch { /* retry */ }
      }

      // Exhausted 300 attempts (10 min)
      if (progressInterval) clearInterval(progressInterval)
      if (mountedRef.current) {
        setError('Persona generation timed out. Please try again.')
        setProgress(null)
        abortControllerRef.current = null
      }
    })()

    return () => {
      cancelled = true
      if (progressInterval) clearInterval(progressInterval)
    }
  }, [runId, files, onSuccess])

  // ── Submit handler ─────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (files.length === 0) return

    setError(null)
    setPersonas(null)
    setRunId(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setProgress({ step: 'UPLOADING' })
    setIsPending(true)

    ;(async () => {
      try {
        const formData = new FormData()
        for (const file of files) {
          const blob = new Blob([file.content], { type: 'text/plain' })
          formData.append('files', blob, file.name)
        }
        formData.append('count', String(personaCount))
        formData.append('mode', generationMode)

        const result: any = await generatePersonasFromInterviewsAction(formData)
        const streamData = result.streamData
        const id = result.runId as string | undefined
        setIsPending(false) // core action returned — release loading state

        if (id) {
          // Register for background toast tracking
          usePersonaStore.getState().addActiveGeneration(id)
        }

        if (streamData) {
          // ── Local dev: read streaming updates ───────────────────────
          for await (const update of readStreamableValue<any>(streamData)) {
            if (controller.signal.aborted || !mountedRef.current) {
              setProgress(null)
              abortControllerRef.current = null
              return
            }

            if (update) {
              if (update.step === 'ERROR') {
                if (mountedRef.current) {
                  setError(update.error)
                  setProgress(null)
                  abortControllerRef.current = null
                }
                return
              }

              if (update.step === 'DONE') {
                const batch: PersonaBatch = {
                  id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                  label: `${files.length} Interview${files.length !== 1 ? 's' : ''}${files.length > 0 ? ' (' + files[0].name + (files.length > 1 ? ` +${files.length - 1}` : '') + ')' : ''}`,
                  source: 'interviews',
                  transcriptCount: files.length,
                  createdAt: new Date().toISOString(),
                  personas: update.personas!,
                }
                usePersonaStore.getState().addBatch(batch)
                if (mountedRef.current) {
                  setPersonas(update.personas)
                  setProgress(null)
                  abortControllerRef.current = null
                }
                if (onSuccess) onSuccess(update.personas)
                return
              }

              if (mountedRef.current) {
                setProgress(update as InterviewProgress)
              }
            }
          }
        } else if (id) {
          // ── Remote/VPS: polling handled by useEffect above ─────────
          setRunId(id)
        }
      } catch (err) {
        setIsPending(false)
        if (!controller.signal.aborted && mountedRef.current) {
          setError((err as Error).message)
        }
        if (mountedRef.current) {
          setProgress(null)
          abortControllerRef.current = null
        }
      }
    })()
  }, [files, personaCount, onSuccess])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  return {
    files, addFile, removeFile, clearFiles,
    personaCount, setPersonaCount,
    generationMode, setGenerationMode,
    personas, setPersonas,
    error, setError,
    isPending,
    progress,
    handleSubmit,
    handleCancel,
  }
}
