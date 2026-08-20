'use client'

import { usePersonaStore } from '@/ui/stores/personaStore'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { UserIcon, FileTextIcon, LayersIcon, PlayIcon, SparklesIcon } from 'lucide-react'

export function Sidebar() {
  const batches = usePersonaStore((s) => s.batches)
  const activeBatchId = usePersonaStore((s) => s.activeBatchId)
  const setActiveBatch = usePersonaStore((s) => s.setActiveBatch)
  const pathname = usePathname()
  const router = useRouter()

  const isInterviews = pathname === '/dashboard/interviews'
  const isAnalyses = pathname.startsWith('/dashboard/analyses')
  const isPersonas = pathname === '/dashboard'

  const handlePersonasClick = () => {
    if (pathname === '/dashboard') {
      setActiveBatch(null)
    }
    router.push('/dashboard')
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border/40 bg-sidebar flex flex-col h-full">
      {/* Logo area */}
      <div className="h-14 flex items-center px-6 border-b border-border/40">
        <Link href="/" className="font-bold tracking-tight text-lg select-none">Kynd</Link>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col p-3 gap-1">
        <Button
          variant="ghost"
          onClick={handlePersonasClick}
          className={`justify-start gap-3 px-3 py-2.5 h-auto text-sm font-medium ${
            isPersonas
              ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <UserIcon className="h-4 w-4" />
          Personas
        </Button>
        <Link
          href="/dashboard/interviews"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
            isInterviews
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <FileTextIcon className="h-4 w-4" />
          Interviews
        </Link>
        <Link
          href="/dashboard/analyses"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
            isAnalyses
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <PlayIcon className="h-4 w-4" />
          Analyses
        </Link>
      </nav>

      {/* Batches section */}
      {batches.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Batches
            </span>
          </div>
          <ScrollArea className="flex-1 px-3">
            <div className="flex flex-col gap-0.5">
              {batches.map((batch) => (
                <button
                  key={batch.id}
                  onClick={() => {
                    setActiveBatch(batch.id)
                    if (pathname !== '/dashboard') router.push('/dashboard')
                  }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors text-left w-full ${
                    activeBatchId === batch.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  <LayersIcon className="h-3.5 w-3.5 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium flex items-center gap-1.5">
                      {batch.label}
                      {batch.id === 'demo-batch' && (
                        <SparklesIcon className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      )}
                    </span>
                    <span className="text-[10px] opacity-60">
                      {batch.personas.length} personas · {new Date(batch.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </aside>
  )
}
