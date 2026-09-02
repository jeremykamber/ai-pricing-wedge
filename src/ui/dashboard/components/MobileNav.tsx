'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserIcon, FileTextIcon, PlayIcon } from 'lucide-react'

function navLinkClass(active: boolean) {
  return `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
    active
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
  }`
}

export function MobileNav() {
  const pathname = usePathname()

  const isPersonas = pathname === '/dashboard'
  const isInterviews = pathname === '/dashboard/interviews'
  const isAnalyses = pathname.startsWith('/dashboard/analyses')

  return (
    <div className="md:hidden h-14 flex items-center gap-3 px-4">
      <Link href="/" className="font-bold tracking-tight text-lg select-none shrink-0">
        Kynd
      </Link>
      <nav className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
        <Link href="/dashboard" className={navLinkClass(isPersonas)}>
          <UserIcon className="h-4 w-4 shrink-0" />
          Personas
        </Link>
        <Link href="/dashboard/interviews" className={navLinkClass(isInterviews)}>
          <FileTextIcon className="h-4 w-4 shrink-0" />
          Interviews
        </Link>
        <Link href="/dashboard/analyses" className={navLinkClass(isAnalyses)}>
          <PlayIcon className="h-4 w-4 shrink-0" />
          Analyses
        </Link>
      </nav>
    </div>
  )
}
