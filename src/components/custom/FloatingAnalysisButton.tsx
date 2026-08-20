'use client'

import { PlayIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { usePersonaStore } from '@/ui/stores/personaStore'

/**
 * Global floating "Run Analysis" CTA. Always visible — greyed out when the
 * user has no persona batches yet.
 */
export function FloatingAnalysisButton() {
  const router = useRouter()
  const hasBatches = usePersonaStore((s) => s.batches.length > 0)

  return (
    <button
      onClick={() => {
        if (hasBatches) router.push('/dashboard/analyses')
      }}
      className={`fixed bottom-6 right-6 z-40 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold shadow-lg transition-all ${
        hasBatches
          ? 'border-border bg-background text-foreground hover:bg-accent cursor-pointer'
          : 'border-border/40 bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
      }`}
    >
      <PlayIcon
        className={`h-3.5 w-3.5 ${hasBatches ? '' : 'opacity-40'}`}
      />
Run Analysis
    </button>
  )
}
