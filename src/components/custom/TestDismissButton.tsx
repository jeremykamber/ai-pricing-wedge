'use client'

import { toast } from 'sonner'
import { CheckCircleIcon, XIcon } from 'lucide-react'

/**
 * TEMPORARY — delete after testing the dismiss button.
 * Shows a fake "3 Personas Ready" success toast with the dismiss X.
 */
export function TestDismissButton() {
  const handleTest = () => {
    toast.custom(
      () => (
        <div className="relative group rounded-lg border border-border bg-card">
          <div
            className="absolute inset-y-0 left-0 bg-primary/[0.06] transition-all duration-300 ease-out"
            style={{ width: '100%' }}
          />
          <div className="relative z-10 flex items-center gap-3 p-4">
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">3 Personas Ready</p>
              <p className="text-xs text-muted-foreground">Test dismiss button</p>
            </div>
            <button
              onClick={() => toast.dismiss('test-dismiss-toast')}
              className="shrink-0 text-xs font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
            >
              View Batch
            </button>
            <button
              onClick={() => toast.dismiss('test-dismiss-toast')}
              className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Dismiss"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        </div>
      ),
      {
        id: 'test-dismiss-toast',
        dismissible: true,
        duration: Infinity,
      }
    )
  }

  return (
    <button
      onClick={handleTest}
      className="fixed bottom-4 left-4 z-50 px-3 py-1.5 text-xs font-mono bg-yellow-500/20 text-yellow-600 border border-yellow-500/30 rounded-md hover:bg-yellow-500/30 transition-colors"
    >
      TEST DISMISS
    </button>
  )
}
