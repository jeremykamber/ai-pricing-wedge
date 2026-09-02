"use client"

import * as React from "react"
import { Persona } from "@/domain/entities/Persona"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { PersonaAvatar } from "./PersonaAvatar"
import { XIcon, ShuffleIcon, SparklesIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { mapToDiscrete } from "./variationMapping"

const BIG_FIVE_CONFIG = [
  { key: "conscientiousness" as const, label: "Conscientiousness", left: "Chaotic", right: "Meticulous" },
  { key: "neuroticism" as const, label: "Neuroticism", left: "Stable", right: "Anxious" },
  { key: "openness" as const, label: "Openness", left: "Traditional", right: "Curious" },
  { key: "extraversion" as const, label: "Extraversion", left: "Introvert", right: "Extrovert" },
  { key: "agreeableness" as const, label: "Agreeableness", left: "Competitive", right: "Compassionate" },
]

const COUNT_OPTIONS = [1, 3, 5] as const

export interface VariationFormData {
  bigFive: {
    conscientiousness: number
    neuroticism: number
    openness: number
    extraversion: number
    agreeableness: number
  }
  variationLevel: number
  count: 1 | 3 | 5
}

interface SimilarPersonaDialogProps {
  persona: Persona | null
  isOpen: boolean
  onClose: () => void
  onGenerate: (referencePersona: Persona, formData: VariationFormData) => void
}

export function SimilarPersonaDialog({
  persona,
  isOpen,
  onClose,
  onGenerate,
}: SimilarPersonaDialogProps) {
  const [bigFive, setBigFive] = React.useState({
    conscientiousness: 50,
    neuroticism: 50,
    openness: 50,
    extraversion: 50,
    agreeableness: 50,
  })
  const [variationLevel, setVariationLevel] = React.useState(2)
  const [selectedCount, setSelectedCount] = React.useState<1 | 3 | 5>(3)

  React.useEffect(() => {
    if (persona) {
      setBigFive({
        conscientiousness: mapToDiscrete(persona.conscientiousness),
        neuroticism: mapToDiscrete(persona.neuroticism),
        openness: mapToDiscrete(persona.openness),
        extraversion: mapToDiscrete(persona.extraversion),
        agreeableness: mapToDiscrete(persona.agreeableness),
      })
      setVariationLevel(mapToDiscrete(40))
      setSelectedCount(3)
    }
  }, [persona])

  const updateBigFive = (key: keyof typeof bigFive, value: number) => {
    setBigFive((prev) => ({ ...prev, [key]: value }))
  }

  const handleGenerate = () => {
    if (!persona) return
    console.log("[SimilarPersonaDialog] Generating variation - bigFive:", bigFive, "variationLevel:", variationLevel, "count:", selectedCount)
    const mappedFormData: VariationFormData = {
      bigFive: {
        conscientiousness: bigFive.conscientiousness * 20,
        neuroticism: bigFive.neuroticism * 20,
        openness: bigFive.openness * 20,
        extraversion: bigFive.extraversion * 20,
        agreeableness: bigFive.agreeableness * 20,
      },
      variationLevel: variationLevel * 20,
      count: selectedCount,
    }
    console.log("[SimilarPersonaDialog] VariationFormData (mapped to 0-100):", mappedFormData)
    onGenerate(persona, mappedFormData)
    onClose()
  }

  const getRandomDiscrete = () => Math.floor(Math.random() * 5) + 1

  const handleRandomize = () => {
    console.log("[SimilarPersonaDialog] Randomizing slider values")
    setBigFive({
      conscientiousness: getRandomDiscrete(),
      neuroticism: getRandomDiscrete(),
      openness: getRandomDiscrete(),
      extraversion: getRandomDiscrete(),
      agreeableness: getRandomDiscrete(),
    })
    setVariationLevel(getRandomDiscrete())
  }

  if (!persona) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[520px] max-h-[90dvh] overflow-y-auto flex flex-col p-0"
      >
        <DialogTitle className="sr-only">
          Create Persona Variation — {persona.name}
        </DialogTitle>

        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <PersonaAvatar name={persona.name} size="sm" className="w-8 h-8 shrink-0" />
            <div className="flex flex-col min-w-0">
              <h2 className="text-sm font-semibold tracking-tight truncate">
                Create Variation
              </h2>
              <p className="text-[11px] text-muted-foreground truncate">
                Based on {persona.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-4 shrink-0">
            <button
              onClick={handleRandomize}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-card text-foreground border border-border/60 transition-colors hover:bg-muted/30"
              aria-label="Randomize traits"
            >
              <ShuffleIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              aria-label="Close"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Big Five Personality Traits
              </h3>
              <span className="text-[10px] text-muted-foreground/60">
                Adjust the personality profile
              </span>
            </div>
            <div className="space-y-4">
              {BIG_FIVE_CONFIG.map(({ key, label, left, right }) => (
                <Slider
                  key={key}
                  label={label}
                  value={bigFive[key]}
                  min={1}
                  max={5}
                  step={1}
                  showTickMarks
                  leftLabel={left}
                  rightLabel={right}
                  onChange={(v) => updateBigFive(key, v)}
                />
              ))}
            </div>
          </div>

          <div className="h-px w-full bg-border/40" />

          <Slider
            label="Creative Freedom"
            value={variationLevel}
            min={1}
            max={5}
            step={1}
            showTickMarks
            leftLabel="Close to original"
            rightLabel="Wildly different"
            onChange={setVariationLevel}
          />

          <div className="h-px w-full bg-border/40" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                How Many?
              </h3>
              <span className="text-[10px] text-muted-foreground/60">
                Number of variations to generate
              </span>
            </div>
            <div className="flex gap-3">
              {COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setSelectedCount(count)}
                  className={cn(
                    "flex-1 h-10 rounded-md text-sm font-medium transition-all border",
                    selectedCount === count
                      ? "bg-muted text-foreground border-border"
                      : "bg-transparent text-muted-foreground border-border hover:border-border/80 hover:text-foreground",
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring gap-2"
          >
            <SparklesIcon className="w-4 h-4" />
            Generate {selectedCount} Variation{selectedCount > 1 ? "s" : ""}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
