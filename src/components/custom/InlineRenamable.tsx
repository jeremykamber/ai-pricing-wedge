'use client'

import { useState } from 'react'
import { PencilIcon, CheckIcon, XIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'

/**
 * Renders a value with a hover pencil that swaps it for an inline input.
 * Used to let users rename simulations and persona batches. Plain text on the
 * outside (no nested buttons) so it can sit inside clickable cards.
 */
export function InlineRenamable({
  value,
  onRename,
  className,
}: {
  value: string
  onRename: (next: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const start = () => {
    setDraft(value)
    setEditing(true)
  }
  const commit = () => {
    const next = draft.trim()
    if (next && next !== value) onRename(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={commit}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="h-7 w-56 text-sm"
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            commit()
          }}
          aria-label="Save name"
          className="text-muted-foreground hover:text-foreground"
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setEditing(false)
          }}
          aria-label="Cancel rename"
          className="text-muted-foreground hover:text-foreground"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    )
  }

  return (
    <span className={`group/title inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="truncate font-semibold">{value}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          start()
        }}
        className="opacity-0 group-hover/title:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Rename"
      >
        <PencilIcon className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}
