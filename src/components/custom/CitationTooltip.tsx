"use client"

import * as React from "react"
import { BookOpenIcon } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PersonaAvatar } from "./PersonaAvatar"

export interface EvidenceCitation {
  personaId: string
  personaName: string
  /** VERBATIM substring of that persona's rawAnalysis. */
  quote: string
}

export interface CitationTooltipProps {
  citations: EvidenceCitation[]
  /** Opens the Raw Think-Aloud drawer; receives the citation whose quote to highlight. */
  onOpenTranscript: (citation: EvidenceCitation) => void
  /** Role line shown in the popover when the caller can supply one (e.g. personaProfile.occupation). */
  getPersonaRole?: (citation: EvidenceCitation) => string | undefined
}

/**
 * The ONLY place that knows what a citation badge looks like.
 *
 * Open model: HoverCard previews on hover/focus, and pressing the badge
 * "pins" the card so it survives pointer-leave (touch has no hover at all).
 * Hover open/close is owned here rather than left to HoverCard because Radix
 * delays hover-open by 700ms; a citation preview should be immediate.
 * HoverCard is also not backed by DismissableLayer, so pinned-card dismissal
 * — outside press and Escape — is wired here, scoped by a data-citation-key
 * attribute shared between trigger and card.
 */
export function CitationTooltip({
  citations,
  onOpenTranscript,
  getPersonaRole,
}: CitationTooltipProps) {
  const [hoverKey, setHoverKey] = React.useState<string | null>(null)
  const [pinnedKey, setPinnedKey] = React.useState<string | null>(null)

  // Pinned-card dismissal. HoverCard never closes itself against outside
  // presses; listening on the document keeps the trigger press (the click's
  // own mousedown) from unpinning what it just pinned, because the press
  // target sits inside the [data-citation-key] subtree.
  React.useEffect(() => {
    if (!pinnedKey) return
    const onDocPointerDown = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest(`[data-citation-key="${pinnedKey}"]`)) {
        return
      }
      setPinnedKey(null)
      setHoverKey(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedKey(null)
    }
    document.addEventListener("pointerdown", onDocPointerDown)
    document.addEventListener("mousedown", onDocPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown)
      document.removeEventListener("mousedown", onDocPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [pinnedKey])

  return (
    <>
      {citations.map((citation) => {
        const citationKey = `${citation.personaId}:${citation.quote.slice(0, 24)}`
        const open = hoverKey === citationKey || pinnedKey === citationKey
        return (
          <HoverCard key={citationKey} open={open} onOpenChange={() => {}}>
            <HoverCardTrigger
              asChild
              aria-label={`Show citation from ${citation.personaName}`}
              data-citation-key={citationKey}
              onPointerEnter={() => setHoverKey(citationKey)}
              onPointerLeave={() =>
                setHoverKey((prev) => (prev === citationKey ? null : prev))
              }
              onFocus={() => setHoverKey(citationKey)}
              onBlur={() => {
                // Focus preview is transient; a pinned card stays open.
                if (pinnedKey !== citationKey) {
                  setHoverKey((prev) => (prev === citationKey ? null : prev))
                }
              }}
              onPointerDown={() => {
                setPinnedKey((prev) => (prev === citationKey ? null : citationKey))
              }}
            >
              <Badge
                variant="secondary"
                tabIndex={0}
                className="max-w-40 cursor-pointer rounded-sm font-medium normal-case tracking-normal"
              >
                <span className="truncate">{citation.personaName}</span>
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent data-citation-key={citationKey} className="w-80 max-w-sm p-0">
              <div className="flex items-center gap-2 border-b border-border/60 p-3">
                <PersonaAvatar name={citation.personaName} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{citation.personaName}</span>
                  {getPersonaRole?.(citation) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {getPersonaRole(citation)}
                    </span>
                  )}
                </div>
              </div>
              <blockquote className="border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-sm italic leading-relaxed text-foreground/90">
                {citation.quote}
              </blockquote>
              <div className="p-3 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onOpenTranscript(citation)
                    setPinnedKey(null)
                    setHoverKey(null)
                  }}
                >
                  <BookOpenIcon data-icon="inline-start" />
                  View full transcript
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>
        )
      })}
    </>
  )
}
