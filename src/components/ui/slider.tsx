"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  leftLabel?: string
  rightLabel?: string
  showTickMarks?: boolean
  onChange: (value: number) => void
  className?: string
}

export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  leftLabel,
  rightLabel,
  showTickMarks,
  onChange,
  className,
}: SliderProps) {
  // Compute fill percentage for the active track
  const fillPercent = ((value - min) / (max - min)) * 100

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex justify-between items-end">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className="text-sm font-bold font-mono tabular-nums text-foreground/90">
          {showTickMarks ? `${value} / ${max}` : value}
        </span>
      </div>

      {/* Custom range slider */}
      <div className="relative h-6 flex items-center">
        {/* Track background */}
        <div className="absolute left-0 right-0 h-1.5 rounded-sm bg-muted" />
        {/* Active track fill */}
        <div
          className="absolute left-0 h-1.5 rounded-sm bg-primary transition-[width] duration-150"
          style={{ width: `${fillPercent}%` }}
        />
        {/* Tick marks */}
        {showTickMarks && (
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex items-center justify-between pointer-events-none">
            {Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => {
              const tickValue = min + i * step
              const isActive = tickValue <= value
              return (
                <div
                  key={i}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    isActive ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                />
              )
            })}
          </div>
        )}
        {/* Native range input (invisible, captures gestures) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer",
            "z-10",
            // Track
            "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent",
            // Thumb
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary",
            "[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-webkit-slider-thumb]:hover:border-primary/80 [&::-webkit-slider-thumb]:hover:scale-110",
            "[&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150",
            // Firefox
            "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:bg-transparent",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary",
            "[&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:hover:border-primary/80",
          )}
        />
      </div>

      {/* Labels */}
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between text-[10px] text-muted-foreground/60 font-medium">
          <span>{leftLabel ?? ""}</span>
          <span>{rightLabel ?? ""}</span>
        </div>
      )}
    </div>
  )
}
