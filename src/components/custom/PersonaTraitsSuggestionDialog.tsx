"use client"

import * as React from "react"
import { Persona } from "@/domain/entities/Persona"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { SparklesIcon, LoaderIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SuggestedTraits {
  conscientiousness: number
  neuroticism: number
  openness: number
  extraversion: number
  agreeableness: number
  values: string[]
  fears: string[]
  communicationStyle: string
  decisionStyle: string
}

type TraitKey = keyof SuggestedTraits

interface TraitRow {
  key: TraitKey
  label: string
  suggested: string
  original: string
}

interface PersonaTraitsSuggestionDialogProps {
  isOpen: boolean
  onClose: () => void
  onApply: (decisions: Record<string, boolean>) => void
  suggestedTraits: SuggestedTraits | null
  originalPersona: Persona
}

function DiffToggle({ selected, onSelect, label }: { selected: boolean; onSelect: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-xs font-medium px-2 py-0.5 rounded-sm transition-all duration-150",
        selected
          ? "bg-primary/10 text-primary"
          : "bg-transparent text-muted-foreground/60 hover:text-foreground hover:bg-muted/30",
      )}
    >
      {label}
    </button>
  )
}

function DiffRow({ label, suggested, original, apply, onToggle }: {
  label: string
  suggested: string
  original: string
  apply: boolean
  onToggle: (apply: boolean) => void
}) {
  const isDifferent = suggested !== original
  if (!isDifferent) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 rounded-sm hover:bg-muted/20 transition-colors">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-foreground">{suggested}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-sm hover:bg-muted/20 transition-colors group">
      <span className="text-xs text-muted-foreground min-w-[100px]">{label}</span>
      <div className="flex items-center gap-3 flex-1 justify-end">
        <div className="flex flex-col items-end gap-0.5 min-w-0">
          <span className={cn(
            "text-xs leading-tight transition-all duration-150",
            apply ? "text-primary font-bold" : "line-through text-muted-foreground/40",
          )}>
            {suggested}
          </span>
          <span className={cn(
            "text-xs leading-tight transition-all duration-150",
            apply ? "line-through text-muted-foreground/40" : "text-foreground font-bold",
          )}>
            {original}
          </span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
          <DiffToggle selected={!apply} onSelect={() => onToggle(false)} label="Keep" />
          <DiffToggle selected={apply} onSelect={() => onToggle(true)} label="Apply" />
        </div>
      </div>
    </div>
  )
}

export function PersonaTraitsSuggestionDialog({
  isOpen,
  onClose,
  onApply,
  suggestedTraits,
  originalPersona,
}: PersonaTraitsSuggestionDialogProps) {
  const [decisions, setDecisions] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    if (isOpen && suggestedTraits) {
      setDecisions({
        conscientiousness: suggestedTraits.conscientiousness !== originalPersona.conscientiousness,
        neuroticism: suggestedTraits.neuroticism !== originalPersona.neuroticism,
        openness: suggestedTraits.openness !== originalPersona.openness,
        extraversion: suggestedTraits.extraversion !== originalPersona.extraversion,
        agreeableness: suggestedTraits.agreeableness !== originalPersona.agreeableness,
        values: suggestedTraits.values.join(", ") !== originalPersona.values.join(", "),
        fears: suggestedTraits.fears.join(", ") !== originalPersona.fears.join(", "),
        communicationStyle: suggestedTraits.communicationStyle !== originalPersona.communicationStyle,
        decisionStyle: suggestedTraits.decisionStyle !== originalPersona.decisionStyle,
      })
    }
  }, [isOpen, suggestedTraits, originalPersona])

  const toggle = (key: string, val: boolean) => {
    setDecisions((prev) => ({ ...prev, [key]: val }))
  }

  const handleApply = () => {
    if (!suggestedTraits) return
    onApply(decisions)
    onClose()
  }

  const handleKeepOriginals = () => {
    if (!suggestedTraits) return
    const allFalse: Record<string, boolean> = {}
    for (const key of Object.keys(decisions)) allFalse[key] = false
    onApply(allFalse)
    onClose()
  }

  const setAll = (val: boolean) => {
    const all: Record<string, boolean> = {}
    for (const key of Object.keys(decisions)) all[key] = val
    setDecisions(all)
  }

  const anyApplied = Object.values(decisions).some(Boolean)

  if (!suggestedTraits) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto flex flex-col p-0">
          <DialogTitle className="sr-only">Traits Inferred from Backstory</DialogTitle>
          <div className="flex items-center border-b border-border/40 px-5 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                <LoaderIcon className="w-4 h-4 text-primary animate-spin" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight">Analyzing backstory...</h2>
            </div>
          </div>
          <div className="p-10 flex flex-col items-center gap-4">
            <LoaderIcon className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Inferring personality traits from the updated backstory...</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const oceanRows: TraitRow[] = [
    { key: "conscientiousness", label: "Conscientiousness", suggested: String(suggestedTraits.conscientiousness), original: String(originalPersona.conscientiousness) },
    { key: "neuroticism", label: "Neuroticism", suggested: String(suggestedTraits.neuroticism), original: String(originalPersona.neuroticism) },
    { key: "openness", label: "Openness", suggested: String(suggestedTraits.openness), original: String(originalPersona.openness) },
    { key: "extraversion", label: "Extraversion", suggested: String(suggestedTraits.extraversion), original: String(originalPersona.extraversion) },
    { key: "agreeableness", label: "Agreeableness", suggested: String(suggestedTraits.agreeableness), original: String(originalPersona.agreeableness) },
  ]

  const psychoRows: TraitRow[] = [
    { key: "values", label: "Values", suggested: suggestedTraits.values.join(", "), original: originalPersona.values.join(", ") },
    { key: "fears", label: "Fears", suggested: suggestedTraits.fears.join(", "), original: originalPersona.fears.join(", ") },
    { key: "communicationStyle", label: "Communication", suggested: suggestedTraits.communicationStyle, original: originalPersona.communicationStyle },
    { key: "decisionStyle", label: "Decision Style", suggested: suggestedTraits.decisionStyle, original: originalPersona.decisionStyle },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[520px] max-h-[90dvh] overflow-y-auto flex flex-col p-0"
      >
        <DialogTitle className="sr-only">Traits Inferred from Backstory</DialogTitle>

        <div className="flex items-center border-b border-border/40 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
              <SparklesIcon className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight">Traits Inferred from Backstory</h2>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            We analyzed the updated backstory and inferred new values. Hover each row to choose Apply or Keep original.
          </p>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAll(false)}
              className="text-xs font-medium text-muted-foreground/60 hover:text-foreground transition-colors px-2 py-1"
            >
              Reject all
            </button>
            <button
              type="button"
              onClick={() => setAll(true)}
              className="text-xs font-medium text-muted-foreground/60 hover:text-foreground transition-colors px-2 py-1"
            >
              Accept all
            </button>
          </div>

          {/* OCEAN */}
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-card border border-border">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-2">Personality Traits (OCEAN)</h3>
            {oceanRows.map((row) => (
              <DiffRow
                key={row.key}
                label={row.label}
                suggested={row.suggested}
                original={row.original}
                apply={decisions[row.key] ?? false}
                onToggle={(val) => toggle(row.key, val)}
              />
            ))}
          </div>

          {/* Psychographics */}
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-card border border-border">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-2">Psychographics</h3>
            {psychoRows.map((row) => (
              <DiffRow
                key={row.key}
                label={row.label}
                suggested={row.suggested}
                original={row.original}
                apply={decisions[row.key] ?? false}
                onToggle={(val) => toggle(row.key, val)}
              />
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleKeepOriginals}
              className="flex-1 inline-flex h-10 items-center justify-center rounded-md border border-border/60 bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted/30"
            >
              Keep originals
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!anyApplied}
              className="flex-1 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 ring-1 ring-primary/20 gap-2 disabled:opacity-50"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              Apply selections
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
