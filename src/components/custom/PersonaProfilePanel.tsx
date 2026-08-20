import * as React from "react"
import { cn } from "@/lib/utils"
import { MinimalCard } from "./MinimalCard"
import { PersonaAvatar } from "./PersonaAvatar"
import { StatusBadge } from "./StatusBadge"
import { CopyIcon, GitForkIcon, XIcon, AlertTriangleIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog"

import { Persona } from "@/domain/entities/Persona"
import { useAnalysisStore } from "@/ui/stores/analysisStore"

export interface PersonaProfilePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  persona: Persona
  onChatClick?: () => void
  onCreateVariant?: () => void
  onDelete?: (personaId: string) => void
}

export function PersonaProfilePanel({ persona, onChatClick, onCreateVariant, onDelete, className, ...props }: PersonaProfilePanelProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)

  const analyses = useAnalysisStore((s) => s.analyses)
  const usedInAnalyses = analyses.filter(
    (s) => s.personaNames?.includes(persona.name),
  )

  const handleDelete = () => {
    onDelete?.(persona.id)
    setIsDeleteDialogOpen(false)
  }

  return (
    <>
      <MinimalCard className={cn("flex flex-col gap-6 h-full relative group", className)} hoverable {...props}>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsDeleteDialogOpen(true)
            }}
            className="absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-destructive focus:outline-none z-10"
            aria-label="Delete persona"
          >
            <XIcon className="size-3.5" />
          </button>
        )}

        <div className="flex items-start gap-5">
          <PersonaAvatar
            name={persona.name}
            size="lg"
          />
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-semibold text-xl tracking-tight text-foreground truncate">{persona.name}</h3>
            </div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest truncate">{persona.occupation}</p>
            {persona.variantOf && (
              <div className="flex items-center gap-1.5 mt-1">
                <GitForkIcon className="w-3 h-3 text-muted-foreground/80 shrink-0" />
                <span className="text-xs font-medium text-muted-foreground/80 truncate">
                  Variant of {persona.variantOf.name}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="h-px w-full bg-border/40" />

          <div className="flex flex-col gap-3">
            {/* Big Five: show the two most distinctive traits */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Conscientiousness</span>
                <span className="text-xs font-bold font-variant-numeric tabular-nums">{persona.conscientiousness}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-sm overflow-hidden">
                <div className="h-full bg-primary rounded-sm" style={{ width: `${persona.conscientiousness}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground/80 font-medium uppercase">
                <span>Chaotic</span>
                <span>Meticulous</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Neuroticism</span>
                <span className="text-xs font-bold font-variant-numeric tabular-nums">{persona.neuroticism}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-sm overflow-hidden">
                <div className="h-full bg-primary rounded-sm" style={{ width: `${persona.neuroticism}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground/80 font-medium uppercase">
                <span>Stable</span>
                <span>Anxious</span>
              </div>
            </div>

            {/* Psychographic snapshot */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {persona.values?.slice(0, 2).map((v, i) => (
                <span key={i} className="text-[11px] font-medium text-primary/80 bg-primary/10 px-2 py-0.5 rounded-sm truncate max-w-[100px]">
                  {v}
                </span>
              ))}
            </div>
            {persona.decisionStyle && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Decides:</span>
                <span className="text-xs font-semibold text-foreground/80 truncate">{persona.decisionStyle}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto flex gap-2">
          {onCreateVariant && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCreateVariant()
              }}
              className="flex-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              Create Variant
            </button>
          )}
          {onChatClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChatClick()
              }}
              className="flex-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 ring-1 ring-primary/20 focus-visible:outline-none"
            >
              Chat with {persona.name.split(' ')[0]}
            </button>
          )}
        </div>
      </MinimalCard>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-full bg-destructive/10 shrink-0">
                <AlertTriangleIcon className="size-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>Delete {persona.name.split(' ')[0]}?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {usedInAnalyses.length > 0 && (
            <div className="mx-6 -mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-600/90 dark:text-amber-400/90 font-medium">
                <span className="font-bold">{persona.name}</span> is used in {usedInAnalyses.length} analysis{usedInAnalyses.length > 1 ? 's' : ''}. The persona will be removed but analysis data will be preserved. Opening it from an analysis will show a "persona deleted" notice.
              </p>
            </div>
          )}

          {usedInAnalyses.length === 0 && (
            <div className="px-6 -mt-2">
              <p className="text-xs text-muted-foreground">
                This persona will be permanently deleted from this batch.
              </p>
            </div>
          )}

          <DialogFooter className="px-6 pb-6 pt-2">
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none"
            >
              Delete Persona
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
