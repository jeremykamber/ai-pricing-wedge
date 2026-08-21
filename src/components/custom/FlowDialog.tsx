"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StepIndicator } from "./StepIndicator"
import { Progress } from "@/components/ui/progress"

export interface FlowDialogStep {
  title: string
  description?: string
  /** Optional texts to cycle through every ~3s with fade while this step is active */
  cyclingTexts?: string[]
}

export interface FlowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  steps: FlowDialogStep[]
  currentStep: number
  children?: React.ReactNode
  transparentOverlay?: boolean
  progressPercent?: number
  streamingText?: string
  personaName?: string
  completedCount?: number
  totalCount?: number
}

export function FlowDialog({
  open,
  onOpenChange,
  title,
  description,
  steps,
  currentStep,
  children,
  transparentOverlay = false,
  progressPercent,
  streamingText,
  personaName,
  completedCount,
  totalCount
}: FlowDialogProps) {
  /// ── Streaming text cycling (per-step) ───────────────────────────────────
  const currentStepTexts = steps[currentStep]?.cyclingTexts
  const [textIndex, setTextIndex] = React.useState(0)
  const [isFading, setIsFading] = React.useState(false)
  const cycledText = currentStepTexts?.length
    ? currentStepTexts[textIndex % currentStepTexts.length]
    : null
  // Live streamingText (e.g. a retry status) is the primary caption;
  // per-step cycling texts animate only when no streamingText is set.
  const displayText = streamingText ?? (cycledText ?? null)
  // Sub-line telemetry only shown when main caption is from cyclingTexts
  const showSubLine = !!currentStepTexts?.length
  const hasTelemetry = showSubLine && (streamingText || personaName)

  // Reset index when step changes; start cycling interval if texts available
  React.useEffect(() => {
    setTextIndex(0)
    setIsFading(false)

    const texts = steps[currentStep]?.cyclingTexts
    if (!texts || texts.length <= 1) return

    const interval = setInterval(() => {
      setIsFading(true)
      setTimeout(() => {
        setTextIndex((prev) => (prev + 1) % texts.length)
        setIsFading(false)
      }, 150)
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  /* Overlay-less mode: render as an inline fixed panel so the dashboard remains visible */
  if (transparentOverlay) {
    if (!open) return null
    return (
      <div className="fixed inset-0 z-40 flex items-start justify-center pt-16 pointer-events-none">
        <div className="w-full max-w-2xl mx-auto pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="mx-4 rounded-xl border border-border bg-background overflow-hidden">
            <div className="px-8 pt-6 pb-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                <button
                  onClick={() => onOpenChange(false)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Cancel
                </button>
              </div>
              {description && (
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              )}
            </div>
            <div className="flex flex-col md:flex-row gap-8 px-8 pb-6 pt-2">
              <div className="flex-shrink-0 w-full md:w-48">
                <StepIndicator steps={steps} currentStep={currentStep} />
              </div>
              <div className="flex-1 min-h-[200px] flex flex-col justify-center items-center">
                {/* Status text — rendered by dialog (separate from children) */}
                {displayText && (
                  <div className="mb-4 text-center">
                    <p
                      className="text-sm text-muted-foreground transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{ opacity: isFading ? 0 : 1 }}
                    >
                      {displayText}
                    </p>
                    {/* Sub-line telemetry — only when main caption is from cyclingTexts */}
                    {hasTelemetry && (
                      <div className="mt-1.5 space-y-0.5">
                        {streamingText && (
                          <p className="text-xs font-mono text-muted-foreground/60">
                            ↳ system: {streamingText}
                          </p>
                        )}
                        {personaName && (
                          <p className="text-xs font-mono text-muted-foreground/60">
                            ↳ persona: {personaName}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Content — children or defaults */}
                {children ? (
                  <div className="w-full">
                    {children}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full max-w-xs mx-auto space-y-4">
                    <Progress value={progressPercent ?? 33} className="h-2 w-full" indicatorClassName="animate-pulse" />
                    {completedCount !== undefined && totalCount !== undefined && (
                      <p className="text-xs font-mono text-muted-foreground tabular-nums">
                        {completedCount}/{totalCount}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl gap-8 p-8 md:p-12 border-border rounded-xl bg-background overflow-hidden">
        
        <DialogHeader className="gap-3">
          <DialogTitle className="text-3xl font-semibold tracking-tight text-center">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-center text-base text-muted-foreground max-w-md mx-auto text-balance">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row gap-12 relative z-10 py-4">
          <div className="flex-shrink-0 w-full md:w-56 border-r-0 md:border-r border-border/40 pr-0 md:pr-8">
            <StepIndicator 
              steps={steps} 
              currentStep={currentStep} 
            />
          </div>
          
          <div className="flex-1 min-h-[300px] flex flex-col justify-center items-center">
            {/* Status text — rendered by dialog (separate from children) */}
            {displayText && (
              <div className="mb-6 text-center">
                <p
                  className="text-sm text-muted-foreground transition-opacity duration-200"
                  style={{ opacity: isFading ? 0 : 1 }}
                >
                  {displayText}
                </p>
                {/* Sub-line telemetry — only when main caption is from cyclingTexts */}
                {hasTelemetry && (
                  <div className="mt-1.5 space-y-0.5">
                    {streamingText && (
                      <p className="text-xs font-mono text-muted-foreground/60">
                        ↳ system: {streamingText}
                      </p>
                    )}
                    {personaName && (
                      <p className="text-xs font-mono text-muted-foreground/60">
                        ↳ persona: {personaName}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Content — children or defaults */}
            {children ? (
              <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500">
                {children}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full max-w-xs mx-auto space-y-4 animate-in fade-in duration-500">
                <Progress value={progressPercent ?? 33} className="h-2 w-full" indicatorClassName="animate-pulse" />
                {completedCount !== undefined && totalCount !== undefined && (
                  <p className="text-xs font-mono text-muted-foreground tabular-nums">
                    {completedCount}/{totalCount}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}
