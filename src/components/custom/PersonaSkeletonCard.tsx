"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface PersonaSkeletonCardProps {
  className?: string
}

/**
 * A skeleton placeholder card with shimmer animation for in-progress persona generation.
 * Matches the layout of PersonaProfilePanel so there's no layout shift when replaced.
 */
export function PersonaSkeletonCard({ className }: PersonaSkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-6 md:p-8 text-card-foreground",
        className,
      )}
    >
      <div className="flex flex-col gap-6">
        {/* Avatar + name row */}
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-full bg-muted shrink-0 animate-pulse" />
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="h-5 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
          </div>
        </div>

        <div className="h-px w-full bg-border/40" />

        {/* Big Five skeleton bars */}
        <div className="flex flex-col gap-3">
          <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
          <div className="h-2 w-full rounded-sm bg-muted animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
          <div className="h-2 w-full rounded-sm bg-muted animate-pulse" />
        </div>

        {/* Value tags */}
        <div className="flex gap-2">
          <div className="h-4 w-16 rounded-sm bg-muted animate-pulse" />
          <div className="h-4 w-20 rounded-sm bg-muted animate-pulse" />
        </div>

        {/* Decision style */}
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />

        {/* Buttons */}
        <div className="flex gap-2">
          <div className="flex-1 h-10 rounded-md bg-muted animate-pulse" />
          <div className="flex-1 h-10 rounded-md bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  )
}
