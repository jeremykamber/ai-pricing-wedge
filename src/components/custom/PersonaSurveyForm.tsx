"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import type { PersonaSurvey } from "@/lib/surveyToPrompt"
import {
  GOAL_OPTIONS,
  FRUSTRATION_OPTIONS,
  SOLUTION_OPTIONS,
  DECISION_FACTOR_OPTIONS,
  AUDIENCE_KNOWLEDGE_OPTIONS,
  DECISION_TYPE_OPTIONS,
} from "@/lib/surveyToPrompt"
import { ArrowRightIcon, SparklesIcon } from "lucide-react"

interface PersonaSurveyFormProps {
  onSubmit: (survey: PersonaSurvey) => void
  onUseTextarea: () => void
  isPending: boolean
  error?: string | null
}

function MultiSelect({
  options,
  selected,
  onChange,
  max,
  label,
}: {
  options: readonly string[]
  selected: string[]
  onChange: (vals: string[]) => void
  max: number
  label: string
}) {
  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val))
    } else if (selected.length < max) {
      onChange([...selected, val])
    }
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground mb-1">{label} (choose up to {max})</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {isSelected && <span className="mr-1.5">✓</span>}
              {opt}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function SingleSelect({
  options,
  selected,
  onChange,
  label,
}: {
  options: readonly string[]
  selected: string
  onChange: (val: string) => void
  label: string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground mb-1">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = selected === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {isSelected && <span className="mr-1.5">●</span>}
              {opt}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function PersonaSurveyForm({ onSubmit, onUseTextarea, isPending, error }: PersonaSurveyFormProps) {
  const [targetAudience, setTargetAudience] = useState("")
  const [goals, setGoals] = useState<string[]>([])
  const [frustration, setFrustration] = useState("")
  const [currentSolution, setCurrentSolution] = useState("")
  const [decisionFactors, setDecisionFactors] = useState<string[]>([])
  const [audienceKnowledge, setAudienceKnowledge] = useState("")
  const [decisionTypes, setDecisionTypes] = useState<string[]>([])
  const [additionalNotes, setAdditionalNotes] = useState("")
  const [frustrationCustom, setFrustrationCustom] = useState("")
  const [solutionCustom, setSolutionCustom] = useState("")
  const [goalCustom, setGoalCustom] = useState("")

  const hasGoalCustom = goals.includes("Something else")
  const isOtherFrustration = frustration === "Other"
  const isOtherSolution = currentSolution === "Other"

  const isComplete =
    targetAudience.trim().length > 0 &&
    goals.length > 0 &&
    (!hasGoalCustom || goalCustom.trim().length > 0) &&
    frustration.length > 0 &&
    (!isOtherFrustration || frustrationCustom.trim().length > 0) &&
    currentSolution.length > 0 &&
    (!isOtherSolution || solutionCustom.trim().length > 0) &&
    decisionFactors.length > 0 &&
    audienceKnowledge.length > 0 &&
    decisionTypes.length > 0

  const handleSubmit = () => {
    if (!isComplete) return

    const resolveCustom = (val: string, custom: string) =>
      val === "Other" && custom.trim() ? custom.trim() : val
    const resolveGoalCustom = (g: string) =>
      g === "Something else" && goalCustom.trim() ? goalCustom.trim() : g

    onSubmit({
      targetAudience: targetAudience.trim(),
      goals: goals.map(resolveGoalCustom),
      frustration: resolveCustom(frustration, frustrationCustom),
      currentSolution: resolveCustom(currentSolution, solutionCustom),
      decisionFactors,
      audienceKnowledge,
      decisionTypes,
      additionalNotes: additionalNotes.trim() || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Question 1: Target audience */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">Who are you targeting?</label>
        <p className="text-xs text-muted-foreground">Describe your audience in a few words.</p>
        <input
          type="text"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="e.g. Small business owners, Frontend engineers, HR managers"
          disabled={isPending}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* Question 2: Goals */}
      <MultiSelect
        options={GOAL_OPTIONS}
        selected={goals}
        onChange={setGoals}
        max={3}
        label="What are they trying to accomplish?"
      />
      {hasGoalCustom && (
        <input
          type="text"
          value={goalCustom}
          onChange={(e) => setGoalCustom(e.target.value)}
          placeholder="Describe their goal..."
          disabled={isPending}
          className="-mt-2 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}

      {/* Question 3: Frustration */}
      <SingleSelect
        options={FRUSTRATION_OPTIONS}
        selected={frustration}
        onChange={setFrustration}
        label="What is their biggest frustration?"
      />
      {isOtherFrustration && (
        <input
          type="text"
          value={frustrationCustom}
          onChange={(e) => setFrustrationCustom(e.target.value)}
          placeholder="Describe their frustration..."
          disabled={isPending}
          className="-mt-2 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}

      {/* Question 4: Current solution */}
      <SingleSelect
        options={SOLUTION_OPTIONS}
        selected={currentSolution}
        onChange={setCurrentSolution}
        label="How do they solve this today?"
      />
      {isOtherSolution && (
        <input
          type="text"
          value={solutionCustom}
          onChange={(e) => setSolutionCustom(e.target.value)}
          placeholder="Describe their current solution..."
          disabled={isPending}
          className="-mt-2 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}

      {/* Question 5: Decision factors */}
      <MultiSelect
        options={DECISION_FACTOR_OPTIONS}
        selected={decisionFactors}
        onChange={setDecisionFactors}
        max={3}
        label="What makes them choose a product?"
      />

      {/* Question 6: Audience knowledge */}
      <SingleSelect
        options={AUDIENCE_KNOWLEDGE_OPTIONS}
        selected={audienceKnowledge}
        onChange={setAudienceKnowledge}
        label="How well do you know this audience?"
      />

      {/* Question 7: Decision types */}
      <MultiSelect
        options={DECISION_TYPE_OPTIONS}
        selected={decisionTypes}
        onChange={setDecisionTypes}
        max={5}
        label="What kind of decisions do you want these personas to help you evaluate?"
      />

      {/* Question 8: Additional notes (optional) */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">Anything else we should know? <span className="text-muted-foreground font-normal">(optional)</span></label>
        <Textarea
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          placeholder="Any additional context about your audience..."
          disabled={isPending}
          className="min-h-[80px] resize-y"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onUseTextarea}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Use freeform description instead
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isComplete || isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? (
            <>Generating...</>
          ) : (
            <>
              Generate Personas
              <SparklesIcon className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">{error}</p>
      )}
    </div>
  )
}
