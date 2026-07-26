import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import React from 'react'

// ── Store state (reset per test) ─────────────────────────────────────────

interface MockStoreState {
  batches: any[]
  activeBatchId: string | null
  activeGenerationRunIds: string[]
  simulations: any[]
}

let storeState: MockStoreState

function resetStore(overrides?: Partial<MockStoreState>) {
  storeState = {
    batches: [],
    activeBatchId: null,
    activeGenerationRunIds: [],
    simulations: [],
    ...overrides,
  }
}

// ── PersonaFlow state (reset per test) ───────────────────────────────────

interface MockPersonaFlow {
  customerProfile: string
  personaCount: number
  personas: any[] | null
  personaProgress: { step?: string; error?: string } | null
  isPending: boolean
  error: string | null
  lastCompletedBatchId: string | null
  handleGeneratePersonas: ReturnType<typeof vi.fn>
  handleCancel: ReturnType<typeof vi.fn>
  handleClearProgress: ReturnType<typeof vi.fn>
  setCustomerProfile: ReturnType<typeof vi.fn>
  setPersonaCount: ReturnType<typeof vi.fn>
  setPersonas: ReturnType<typeof vi.fn>
  setError: ReturnType<typeof vi.fn>
}

let personaFlowState: MockPersonaFlow

function resetPersonaFlow(overrides?: Partial<MockPersonaFlow>) {
  personaFlowState = {
    customerProfile: '',
    personaCount: 5,
    personas: null,
    personaProgress: null,
    isPending: false,
    error: null,
    lastCompletedBatchId: null,
    handleGeneratePersonas: vi.fn(),
    handleCancel: vi.fn(),
    handleClearProgress: vi.fn(),
    setCustomerProfile: vi.fn(),
    setPersonaCount: vi.fn(),
    setPersonas: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  }
}

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), custom: vi.fn() },
}))

vi.mock('@/ui/stores/personaStore', () => ({
  usePersonaStore: (selector?: (s: any) => any) => {
    const state = {
      get batches() { return storeState.batches },
      get activeBatchId() { return storeState.activeBatchId },
      get activeGenerationRunIds() { return storeState.activeGenerationRunIds },
      setActiveBatch: vi.fn(),
      addBatch: vi.fn(),
      removeBatch: vi.fn(),
      removePersona: vi.fn(),
      insertPersonasAfter: vi.fn(),
      updatePersona: vi.fn(),
      addActiveGeneration: vi.fn(),
      removeActiveGeneration: vi.fn(),
      getActiveBatch: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/ui/stores/simulationStore', () => ({
  useSimulationStore: (selector?: (s: any) => any) => {
    const state = { simulations: storeState.simulations }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/ui/hooks/usePersonaFlow', () => ({
  usePersonaFlow: () => personaFlowState,
}))

vi.mock('@/actions/generateSimilarPersonas', () => ({
  generateSimilarPersonasAction: vi.fn(),
}))

vi.mock('@ai-sdk/rsc', () => ({
  readStreamableValue: vi.fn(),
}))

vi.mock('@/components/custom/PersonaProfilePanel', () => ({
  PersonaProfilePanel: (p: any) => <div data-testid="persona-card">{p.persona?.name}</div>,
}))
vi.mock('@/components/custom/PersonaSkeletonCard', () => ({
  PersonaSkeletonCard: () => <div data-testid="skeleton-card" />,
}))
vi.mock('@/components/custom/PersonaDetailSheet', () => ({
  PersonaDetailSheet: () => null,
}))
vi.mock('@/components/custom/FlowDialog', () => ({
  FlowDialog: ({ children }: any) => <div data-testid="flow-dialog">{children}</div>,
}))
vi.mock('@/components/custom/MinimalCard', () => ({
  MinimalCard: ({ children }: any) => <div>{children}</div>,
}))
vi.mock('@/components/ui/progress', () => ({ Progress: () => null }))
vi.mock('@/components/ui/textarea', () => ({
  Textarea: (p: any) => <textarea data-testid="audience-textarea" {...p} />,
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...p }: any) => <button onClick={onClick} {...p}>{children}</button>,
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, asChild, ...p }: any) =>
    asChild ? children : <button onClick={onClick} {...p}>{children}</button>,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a>,
}))
vi.mock('lucide-react', () => {
  const I = () => <svg />
  return { LayersIcon: I, SparklesIcon: I, PlayIcon: I, PlusIcon: I, ChevronDownIcon: I, FileTextIcon: I, PenIcon: I, ClockIcon: I, ArrowRightIcon: I, XIcon: I }
})

import { DashboardClient } from '../DashboardClient'

// ── Helpers ──────────────────────────────────────────────────────────────

const SETUP_HEADING = 'Define your target market'

function setupVisible(): boolean {
  return document.querySelectorAll('h1').length > 0 &&
    Array.from(document.querySelectorAll('h1')).some(el => el.textContent === SETUP_HEADING)
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('DashboardClient — setup view visibility (isGenerating logic)', () => {
  beforeEach(() => {
    resetStore()
    resetPersonaFlow()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows setup view for first-time user (no batches)', () => {
    render(<DashboardClient />)
    expect(setupVisible()).toBe(true)
  })

  it('does NOT show setup view when batches exist and showSetup is false', () => {
    resetStore({ batches: [{ id: 'b1', label: 'Test', source: 'description', createdAt: '', personas: [] }] })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(false)
  })

  // ── isGenerating gate tests ────────────────────────────────────────────

  it('hides setup view when personaProgress.step is BRAINSTORMING_PERSONAS', () => {
    resetPersonaFlow({ personaProgress: { step: 'BRAINSTORMING_PERSONAS' } })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(false)
  })

  it('hides setup view when personaProgress.step is GENERATING_BACKSTORIES', () => {
    resetPersonaFlow({ personaProgress: { step: 'GENERATING_BACKSTORIES' } })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(false)
  })

  it('hides setup view when personaProgress.step is ADDING_BEHAVIORAL_DEPTH', () => {
    resetPersonaFlow({ personaProgress: { step: 'ADDING_BEHAVIORAL_DEPTH' } })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(false)
  })

  it('hides setup view when activeRunIds is non-empty', () => {
    resetStore({ activeGenerationRunIds: ['run-1'] })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(false)
  })

  // ── Terminal states should NOT block setup ──────────────────────────────

  it('shows setup view when personaProgress.step is DONE', () => {
    resetPersonaFlow({
      personas: [{ id: 'p1', name: 'Done' }],
      personaProgress: { step: 'DONE' },
    })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(true)
  })

  it('shows setup view when personaProgress.step is ERROR', () => {
    resetPersonaFlow({ personaProgress: { step: 'ERROR', error: 'boom' } })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(true)
  })

  // ── THE BUG: null/undefined personaProgress with existing personas ──────

  it('shows setup view when personaProgress is null but personas exist (the original bug)', () => {
    resetPersonaFlow({
      personas: [{ id: 'p1', name: 'Prior' }],
      personaProgress: null,
    })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(true)
  })

  it('shows setup view when personaProgress exists but step is undefined', () => {
    resetPersonaFlow({
      personas: [{ id: 'p1', name: 'Prior' }],
      personaProgress: { step: undefined },
    })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(true)
  })

  // ── activeRunIds overrides terminal personaProgress ─────────────────────

  it('hides setup view when activeRunIds present even with DONE personaProgress', () => {
    resetStore({ activeGenerationRunIds: ['run-1'] })
    resetPersonaFlow({ personaProgress: { step: 'DONE' } })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(false)
  })

  it('hides setup view when activeBatchId is set', () => {
    resetStore({ activeBatchId: 'b1', batches: [{ id: 'b1', label: 'X', source: 'description', createdAt: '', personas: [] }] })
    render(<DashboardClient />)
    expect(setupVisible()).toBe(false)
  })

  // ── Regression: useEffect must NOT close setup after effects settle ─────

  it('does NOT close setup view via useEffect when personaProgress is null (regression)', async () => {
    resetPersonaFlow({
      personas: [{ id: 'p1', name: 'Prior' }],
      personaProgress: null,
    })
    render(<DashboardClient />)
    // Flush all pending effects (useEffect runs after paint)
    await act(() => new Promise(r => setTimeout(r, 0)))
    expect(setupVisible()).toBe(true)
  })
})
