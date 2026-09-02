"use client"

import { useState } from "react"
import { ChevronRight, Brain } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThinkingBlockProps {
  content: string
  className?: string
}

export function ThinkingBlock({ content, className }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground/90 transition-colors py-1 px-0 w-fit"
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
        <Brain className="w-3 h-3" />
        <span className="font-medium tracking-wide uppercase">Thinking</span>
        <span className="text-[10px] text-muted-foreground/40">({content.length} chars)</span>
      </button>

      {expanded && (
        <div className="ml-5 pl-3 border-l-2 border-muted-foreground/20 py-2">
          <p className="text-[12px] leading-relaxed text-muted-foreground/60 whitespace-pre-wrap font-mono">
            {content}
          </p>
        </div>
      )}
    </div>
  )
}
