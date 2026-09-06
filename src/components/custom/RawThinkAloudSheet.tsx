"use client"

import * as React from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { PersonaAvatar } from "./PersonaAvatar"
import { cn } from "@/lib/utils"

export interface RawThinkAloudSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personaName: string
  /** Verbatim think-aloud monologue (PersonaResponse.rawAnalysis). */
  transcript: string
  /** Quote to scroll to and mark; shown untouched when it never matches. */
  highlight?: string
}

/**
 * Renders `transcript` as-is, optionally splitting it once around the first
 * occurrence of `highlight` so the surrounding text keeps its original shape.
 * Falls back to the plain transcript when the quote never matches.
 */
function HighlightedTranscript({
  transcript,
  highlight,
  markRef,
}: {
  transcript: string
  highlight?: string
  markRef: React.RefObject<HTMLElement | null>
}) {
  if (!highlight) return <>{transcript}</>

  const index = transcript.indexOf(highlight)
  return index === -1 ? <>{transcript}</> : (
    <>
      {transcript.slice(0, index)}
      <mark ref={markRef}>{highlight}</mark>
      {transcript.slice(index + highlight.length)}
    </>
  )
}

/**
 * Full-width side panel: a persona's raw think-aloud monologue, readable as
 * prose. Lives outside the citation badge so the monologue has room; the
 * badge's popover is the compact preview, this is the full text.
 */
export function RawThinkAloudSheet({
  open,
  onOpenChange,
  personaName,
  transcript,
  highlight,
}: RawThinkAloudSheetProps) {
  const markRef = React.useRef<HTMLElement | null>(null)

  // The sheet animates in over 300ms; marking happens in the same pass, but
  // the node only has geometry once Radix mounts the content, so scroll
  // targeting waits for the next frame.
  React.useEffect(() => {
    if (!open || !highlight || !markRef.current) return
    const frame = requestAnimationFrame(() => {
      markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, highlight])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-hidden border-l p-0 sm:max-w-xl sm:w-[90vw]">
        <SheetHeader className="border-b border-border/60 pr-14">
          <div className="flex items-center gap-3">
            <PersonaAvatar name={personaName} size="sm" />
            <div className="flex min-w-0 flex-col">
              <SheetTitle className="truncate text-base">{personaName}</SheetTitle>
              <SheetDescription className="text-xs">
                Raw think-aloud transcript
              </SheetDescription>
              <span className="sr-only" aria-live="polite">
                {highlight ? "Jumped to highlighted quote" : "Transcript opened"}
              </span>
            </div>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <p
            className={cn(
              "whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-foreground/90",
              highlight && "text-foreground"
            )}
          >
            <HighlightedTranscript
              transcript={transcript}
              highlight={highlight}
              markRef={markRef}
            />
          </p>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
