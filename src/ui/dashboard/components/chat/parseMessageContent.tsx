import React from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { ThinkingBlock } from "@/components/custom/ThinkingBlock"
import { ChatMarkdown } from "./ChatMarkdown"

const REASONING_OPEN = "<<REASONING>>"
const REASONING_CLOSE = "<</REASONING>>"

/**
 * Matches a complete reasoning block (`<<REASONING>>…<</REASONING>>`) or an
 * unclosed opener running to the end of the content. The second alternative
 * covers the mid-stream state: while a block is still being streamed the
 * closing marker hasn't arrived, and we must not render the raw marker text
 * as message body.
 */
const REASONING_REGEX = new RegExp(
  `${REASONING_OPEN}([\\s\\S]*?)(?:${REASONING_CLOSE}|$)`,
  "g",
)

interface ReasoningSegment {
  text: string
  start: number
  end: number
}

function extractReasoningSegments(content: string): ReasoningSegment[] {
  const segments: ReasoningSegment[] = []
  REASONING_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = REASONING_REGEX.exec(content)) !== null) {
    const text = match[1].trim()
    if (!text) continue
    segments.push({ text, start: match.index, end: REASONING_REGEX.lastIndex })
  }
  return segments
}

interface MemoryFootnote {
  index: number
  text: string
}

export function parseMessageContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const memories: MemoryFootnote[] = []
  let keyCounter = 0
  let memoryCounter = 0

  const reasoningSegments = extractReasoningSegments(content)

  // Walk the content in order, splitting it into reasoning blocks and body
  // segments. Order matters: post-content reasoning (appended after the
  // answer) must render after the body, and every block must render — not
  // just the first match.
  const segments: { type: "reasoning" | "body"; text: string }[] = []
  let cursor = 0
  for (const seg of reasoningSegments) {
    if (seg.start > cursor) {
      segments.push({ type: "body", text: content.slice(cursor, seg.start) })
    }
    segments.push({ type: "reasoning", text: seg.text })
    cursor = seg.end
  }
  if (cursor < content.length) {
    segments.push({ type: "body", text: content.slice(cursor) })
  }

  for (const segment of segments) {
    if (segment.type === "reasoning") {
      parts.push(
        <ThinkingBlock key={`reasoning-${keyCounter++}`} content={segment.text} className="mb-3" />
      )
      continue
    }

    const body = segment.text.trim()
    if (!body) continue

    const combinedRegex = /(<%(.*?)%>)|(\[Memory:\s*(.*?)\])/g
    let match = combinedRegex.exec(body)
    let lastIndex = 0

    while (match !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <ChatMarkdown key={`md-${keyCounter++}`} content={body.slice(lastIndex, match.index)} />
        )
      }

      if (match[1]) {
        const inner = match[2]
        const pipeIndex = inner.indexOf('|')

        if (pipeIndex !== -1) {
          const displayText = inner.slice(0, pipeIndex).trim()
          const excerpt = inner.slice(pipeIndex + 1).trim()
          parts.push(
            <Tooltip key={`tooltip-${keyCounter++}`} delayDuration={200}>
              <TooltipTrigger asChild>
                <span className="underline underline-offset-2 decoration-dotted cursor-help text-primary/80 hover:text-primary">
                  {displayText}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs">
                <p>{excerpt}</p>
              </TooltipContent>
            </Tooltip>
          )
        } else {
          parts.push(match[0])
        }
      } else if (match[3]) {
        memoryCounter++
        const memoryText = match[4].trim()
        memories.push({ index: memoryCounter, text: memoryText })
        parts.push(
          <sup
            key={`memory-ref-${keyCounter++}`}
            className="text-[10px] text-primary/60 font-medium leading-none mx-[1px] select-none"
          >
            {memoryCounter}
          </sup>
        )
      }

      lastIndex = match.index + match[0].length
      match = combinedRegex.exec(body)
    }

    if (lastIndex < body.length) {
      parts.push(
        <ChatMarkdown key={`md-${keyCounter++}`} content={body.slice(lastIndex)} />
      )
    }
  }

  if (memories.length > 0) {
    parts.push(
      <div key="memory-footnotes" className="mt-4 pt-3 border-t border-border/30">
        {memories.map((m) => (
          <div key={`fn-${m.index}`} className="flex items-start gap-2 text-xs text-muted-foreground/80 leading-relaxed">
            <sup className="text-[10px] text-primary/60 font-medium leading-none mt-[3px] shrink-0">
              {m.index}
            </sup>
            <span>{m.text}</span>
          </div>
        ))}
      </div>
    )
  }

  return parts
}
