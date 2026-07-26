# Navigation & Onboarding Redesign — Implementation Plan

**Goal:** Fix three UX issues in the dashboard — add interview link to onboarding, fix sidebar batch navigation, and move simulation CTA to the simulations page.

**Architecture:** Pure UI refactor. No domain, use-case, adapter, or store schema changes. All changes live in 4 files across `src/ui/dashboard/components/` and `src/app/(app)/dashboard/simulations/`. The simulation store and persona store APIs are used as-is.

**Design:** `thoughts/shared/designs/2026-07-11-navigation-and-onboarding-redesign-design.md`

---

## Dependency Graph

```
Batch 0 (prerequisite): 0.1 [install shadcn Select component]
Batch 1 (parallel): 1.1, 1.2, 1.3, 1.4 [all independent — no cross-file deps]
Batch 2 (smoke test): 2.1 [verify all changes work together]
```

Task 0.1 must complete before 1.4 (which imports `Select`). Tasks 1.1, 1.2, 1.3 are independent of each other and of 0.1.

---

## What We Will Do

0. Install shadcn/ui `Select` component (`bunx shadcn@latest add select` — adds `@radix-ui/react-select` + `src/components/ui/select.tsx`)
1. Add a secondary "Have interview transcripts?" link below the primary CTA in `SetupView.tsx`
2. Make the sidebar "Personas" link clear `activeBatchId` so it always shows the batch list
3. Remove the "Run Report" simulation controls from `DashboardClient.tsx` (batch view for interview-sourced batches)
4. Remove the "Step 2: Test Environment" simulation section from `SetupView.tsx` (post-generation sim)
5. Add a "Run New Simulation" CTA form (batch selector + URL input) to `simulations/page.tsx`
6. Update the simulations page empty state copy (no longer says "go to dashboard")
7. Clean up `SetupView` props — remove `analysisFlow`, `currentSimulationId`, `onStartSimulation` since simulation is no longer part of setup

## What We Will NOT Do

- No domain entity changes
- No store schema changes
- No new components or files (all changes are inline edits)
- No changes to `useAnalysisFlow`, `usePersonaFlow`, `personaStore`, or `simulationStore`
- No changes to `generatePersonasAction` or any server actions
- No interview page changes

---

## Batch 0: Prerequisite

### Task 0.1: Install shadcn/ui Select Component

**Depends:** none

**What to do:** Run `bunx shadcn@latest add select` to install the Select component. This adds:
- `src/components/ui/select.tsx` — the component
- `@radix-ui/react-select` to `package.json`

**Verify:** The file exists and exports `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`.

---

## Batch 1: Independent File Changes (parallel — 4 implementers)

### Task 1.1: Add Interview Link to SetupView

**File:** `src/ui/dashboard/components/views/SetupView.tsx`
**Depends:** none

**What changes:**
- Add a secondary CTA below the "Generate Personas" button: a text link pointing to `/dashboard/interviews`
- Remove the entire "Step 2: Test Environment" section (URL input + "Run Simulation" button) — simulations are no longer triggered from setup
- Remove unused props: `analysisFlow`, `currentSimulationId`, `onStartSimulation`
- Remove unused imports: `useAnalysisFlow` (no longer used in this component), `Link` and `ExternalLinkIcon` from lucide (replace with Next.js `Link` — actually `Link` is already imported from `next/link`)
- Keep: "Load Demo Personas" and "Load Demo Analysis" buttons, textarea + "Generate Personas" button, `FlowDialog` remains in parent

**Complete new file:**

```tsx
"use client"

import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { MOCK_PERSONAS } from '@/domain/entities/MockPersonas'
import { MOCK_ANALYSES } from '@/domain/entities/MockAnalyses'
import Link from 'next/link'
import { ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SetupViewProps {
  personaFlow: ReturnType<typeof usePersonaFlow>
}

export function SetupView({ personaFlow }: SetupViewProps) {
  const loadMockPersonas = () => {
    personaFlow.setPersonas(MOCK_PERSONAS)
  }

  const loadMockAnalysis = () => {
    personaFlow.setPersonas(MOCK_PERSONAS)
  }

  return (
    <div className="flex flex-col gap-16 max-w-4xl mx-auto w-full">
      <div className="flex justify-end gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={loadMockPersonas}
          className="text-muted-foreground hover:text-foreground"
        >
          Load Demo Personas
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadMockAnalysis}
          className="text-muted-foreground hover:text-foreground"
        >
          Load Demo Analysis
        </Button>
      </div>
      <div className="flex flex-col gap-4 text-center items-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
          Define your target market
        </h1>
        <p className="text-lg text-muted-foreground text-balance max-w-2xl">
          Provide a brief description of who you are trying to reach. Kynd will synthesize a set of detailed personas that represent your audience.
        </p>
      </div>

      <div className="grid gap-12">
        {/* Step 1: Customer Profile */}
        <section className="flex flex-col gap-6 relative">
          <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary text-primary font-bold hidden md:flex">
            1
          </div>
          <MinimalCard>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight">Audience Description</h2>
                <p className="text-sm text-muted-foreground">Describe your ideal customer, their pain points, and demographics.</p>
              </div>
              <textarea
                className="w-full min-h-[160px] resize-y rounded-md border border-input bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="e.g. B2B SaaS Founders dealing with high churn rates, usually aged 30-45..."
                value={personaFlow.customerProfile}
                onChange={(e) => personaFlow.setCustomerProfile(e.target.value)}
                disabled={personaFlow.isPending}
              />
              <div className="flex items-center justify-between">
                <Button variant="link" asChild className="h-auto p-0 text-muted-foreground">
                  <Link href="/dashboard/interviews" className="inline-flex items-center gap-1">
                    Have interview transcripts? Generate from interviews
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  disabled={!personaFlow.customerProfile.trim() || personaFlow.isPending}
                  onClick={personaFlow.handleGeneratePersonas}
                >
                  {personaFlow.isPending ? "Generating..." : "Generate Personas"}
                </Button>
              </div>
              {personaFlow.error && (
                <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">{personaFlow.error}</p>
              )}
            </div>
          </MinimalCard>
        </section>
      </div>
    </div>
  )
}
```

**Key decisions:**
- The interview link is placed on the left of the button row (left side of `justify-between`), with the primary CTA on the right. This follows the design spec's "secondary CTA below primary" without breaking the form layout.
- Removed `hasPersonas` prop — SetupView is only shown when there are zero batches (see `DashboardClient.tsx` line: `const showSetupView = batches.length === 0`). The `hasPersonas` prop was always `false` here.
- Removed `loadMockAnalysis`'s call to `analysisFlow.setAnalyses` since we removed `analysisFlow` from props.
- Used `ArrowRightIcon` from lucide (already a project dependency) for the link arrow.

**Verify:** `bun run build` — no type errors, component renders correctly with textarea + interview link + Generate button.

**Commit:** `feat(dashboard): add interview link to setup view, remove simulation step`

---

### Task 1.2: Fix Sidebar "Personas" Click Handler

**File:** `src/ui/dashboard/components/Sidebar.tsx`
**Depends:** none

**What changes:**
- The "Personas" nav link is currently a plain `<Link href="/dashboard">` — clicking it navigates but doesn't clear `activeBatchId`
- Change it to use `onClick` + `router.push` so we can call `setActiveBatch(null)` before navigation
- Import `useRouter` from `next/navigation`

**Complete new file:**

```tsx
'use client'

import { usePersonaStore } from '@/ui/stores/personaStore'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { UserIcon, FileTextIcon, LayersIcon, PlayIcon } from 'lucide-react'

export function Sidebar() {
  const batches = usePersonaStore((s) => s.batches)
  const activeBatchId = usePersonaStore((s) => s.activeBatchId)
  const setActiveBatch = usePersonaStore((s) => s.setActiveBatch)
  const pathname = usePathname()
  const router = useRouter()

  const isInterviews = pathname === '/dashboard/interviews'
  const isSimulations = pathname.startsWith('/dashboard/simulations')
  const isSettings = pathname === '/dashboard/settings'
  const isPersonas = !isInterviews && !isSettings && !isSimulations

  const handlePersonasClick = () => {
    setActiveBatch(null)
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
          href="/dashboard/simulations"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
            isSimulations
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <PlayIcon className="h-4 w-4" />
          Simulations
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
                  onClick={() => setActiveBatch(batch.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors text-left w-full ${
                    activeBatchId === batch.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  <LayersIcon className="h-3.5 w-3.5 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">{batch.label}</span>
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
```

**Key decisions:**
- Changed `<Link>` to `<button>` for the Personas nav item so we can call `setActiveBatch(null)` before navigation. This is the minimal change — no restructuring needed.
- The `isPersonas` boolean is extracted as a variable for clarity (was an inline ternary before).
- The "Recent Batches" section is unchanged — clicking a batch there still calls `setActiveBatch(batch.id)`.
- The `useRouter` import is added alongside existing `usePathname`.

**Verify:** `bun run build` — no type errors.

**Commit:** `fix(sidebar): clear active batch when clicking Personas nav item`

---

### Task 1.3: Remove Simulation Controls from Batch View

**File:** `src/ui/dashboard/components/DashboardClient.tsx`
**Depends:** none

**What changes:**
- Remove the "Run Report" section (URL input + "Run Pricing Simulation" button + error display) that appears for interview-sourced batches
- Remove `useAnalysisFlow` import and hook call — no longer used in this component
- Remove `analysisFlow` prop from `<SetupView>` (simplified)
- Remove `FlowDialog` import (it was only shown for `showSetupView` — still needed, but let me re-check)

Wait — `FlowDialog` IS still needed. It's the generation progress dialog shown when `showSetupView && personaFlow.personaProgress`. That stays.

**What is removed from the batch view (lines ~123-160 in the original):**
```tsx
{activeBatch.source === 'interviews' && (
  <div className="border-t border-border/40 pt-8 mt-8">
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold tracking-tight">Run Report</h3>
        ...
      </div>
      <div className="flex flex-col sm:flex-row gap-4">
        <input ... />
        <button ...>Run Pricing Simulation</button>
      </div>
      {analysisFlow.error && (...)}
    </div>
  </div>
)}
```

**What is changed in the SetupView call:**
```tsx
// Before:
<SetupView
  personaFlow={personaFlow}
  analysisFlow={analysisFlow}
  hasPersonas={false}
/>

// After:
<SetupView personaFlow={personaFlow} />
```

**Complete diff of DashboardClient.tsx changes:**

1. **Remove imports:**
   - Remove `useAnalysisFlow` import
   - (Keep all other imports)

2. **Remove hook call:**
   - Remove `const analysisFlow = useAnalysisFlow()` (line ~33)

3. **Remove from SetupView JSX:**
   - Change `<SetupView personaFlow={personaFlow} analysisFlow={analysisFlow} hasPersonas={false} />` to `<SetupView personaFlow={personaFlow} />`

4. **Remove the entire "Run Report" block** from the batch view (the `{activeBatch.source === 'interviews' && (...)}` block)

**Verify:** `bun run build` — no type errors from removed props or unused variables.

**Commit:** `refactor(dashboard): remove simulation controls from batch view and setup`

---

### Task 1.4: Add "Run New Simulation" CTA to Simulations Page

**File:** `src/app/(app)/dashboard/simulations/page.tsx`
**Depends:** none

**What changes:**
- Add a "Run New Simulation" button at the top of the simulations page
- When clicked, reveal an inline form with: batch selector (native `<select>` styled with Tailwind) + URL input + "Run" button
- The form uses `usePersonaStore` to list available batches, `useAnalysisFlow` to trigger the simulation
- Update the empty state copy — no longer says "go to dashboard"

**Key implementation decisions:**
- **Use shadcn/ui components throughout.** Install `Select` via `bunx shadcn@latest add select` (adds `@radix-ui/react-select`). Use the existing `Input` and `Button` components from `@/components/ui/`.
- **Follow DESIGN.md styling:** Flat design, no shadows, tonal layering via OKLCH, `rounded-md` (6px), 1px borders, Geist font family. The shadcn components already use CSS variables that match the DESIGN.md tokens.
- The `useAnalysisFlow` hook takes an `onSuccess` callback — here we can redirect to the simulation detail page after completion.
- The batch selector defaults to the first batch. If no batches exist, show a message to create one first.
- The form is collapsible — clicking "Run New Simulation" toggles it open. Clicking again or pressing Escape closes it.
- Replace all raw `<button>`, `<input>`, `<select>` elements with shadcn `Button`, `Input`, `Select` components across ALL 4 tasks (SetupView, Sidebar, DashboardClient, SimulationsPage).
- For the "Generate Personas" button in SetupView: use `<Button variant="default" size="lg">`.
- For the "Run New Simulation" CTA button: use `<Button variant="default" size="sm">`.
- For the interview link in SetupView: use `<Button variant="link">`.
- For demo buttons in SetupView: use `<Button variant="ghost" size="sm">`.

**Complete new file:**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClockIcon, GlobeIcon, UsersIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon, PlusIcon } from 'lucide-react'
import { computeRunAverages } from '@/ui/dashboard/utils/computeBenchmarks'
import { Persona } from '@/domain/entities/Persona'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function SimulationCard({ simulation }: { simulation: import('@/domain/entities/Simulation').Simulation }) {
  const router = useRouter()
  const removeSimulation = useSimulationStore((s) => s.removeSimulation)

  const statusConfig = {
    IN_PROGRESS: { label: 'In Progress', icon: ClockIcon, class: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    COMPLETED: { label: 'Completed', icon: CheckCircleIcon, class: 'text-green-500 bg-green-500/10 border-green-500/20' },
    ERROR: { label: 'Error', icon: XCircleIcon, class: 'text-destructive bg-destructive/10 border-destructive/20' },
    CANCELLED: { label: 'Cancelled', icon: AlertCircleIcon, class: 'text-muted-foreground bg-muted/30 border-muted/40' },
  }[simulation.status]

  const StatusIcon = statusConfig.icon

  const runAverages = useMemo(() => {
    if (simulation.status === 'COMPLETED' && simulation.analyses && simulation.analyses.length > 0) {
      return computeRunAverages(simulation.analyses)
    }
    return null
  }, [simulation.analyses, simulation.status])

  return (
    <div className="relative group">
      <button
        onClick={() => router.push(`/dashboard/simulations/${simulation.id}`)}
        className="w-full text-left rounded-lg border border-border bg-card p-5 transition-all hover:border-border/80 hover:shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold truncate">{simulation.name}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig.class}`}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
                {simulation.status === 'IN_PROGRESS' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                )}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <GlobeIcon className="h-3 w-3" />
                {simulation.url}
              </span>
              <span className="flex items-center gap-1">
                <UsersIcon className="h-3 w-3" />
                {simulation.personaCount} personas
              </span>
            </div>
            {simulation.batchName && (
              <p className="text-xs text-muted-foreground/70">Batch: {simulation.batchName}</p>
            )}
            {simulation.status === 'COMPLETED' && runAverages && (
              <div className="flex items-center gap-2 mt-1">
                {[
                  { key: 'clarity', label: 'Clarity' },
                  { key: 'trust', label: 'Trust' },
                  { key: 'buyIntent', label: 'Buy' },
                ].map(({ key, label }) => {
                  const val = (runAverages as any)[key] ?? 0;
                  const pct = (val / 10) * 100;
                  const bgColor = val >= 7 ? 'rgba(34,197,94,0.12)' : val >= 4 ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.12)';
                  const borderColor = val >= 7 ? 'border-green-500/25' : val >= 4 ? 'border-amber-500/25' : 'border-red-500/25';
                  return (
                    <div key={key} className={`relative rounded-md border ${borderColor} overflow-hidden min-w-[56px]`}>
                      <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, backgroundColor: bgColor }} />
                      <div className="relative p-1.5 flex flex-col items-center z-10">
                        <span className="text-sm font-bold tabular-nums leading-tight">{val.toFixed(1)}</span>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(simulation.createdAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {simulation.completedAt && simulation.status !== 'IN_PROGRESS' && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 whitespace-nowrap">
                {new Date(simulation.completedAt).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
        {simulation.status === 'IN_PROGRESS' && simulation.totalAnalyses && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{simulation.completedAnalyses ?? 0}/{simulation.totalAnalyses} analyses</span>
              <span className="tabular-nums font-medium">{Math.round(((simulation.completedAnalyses ?? 0) / simulation.totalAnalyses) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((simulation.completedAnalyses ?? 0) / simulation.totalAnalyses) * 100}%` }}
              />
            </div>
          </div>
        )}
        {simulation.error && (
          <p className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">{simulation.error}</p>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          removeSimulation(simulation.id)
        }}
        className="absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-destructive focus:outline-none"
        aria-label="Delete simulation"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

function NewSimulationForm({ onRun }: { onRun: (url: string, personas: Persona[]) => void }) {
  const batches = usePersonaStore((s) => s.batches)
  const [selectedBatchId, setSelectedBatchId] = useState<string>(batches[0]?.id ?? '')
  const [url, setUrl] = useState('')

  const selectedBatch = batches.find((b) => b.id === selectedBatchId)

  const handleSubmit = () => {
    if (!url.trim() || !selectedBatch) return
    onRun(url, selectedBatch.personas)
  }

  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>Create a persona batch first, then come back to run a simulation.</p>
          <Button asChild variant="default" size="sm" className="w-fit">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="batch-select" className="text-sm font-medium">Persona Batch</label>
          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
            <SelectTrigger id="batch-select">
              <SelectValue placeholder="Select a batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.label} — {batch.personas.length} personas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="pricing-url" className="text-sm font-medium">Pricing Page URL</label>
          <Input
            id="pricing-url"
            type="url"
            placeholder="https://your-startup.com/pricing"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <Button
          disabled={!url.trim()}
          onClick={handleSubmit}
        >
          Run Simulation
        </Button>
      </CardContent>
    </Card>
  )
}

export default function SimulationsPage() {
  const simulations = useSimulationStore((s) => s.simulations)
  const analysisFlow = useAnalysisFlow()
  const [showNewForm, setShowNewForm] = useState(false)

  const inProgress = simulations.filter((s) => s.status === 'IN_PROGRESS')
  const completed = simulations.filter((s) => s.status !== 'IN_PROGRESS')

  const handleRunSimulation = (url: string, personas: Persona[]) => {
    analysisFlow.setPricingUrl(url)
    analysisFlow.handleAnalyzePricing(personas)
    setShowNewForm(false)
  }

  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Simulations</h1>
          <p className="text-sm text-muted-foreground">
            {simulations.length === 0
              ? 'No simulations yet. Run your first simulation to get started.'
              : `${completed.length} completed · ${inProgress.length} in progress`}
          </p>
        </div>
        <Button
          onClick={() => setShowNewForm(!showNewForm)}
          size="sm"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Run New Simulation
        </Button>
      </div>

      {showNewForm && (
        <NewSimulationForm onRun={handleRunSimulation} />
      )}

      {analysisFlow.isPending && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-600 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          Simulation is running…
          <Link
            href="/dashboard/simulations"
            className="ml-auto text-xs font-medium text-blue-600 hover:underline"
          >
            Refresh
          </Link>
        </div>
      )}

      {inProgress.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </h2>
          <div className="flex flex-col gap-3">
            {inProgress.map((sim) => (
              <SimulationCard key={sim.id} simulation={sim} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Completed
          </h2>
          <div className="flex flex-col gap-3">
            {completed.map((sim) => (
              <SimulationCard key={sim.id} simulation={sim} />
            ))}
          </div>
        </section>
      )}

      {simulations.length === 0 && !showNewForm && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
            <ClockIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm max-w-sm">
            No simulations yet. Click "Run New Simulation" above to get started.
          </p>
        </div>
      )}
    </div>
  )
}
```

**Key decisions:**
- Used native `<select>` + `<input>` styled with Tailwind to match existing form patterns (see SetupView, Sidebar). No new shadcn/ui component dependency.
- The `NewSimulationForm` component reads batches from `usePersonaStore` directly — this is already a Zustand store consumed by many UI components, so no architectural concern.
- The `useAnalysisFlow` hook is instantiated in the page-level component. It manages its own state (URL, pending, error). We call `setPricingUrl` then `handleAnalyzePricing` on form submit.
- Empty state copy updated: "No simulations yet. Click 'Run New Simulation' above to get started." — no more "go to dashboard" redirect.
- Added a `PlusIcon` import from lucide (already a dependency) for the CTA button.
- The `analysisFlow.isPending` banner at the top gives feedback that a simulation is running — useful when the user is on the simulations page and kicked off a new run.

**Verify:** `bun run build` — no type errors.

**Commit:** `feat(simulations): add run new simulation CTA with batch selector and URL form`

---

## Batch 2: Smoke Test

### Task 2.1: Full Build + Type Check

**Depends:** 1.1, 1.2, 1.3, 1.4

Run `bun run build` and verify:
- No TypeScript errors
- No import errors (removed props/hooks don't break anything)
- The 4 pages render: `/dashboard`, `/dashboard/interviews`, `/dashboard/simulations`, `/dashboard/settings`

**Verify:** `bun run build && bun run lint`

---

## Success Criteria

1. **Sidebar:** Clicking "Personas" always shows the batch list (clears activeBatchId), even if a batch was previously selected
2. **Sidebar:** Clicking a specific batch in "Recent Batches" still shows that batch's personas
3. **Sidebar:** "Personas" nav item stays highlighted when viewing a specific batch (still in the Personas section)
4. **SetupView:** Secondary CTA link "Have interview transcripts? Generate from interviews →" appears below the textarea
5. **SetupView:** Link navigates to `/dashboard/interviews`
6. **SetupView:** No simulation controls (Step 2 section removed)
7. **Batch view:** No "Run Report" section with URL input and simulation button
8. **Simulations page:** "Run New Simulation" button appears at top
9. **Simulations page:** Clicking the button reveals a form with batch dropdown + URL input + "Run Simulation" button
10. **Simulations page:** Form lists all available batches from `personaStore`
11. **Simulations page:** Submitting the form triggers `useAnalysisFlow.handleAnalyzePricing` with the selected batch's personas
12. **Simulations page:** Empty state says "No simulations yet. Click 'Run New Simulation' above to get started."
13. **Type safety:** No TypeScript errors, all removed props/hooks are cleaned up
