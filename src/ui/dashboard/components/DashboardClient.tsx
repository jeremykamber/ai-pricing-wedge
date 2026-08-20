'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'

import { SetupView } from './views/SetupView'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { PersonaProfilePanel } from '@/components/custom/PersonaProfilePanel'
import { PersonaSkeletonCard } from '@/components/custom/PersonaSkeletonCard'
import { PersonaDetailSheet } from '@/components/custom/PersonaDetailSheet'
import type { VariationFormData } from '@/components/custom/SimilarPersonaDialog'
import { LayersIcon, SparklesIcon, PlayIcon, PlusIcon, ChevronDownIcon, FileTextIcon, PenIcon, ClockIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { FlowDialog } from '@/components/custom/FlowDialog'
import { InlineRenamable } from '@/components/custom/InlineRenamable'
import { Progress } from '@/components/ui/progress'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Persona } from '@/domain/entities/Persona'
import { readStreamableValue } from '@ai-sdk/rsc'
import { generateSimilarPersonasAction } from '@/actions/generateSimilarPersonas'
import { useAnalysisStore } from '@/ui/stores/analysisStore'

export function DashboardClient() {
    const router = useRouter()
    const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
    const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)
    const [sheetDefaultTab, setSheetDefaultTab] = useState<"profile" | "chat" | "variant">("profile")
    const [pendingPersonaIds, setPendingPersonaIds] = useState<Set<string>>(new Set())
    const [showSetup, setShowSetup] = useState(false)
    const [showExpandedFlow, setShowExpandedFlow] = useState(false)
    const batches = usePersonaStore((s) => s.batches)
    const activeRunIds = usePersonaStore((s) => s.activeGenerationRunIds)
    const activeBatchId = usePersonaStore((s) => s.activeBatchId)
    const setActiveBatch = usePersonaStore((s) => s.setActiveBatch)
    const insertPersonasAfter = usePersonaStore((s) => s.insertPersonasAfter)
    const updatePersona = usePersonaStore((s) => s.updatePersona)
    const removePersona = usePersonaStore((s) => s.removePersona)
    const removeBatch = usePersonaStore((s) => s.removeBatch)
    const updateBatchLabel = usePersonaStore((s) => s.updateBatchLabel)
    const personaFlow = usePersonaFlow()

    // True when a generation is actively running (not completed or errored).
    // Used to auto-exit the setup view and to gate the "New Batch" flow.
    const isGenerating = activeRunIds.length > 0 ||
        // Loose != catches both null and undefined — step is absent before/after clear
        (personaFlow.personaProgress?.step != null &&
         personaFlow.personaProgress.step !== 'DONE' &&
         personaFlow.personaProgress.step !== 'ERROR')

    // Auto-exit setup view when generation starts — the batch list view
    // handles active-visibility via skeleton cards + toast.
    useEffect(() => {
        if (!showSetup) return
        if (isGenerating) setShowSetup(false)
    }, [showSetup, isGenerating])

    const toastIdRef = useRef<string | number | null>(null)

    const activeBatch = activeBatchId
        ? batches.find((b) => b.id === activeBatchId)
        : null

    const analyses = useAnalysisStore((s) => s.analyses)
    const batchAnalysisCount = activeBatchId
        ? analyses.filter((s) => s.batchId === activeBatchId).length
        : 0

    const getPersona = (id: string) => activeBatch?.personas.find(p => p.id === id) ?? null
    const selectedPersona = selectedPersonaId ? getPersona(selectedPersonaId) : null

    const handleOpenDetail = (id: string) => {
        setSelectedPersonaId(id)
        setSheetDefaultTab("profile")
        setIsDetailSheetOpen(true)
    }

    const handleOpenChat = (persona: Persona) => {
        setSelectedPersonaId(persona.id)
        setSheetDefaultTab("chat")
        setIsDetailSheetOpen(true)
    }

    const handleOpenVariant = (persona: Persona) => {
        setSelectedPersonaId(persona.id)
        setSheetDefaultTab("variant")
        setIsDetailSheetOpen(true)
    }

    const handleDeletePersona = (personaId: string) => {
        if (activeBatchId) {
            removePersona(activeBatchId, personaId)
        }
    }

    const handleCloseSheet = () => {
        setIsDetailSheetOpen(false)
        setSelectedPersonaId(null)
    }

    const handleGenerateVariation = useCallback(
        async (referencePersona: Persona, formData: VariationFormData) => {
            const batchId = usePersonaStore.getState().activeBatchId
            if (!batchId) return

            // 1. Create placeholder personas with shimmer
            const placeholderIds: string[] = []
            const placeholders: Persona[] = []

            for (let i = 0; i < formData.count; i++) {
                const placeholderId = `placeholder-${Date.now()}-${i}`
                placeholderIds.push(placeholderId)
                placeholders.push({
                    id: placeholderId,
                    name: 'Generating...',
                    age: 0,
                    occupation: '',
                    educationLevel: '',
                    interests: [],
                    goals: [],
                    conscientiousness: 50,
                    neuroticism: 50,
                    openness: 50,
                    extraversion: 50,
                    agreeableness: 50,
                    values: [],
                    fears: [],
                    communicationStyle: '',
                    decisionStyle: '',
                    pricingSensitivity: 50,
                    typicalBudget: '',
                    variantOf: { id: referencePersona.id, name: referencePersona.name },
                })
            }

            // 2. Insert placeholders right after the reference persona
            insertPersonasAfter(batchId, referencePersona.id, placeholders)
            console.log("[DashboardClient] Variation flow started - reference:", referencePersona.name, "count:", formData.count, "placeholders:", placeholderIds.length);
            setPendingPersonaIds((prev) => {
                const next = new Set(prev)
                placeholderIds.forEach((id) => next.add(id))
                return next
            })

            // 3. Show a toast for the generation
            const count = formData.count
            toastIdRef.current = toast.loading(
                `Generating ${count} variation${count > 1 ? 's' : ''} of ${referencePersona.name}`,
                {
                    description: 'Creating personas with adjusted traits...',
                    icon: <SparklesIcon className="h-4 w-4 text-primary animate-pulse" />,
                },
            )

            // 4. Call server action and stream results
            try {
                console.log("[DashboardClient] Calling generateSimilarPersonasAction with bigFive:", formData.bigFive, "variationLevel:", formData.variationLevel);
                const { streamData } = await generateSimilarPersonasAction(
                    referencePersona,
                    { bigFive: formData.bigFive, variationLevel: formData.variationLevel },
                    formData.count,
                )

                let completedCount = 0

                for await (const update of readStreamableValue(streamData)) {
                    if (!update) continue

                    if (update.step === 'DONE' && update.personas) {
                        console.log("[DashboardClient] Stream completed - received", update.personas.length, "personas from server");
                        // Replace each placeholder with the real persona data
                        update.personas.forEach((realPersona, idx) => {
                            const placeholderId = placeholderIds[idx]
                            if (placeholderId) {
                                const { id: _unusedId, ...personaData } = realPersona
                                updatePersona(batchId, placeholderId, {
                                    ...personaData,
                                    variantOf: { id: referencePersona.id, name: referencePersona.name },
                                })
                                completedCount++
                            }
                        })

                        // Clean up any extra placeholders (if LLM returned fewer than requested)
                        for (let i = update.personas.length; i < placeholderIds.length; i++) {
                            const unusedId = placeholderIds[i]
                            if (unusedId) {
                                setPendingPersonaIds((prev) => {
                                    const next = new Set(prev)
                                    next.delete(unusedId)
                                    return next
                                })
                            }
                        }

                        // Update toast to success
                        if (toastIdRef.current) {
                            toast.success(
                                `${completedCount} variation${completedCount > 1 ? 's' : ''} of ${referencePersona.name} generated`,
                                {
                                    id: toastIdRef.current,
                                    description: 'New persona cards added to the batch',
                                    icon: <SparklesIcon className="h-4 w-4 text-primary" />,
                                },
                            )
                            toastIdRef.current = null
                        }

                        // Mark all as done (remove from pending)
                        setPendingPersonaIds((prev) => {
                            const next = new Set(prev)
                            placeholderIds.forEach((id) => next.delete(id))
                            return next
                        })

                        // Close the detail sheet now that variants are visible
                        setIsDetailSheetOpen(false)
                        setSelectedPersonaId(null)
                        return
                    }

                    if (update.step === 'ERROR') {
                        console.log("[DashboardClient] Stream returned error:", update.error);
                        if (toastIdRef.current) {
                            toast.error('Failed to generate variations', {
                                id: toastIdRef.current,
                                description: update.error ?? 'Unknown error',
                            })
                            toastIdRef.current = null
                        }
                        setPendingPersonaIds((prev) => {
                            const next = new Set(prev)
                            placeholderIds.forEach((id) => next.delete(id))
                            return next
                        })
                        return
                    }
                }
            } catch (err) {
                console.error("[DashboardClient] Variation generation threw exception:", err);
                if (toastIdRef.current) {
                    toast.error('Failed to generate variations', {
                        id: toastIdRef.current,
                        description: (err as Error).message,
                    })
                    toastIdRef.current = null
                }
                setPendingPersonaIds((prev) => {
                    const next = new Set(prev)
                    placeholderIds.forEach((id) => next.delete(id))
                    return next
                })
            }
        },
        [insertPersonasAfter, updatePersona],
    )

    // Skip setup view when generation is active — batch list shows skeleton cards instead
    const showSetupView = (batches.length === 0 || showSetup) && !isGenerating && !activeBatchId

    // Compute an approximate overall progress percentage from the current phase
    const progressPercent = personaFlow.personaProgress
        ? personaFlow.personaProgress.step === 'BRAINSTORMING_PERSONAS'
            ? 10
            : personaFlow.personaProgress.step === 'GENERATING_BACKSTORIES'
                ? personaFlow.personaProgress.totalCount && personaFlow.personaProgress.totalCount > 0
                    ? 20 + ((personaFlow.personaProgress.completedCount ?? 0) / personaFlow.personaProgress.totalCount) * 30
                    : 20
                : personaFlow.personaProgress.step === 'ADDING_BEHAVIORAL_DEPTH'
                    ? 50
                    : personaFlow.personaProgress.step === 'DONE'
                        ? 100
                        : 0
        : 0

    return (
        <>
            {/* Main content — setup view or batch view */}
            {showSetupView ? (
                <div className="animate-in fade-in duration-500">
                    <SetupView personaFlow={personaFlow} onBack={batches.length > 0 ? () => setShowSetup(false) : undefined} />
                </div>
            ) : (
                <div className="flex flex-col gap-8 animate-in fade-in duration-500">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold tracking-tight">Personas</h1>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                                    <PlusIcon className="h-3.5 w-3.5" />
                                    New Batch
                                    <ChevronDownIcon className="h-3 w-3 opacity-60" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem asChild>
                                    <Link href="/dashboard/new">
                                        <PenIcon className="h-4 w-4 mr-2" />
                                        From ICP description
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/dashboard/interviews">
                                        <FileTextIcon className="h-4 w-4 mr-2" />
                                        From interviews
                                    </Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {!activeBatch ? (
                        <div className="flex flex-col gap-4">
                            {/* Active generation entries — skeleton cards at the top */}
                            {activeRunIds.map((runId) => (
                                <Link
                                    key={runId}
                                    href={`/dashboard/generating/${runId}`}
                                    className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-border/80 animate-pulse"
                                >
                                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                        <ClockIcon className="h-5 w-5 text-primary animate-spin" />
                                    </div>
                                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                        <span className="font-semibold truncate">Generating personas...</span>
                                        <span className="text-sm text-muted-foreground">In progress</span>
                                    </div>
                                </Link>
                            ))}
                            {batches.map((batch) => (
                                <div
                                    key={batch.id}
                                    className="group relative"
                                >
                                    <button
                                        onClick={() => setActiveBatch(batch.id)}
                                        className="flex items-center gap-4 w-full rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-border/80"
                                    >
                                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                            <LayersIcon className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                            <InlineRenamable
                                                value={batch.label}
                                                onRename={(label) => updateBatchLabel(batch.id, label)}
                                                className="min-w-0"
                                            />
                                            <span className="text-sm text-muted-foreground">
                                                {batch.personas.length} personas ·{' '}
                                                {batch.source === 'interviews'
                                                    ? 'from interviews'
                                                    : 'from description'}
                                            </span>
                                        </div>
                                        <span className="text-xs text-muted-foreground shrink-0">
                                            {new Date(batch.createdAt).toLocaleDateString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            removeBatch(batch.id)
                                        }}
                                        className="absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-destructive focus:outline-none z-10"
                                        aria-label="Delete batch"
                                    >
                                        <XIcon className="size-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between border-b border-border/40 pb-4">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-xl font-bold tracking-tight">
                                            <InlineRenamable
                                                value={activeBatch.label}
                                                onRename={(label) => updateBatchLabel(activeBatch.id, label)}
                                            />
                                        </h2>
                                        {batchAnalysisCount > 0 && (
                                            <Link
                                                href="/dashboard/analyses"
                                                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                                            >
                                                <PlayIcon className="h-3 w-3" />
                                                {batchAnalysisCount} analysis{batchAnalysisCount !== 1 ? 's' : ''}
                                            </Link>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {activeBatch.personas.length} personas ·{' '}
                                        {activeBatch.source === 'interviews'
                                            ? 'from interviews'
                                            : 'Generated from description'}
                                        · {new Date(activeBatch.createdAt).toLocaleString()}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setActiveBatch(null)}
                                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
                                >
                                    All Batches
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {activeBatch.personas.map((persona, idx) => {
                                    // Use combined key to prevent collisions from duplicate persona IDs
                                    const key = `${persona.id}::${idx}`
                                    return pendingPersonaIds.has(persona.id) ? (
                                        <PersonaSkeletonCard key={key} />
                                    ) : (
                                        <PersonaProfilePanel
                                            key={key}
                                            persona={persona}
                                            onClick={() => handleOpenDetail(persona.id)}
                                            onChatClick={() => handleOpenChat(persona)}
                                            onCreateVariant={() => handleOpenVariant(persona)}
                                            onDelete={handleDeletePersona}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    )}

                </div>
            )}

            {/* Floating "Show Details" button when generation is active (but expanded dialog is closed) */}
            {showSetupView && personaFlow.personaProgress && !showExpandedFlow && (
              <button
                onClick={() => setShowExpandedFlow(true)}
                className="fixed bottom-6 right-6 z-50 inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-xs font-semibold shadow-lg transition-colors hover:bg-accent"
              >
                <LayersIcon className="h-3.5 w-3.5" />
                Show Progress
              </button>
            )}

            {/* Persona Generation Streaming Dialog — expanded view (only in setup view) */}
            {showSetupView && (
                <FlowDialog
                    open={showExpandedFlow && !!personaFlow.personaProgress}
                    onOpenChange={(open) => {
                        if (!open) setShowExpandedFlow(false)
                    }}
                    transparentOverlay
                    title="Synthesizing Audience"
                    description="Kynd is generating realistic personas based on your target profile."
                    currentStep={
                        personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS'
                            ? 0
                            : personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES'
                                ? 1
                                : personaFlow.personaProgress?.step === 'ADDING_BEHAVIORAL_DEPTH'
                                    ? 2
                                    : 3
                    }
                    steps={[
                        { title: 'Analyzing Market', description: 'Mapping demographics and psychographics', cyclingTexts: ['Analyzing your target profile...', 'Mapping demographics and psychographics...', 'Identifying key behavioral segments...'] },
                        { title: 'Generating Personas', description: 'Creating detailed backstories and traits', cyclingTexts: ['Crafting backstories...', 'Defining motivations...', 'Building psychographic foundations...'] },
                        { title: 'Rationalizing Behavior', description: 'Anchoring psychographics to personality traits', cyclingTexts: ['Generating behavioral insights...', 'Mapping personality traits...', 'Creating decision frameworks...'] },
                        { title: 'Finalizing', description: 'Preparing avatars, insights, and profiles' },
                    ]}
                    progressPercent={progressPercent}
                    streamingText={personaFlow.personaProgress?.streamingText}
                    personaName={personaFlow.personaProgress?.personaName}
                    completedCount={personaFlow.personaProgress?.completedCount}
                    totalCount={personaFlow.personaProgress?.totalCount}
                >
                    {personaFlow.personaProgress && personaFlow.personaProgress.step === 'DONE' ? (
                        /* ── Success / Done state ─────────────────────────────────── */
                        <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-6">
                            {/* Success checkmark */}
                            <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center animate-in zoom-in-95 fade-in duration-300">
                                <svg
                                    className="h-7 w-7 text-primary-foreground"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <h3 className="text-xl font-semibold tracking-tight">Generation Complete</h3>

                            <p className="text-sm text-muted-foreground text-center text-balance">
                                {personaFlow.personaProgress.personas?.length ?? 0} personas created from your target profile.
                            </p>

                            {/* Action buttons */}
                            <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
                                <button
                                    onClick={() => {
                                        if (personaFlow.lastCompletedBatchId) {
                                            setActiveBatch(personaFlow.lastCompletedBatchId)
                                        }
                                        personaFlow.handleClearProgress()
                                        setShowSetup(false)
                                    }}
                                    className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                >
                                    <LayersIcon className="h-4 w-4" />
                                    See Personas
                                </button>
                                <button
                                    onClick={() => {
                                        if (personaFlow.lastCompletedBatchId) {
                                            const id = personaFlow.lastCompletedBatchId
                                            personaFlow.handleClearProgress()
                                            router.push(`/dashboard/analyses?batchId=${id}`)
                                        }
                                    }}
                                    className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-5 text-sm font-semibold transition-colors hover:bg-accent"
                                >
                                    <PlayIcon className="h-4 w-4" />
                                    Run Analysis
                                </button>
                            </div>
                        </div>
                    ) : personaFlow.personaProgress ? (
                        /* ── In-progress state ────────────────────────────────────── */
                        <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-6">
                            {/* 8px determinate progress bar with pulsing fill */}
                            <Progress
                                value={progressPercent}
                                className="h-2 w-full"
                                indicatorClassName="animate-pulse"
                            />

                            {/* Persona dots — visible once names are known */}
                            {personaFlow.personaProgress.personas && personaFlow.personaProgress.personas.length > 0 && (
                                <div className="flex flex-wrap gap-3 justify-center">
                                    {personaFlow.personaProgress.personas.map((p) => {
                                        const isCompletePhase =
                                            personaFlow.personaProgress?.step === 'DONE'
                                        const isCurrentPersona =
                                            personaFlow.personaProgress?.personaName === p.name
                                        return (
                                            <div key={p.id} className="flex flex-col items-center gap-1.5">
                                                <div
                                                    className={`h-8 w-8 rounded-full border transition-all duration-300 ${isCompletePhase
                                                            ? 'bg-primary border-primary'
                                                            : isCurrentPersona
                                                                ? 'border-primary bg-primary/10'
                                                                : 'border-border bg-transparent'
                                                        }`}
                                                >
                                                    {isCompletePhase && (
                                                        <svg
                                                            className="h-full w-full p-1.5 text-primary-foreground"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            strokeWidth={3}
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span
                                                    className={`text-xs max-w-[72px] truncate text-center ${isCompletePhase ? 'text-foreground' : 'text-muted-foreground'
                                                        }`}
                                                >
                                                    {p.name.split(' ')[0]}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

              {/* Progress bar and persona dots only — counter removed per design feedback */}
                        </div>
                    ) : null}
                </FlowDialog>
            )}


            <PersonaDetailSheet
                persona={selectedPersona}
                isOpen={isDetailSheetOpen}
                onClose={handleCloseSheet}
                defaultTab={sheetDefaultTab}
                onCreateVariant={selectedPersona ? () => handleOpenVariant(selectedPersona) : undefined}
                onGenerateVariation={handleGenerateVariation}
                onEdit={activeBatchId ? (personaId, updates) => updatePersona(activeBatchId, personaId, updates) : undefined}
            />
        </>
    )
}
