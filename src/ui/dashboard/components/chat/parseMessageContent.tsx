import React from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { ThinkingBlock } from "@/components/custom/ThinkingBlock"
import { ChatMarkdown } from "./ChatMarkdown"

const REASONING_REGEX = new RegExp("<<REASONING>>([\\s\\S]*?)<</REASONING>>", "g")

interface MemoryFootnote {
  index: number
  text: string
}

export function parseMessageContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const memories: MemoryFootnote[] = []
  let lastIndex = 0

  const reasoningMatch = content.match(REASONING_REGEX)
  const textWithoutReasoning = content.replace(REASONING_REGEX, "").trim()

  if (reasoningMatch) {
    const reasoningText = reasoningMatch[0].replace("<<REASONING>>", "").replace("<</REASONING>>", "").trim()
    parts.push(
      <ThinkingBlock key="reasoning" content={reasoningText} className="mb-3" />
    )
  }

  if (!textWithoutReasoning) return parts

  const combinedRegex = /(<%(.*?)%>)|(\[Memory:\s*(.*?)\])/g
  let match = combinedRegex.exec(textWithoutReasoning)
  let memoryCounter = 0

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <ChatMarkdown key={`md-${lastIndex}`} content={textWithoutReasoning.slice(lastIndex, match.index)} />
      )
    }

    if (match[1]) {
      const inner = match[2]
      const pipeIndex = inner.indexOf('|')

      if (pipeIndex !== -1) {
        const displayText = inner.slice(0, pipeIndex).trim()
        const excerpt = inner.slice(pipeIndex + 1).trim()
        parts.push(
          <Tooltip key={`tooltip-${match.index}`} delayDuration={200}>
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
          key={`memory-ref-${match.index}`}
          className="text-[10px] text-primary/60 font-medium leading-none mx-[1px] select-none"
        >
          {memoryCounter}
        </sup>
      )
    }

    lastIndex = match.index + match[0].length
    match = combinedRegex.exec(textWithoutReasoning)
  }

  if (lastIndex < textWithoutReasoning.length) {
    parts.push(
      <ChatMarkdown key={`md-${lastIndex}`} content={textWithoutReasoning.slice(lastIndex)} />
    )
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
