'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClockIcon, GlobeIcon, UsersIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon, PlusIcon, UploadIcon, ImageIcon, LinkIcon, TargetIcon, HelpCircleIcon } from 'lucide-react'
import { Persona } from '@/domain/entities/Persona'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InlineRenamable } from '@/components/custom/InlineRenamable'

function AnalysisCard({ analysis }: { analysis: import('@/domain/entities/ArtifactAnalysis').ArtifactAnalysis }) {
  const router = useRouter()
  const removeAnalysis = useAnalysisStore((s) => s.removeAnalysis)
  const updateAnalysis = useAnalysisStore((s) => s.updateAnalysis)

  const statusConfig = {
    IN_PROGRESS: { label: 'In Progress', icon: ClockIcon, class: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    COMPLETED: { label: 'Completed', icon: CheckCircleIcon, class: 'text-green-500 bg-green-500/10 border-green-500/20' },
    ERROR: { label: 'Error', icon: XCircleIcon, class: 'text-destructive bg-destructive/10 border-destructive/20' },
    CANCELLED: { label: 'Cancelled', icon: AlertCircleIcon, class: 'text-muted-foreground bg-muted/30 border-muted/40' },
  }[analysis.status]

  const StatusIcon = statusConfig.icon

  return (
    <div className="relative group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/dashboard/analyses/${analysis.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            router.push(`/dashboard/analyses/${analysis.id}`)
          }
        }}
        className="w-full text-left rounded-lg border border-border bg-card p-5 transition-all hover:border-border/80 hover:shadow-sm cursor-pointer"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <InlineRenamable
                value={analysis.name}
                onRename={(name) => updateAnalysis(analysis.id, { name })}
                className="min-w-0"
              />
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig.class}`}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
                {analysis.status === 'IN_PROGRESS' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                )}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <GlobeIcon className="h-3 w-3" />
                {analysis.url}
              </span>
              <span className="flex items-center gap-1">
                <UsersIcon className="h-3 w-3" />
                {analysis.personaCount} personas
              </span>
            </div>
            {analysis.batchName && (
              <p className="text-xs text-muted-foreground/70">Batch: {analysis.batchName}</p>
            )}
            {analysis.status === 'COMPLETED' && (
              <p className="text-xs text-muted-foreground mt-1">
                {analysis.completedAt && `Completed ${new Date(analysis.completedAt).toLocaleDateString()}`}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(analysis.createdAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {analysis.completedAt && analysis.status !== 'IN_PROGRESS' && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 whitespace-nowrap">
                {new Date(analysis.completedAt).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
        {analysis.status === 'IN_PROGRESS' && analysis.totalResponses && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{analysis.completedResponses ?? 0}/{analysis.totalResponses} analyses</span>
              <span className="tabular-nums font-medium">{Math.round(((analysis.completedResponses ?? 0) / analysis.totalResponses) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((analysis.completedResponses ?? 0) / analysis.totalResponses) * 100}%` }}
              />
            </div>
          </div>
        )}
        {analysis.error && (
          <p className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">{analysis.error}</p>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          removeAnalysis(analysis.id)
        }}
        className="absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-destructive focus:outline-none"
        aria-label="Delete analysis"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

function NewAnalysisForm({ onRun }: { onRun: (url: string, personas: Persona[], imageBase64?: string, businessGoal?: string, researchQuestion?: string) => void }) {
  const batches = usePersonaStore((s) => s.batches)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [url, setUrl] = useState('')
  const [businessGoal, setBusinessGoal] = useState('')
  const [researchQuestion, setResearchQuestion] = useState('')

  // Sync selected batch when batches hydrate or change
  useEffect(() => {
    if (batches.length > 0 && !batches.find((b) => b.id === selectedBatchId)) {
      setSelectedBatchId(batches[0].id) // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [batches, selectedBatchId])

  const selectedBatch = batches.find((b) => b.id === selectedBatchId)

  const [inputMode, setInputMode] = useState<'url' | 'screenshot'>('url')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageBase64Ref = useRef<string | null>(null)

  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
  const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

  const validateAndReadFile = useCallback((file: File) => {
    setValidationError(null)

    if (!ACCEPTED_TYPES.includes(file.type as any)) {
      setValidationError('Only PNG, JPG, and WEBP images are accepted.')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setValidationError('Image must be under 10 MB.')
      return
    }

    setScreenshotFile(file)
    setScreenshotPreview(URL.createObjectURL(file))

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImageBase64(result)
      imageBase64Ref.current = result
    }
    reader.onerror = () => {
      setValidationError('Failed to read file. Please try again.')
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndReadFile(file)
  }, [validateAndReadFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) validateAndReadFile(file)
  }, [validateAndReadFile])

  const removeScreenshot = useCallback(() => {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    setImageBase64(null)
    imageBase64Ref.current = null
    setValidationError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleSubmit = () => {
    if (!selectedBatch) return

    if (inputMode === 'url') {
      if (!url.trim()) return
      onRun(url, selectedBatch.personas, undefined, businessGoal, researchQuestion)
    } else {
      if (!imageBase64Ref.current) return
      onRun('Screenshot Upload', selectedBatch.personas, imageBase64Ref.current, businessGoal, researchQuestion)
    }
  }

  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>Create a persona batch first, then come back to run an analysis.</p>
          <Button asChild variant="default" size="sm" className="w-fit">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="batch-select" className="text-sm font-medium">Persona Batch</label>
          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
            <SelectTrigger id="batch-select">
              <SelectValue placeholder="Select a batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.label} — {batch.personas.length} personas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* ── Input mode toggle ──────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setInputMode('url')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                inputMode === 'url'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              URL
            </button>
            <button
              type="button"
              onClick={() => setInputMode('screenshot')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                inputMode === 'screenshot'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Screenshot
            </button>
          </div>

          {inputMode === 'url' ? (
            /* ── URL mode ──────────────────────────────────────── */
            <div className="flex flex-col gap-2">
              <label htmlFor="artifact-url" className="text-sm font-medium">Artifact URL</label>
              <Input
                id="artifact-url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          ) : (
            /* ── Screenshot mode ──────────────────────────────── */
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Artifact Screenshot</label>
              {!screenshotFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground cursor-pointer ${
                    isDragOver ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <UploadIcon className="h-6 w-6" />
                  Drop a screenshot or click to browse
                  <span className="text-xs text-muted-foreground/70">PNG, JPG, or WEBP — under 10 MB</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  {screenshotPreview && (
                    <img
                      src={screenshotPreview}
                      alt="Screenshot preview"
                      className="h-14 w-14 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{screenshotFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(screenshotFile.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeScreenshot}
                    className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove screenshot"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileInput}
                className="hidden"
              />
              {validationError && (
                <p className="text-xs text-destructive">{validationError}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="business-goal" className="text-sm font-medium flex items-center gap-1.5">
            <TargetIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Business Goal
          </label>
          <Textarea
            id="business-goal"
            placeholder="What is this artifact trying to accomplish? e.g. Convince visitors to book a demo, explain product value, encourage signup"
            value={businessGoal}
            onChange={(e) => setBusinessGoal(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="research-question" className="text-sm font-medium flex items-center gap-1.5">
            <HelpCircleIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Research Question
          </label>
          <Textarea
            id="research-question"
            placeholder="What do you want to learn? e.g. Why would users leave? What creates trust? How would enterprise buyers react?"
            value={researchQuestion}
            onChange={(e) => setResearchQuestion(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </div>

        <Button
          disabled={
            inputMode === 'url'
              ? !url.trim()
              : !imageBase64Ref.current
          }
          onClick={handleSubmit}
        >
          Run Analysis
        </Button>
      </CardContent>
    </Card>
  )
}

export default function AnalysesPage() {
  const analyses = useAnalysisStore((s) => s.analyses)
  const analysisFlow = useAnalysisFlow()
  const [showNewForm, setShowNewForm] = useState(false)

  const inProgress = analyses.filter((s) => s.status === 'IN_PROGRESS')
  const completed = analyses.filter((s) => s.status !== 'IN_PROGRESS')

  const handleRunAnalysis = (url: string, personas: Persona[], imageBase64?: string, businessGoal?: string, researchQuestion?: string) => {
    const input = imageBase64
      ? { type: 'screenshot' as const, imageBase64, url }
      : { type: 'url' as const, url }
    analysisFlow.setArtifactUrl(url)
    if (imageBase64) analysisFlow.setArtifactImageBase64(imageBase64)
    if (businessGoal) analysisFlow.setBusinessGoal(businessGoal)
    if (researchQuestion) analysisFlow.setResearchQuestion(researchQuestion)
    analysisFlow.handleAnalyzeArtifact(personas, input, businessGoal, researchQuestion)
    setShowNewForm(false)
  }

  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Analyses</h1>
          <p className="text-sm text-muted-foreground">
            {analyses.length === 0
              ? 'No analyses yet. Run your first analysis to get started.'
              : `${completed.length} completed · ${inProgress.length} in progress`}
          </p>
        </div>
        <Button
          onClick={() => setShowNewForm(!showNewForm)}
          size="sm"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Run New Analysis
        </Button>
      </div>

      {showNewForm && (
        <NewAnalysisForm onRun={handleRunAnalysis} />
      )}

      {analysisFlow.isPending && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-600 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          Analysis is running…
          <Link
            href="/dashboard/analyses"
            className="ml-auto text-xs font-medium text-blue-600 hover:underline"
          >
            Refresh
          </Link>
        </div>
      )}

      {inProgress.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </h2>
          <div className="flex flex-col gap-3">
            {inProgress.map((sim) => (
              <AnalysisCard key={sim.id} analysis={sim} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Completed
          </h2>
          <div className="flex flex-col gap-3">
            {completed.map((sim) => (
              <AnalysisCard key={sim.id} analysis={sim} />
            ))}
          </div>
        </section>
      )}

      {analyses.length === 0 && !showNewForm && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
            <ClockIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm max-w-sm">
            No analyses yet. Click "Run New Analysis" above to get started.
          </p>
        </div>
      )}
    </div>
  )
}
