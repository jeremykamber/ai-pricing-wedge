"use client"

import * as React from "react"
import { Persona } from "@/domain/entities/Persona"
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PersonaAvatar } from "./PersonaAvatar"
import { PersonaChatInline } from "@/ui/dashboard/components/chat/PersonaChatInline"
import { PersonaTraitsSuggestionDialog, type SuggestedTraits } from "./PersonaTraitsSuggestionDialog"
import { MessageSquare, User, Search, XIcon, CopyIcon, ShuffleIcon, SparklesIcon, PenIcon, LoaderIcon, ShieldAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { applyCounterfactualTestAction } from "@/actions/applyCounterfactualTest"
import { Slider } from "@/components/ui/slider"
import { VariationFormData } from "./SimilarPersonaDialog"
import { mapToDiscrete } from "./variationMapping"
import { regenPersonaTraitsAction } from "@/actions/regenPersonaTraits"

interface PersonaDetailSheetProps {
    persona: Persona | null
    isOpen: boolean
    onClose: () => void
    defaultTab?: "profile" | "chat" | "variant"
    onCreateVariant?: () => void
    onGenerateVariation?: (referencePersona: Persona, formData: VariationFormData) => void
    onEdit?: (personaId: string, updates: Partial<Persona>) => void
}

type Tab = "profile" | "chat" | "variant"

export function PersonaDetailSheet({
    persona,
    isOpen,
    onClose,
    defaultTab = "profile",
    onCreateVariant,
    onGenerateVariation,
    onEdit,
}: PersonaDetailSheetProps) {
    const [activeTab, setActiveTab] = React.useState<Tab>(defaultTab)
    const [searchTerm, setSearchTerm] = React.useState("")
    const [isEditing, setIsEditing] = React.useState(false)
    const [draftPersona, setDraftPersona] = React.useState<Persona | null>(null)
    const [isSaving, setIsSaving] = React.useState(false)
    const [showSuggestionDialog, setShowSuggestionDialog] = React.useState(false)
    const [suggestedTraits, setSuggestedTraits] = React.useState<SuggestedTraits | null>(null)
    const [bigFive, setBigFive] = React.useState({
        conscientiousness: 50,
        neuroticism: 50,
        openness: 50,
        extraversion: 50,
        agreeableness: 50,
    })
    const [variationLevel, setVariationLevel] = React.useState(2)
    const [selectedCount, setSelectedCount] = React.useState<1 | 3 | 5>(3)
    const [counterfactualResults, setCounterfactualResults] = React.useState<{ detail: string; reason: string; attribute?: string }[] | null>(null)
    const [isRunningCounterfactual, setIsRunningCounterfactual] = React.useState(false)

    const handleCounterfactual = React.useCallback(async () => {
        if (!persona) return
        setIsRunningCounterfactual(true)
        try {
            const result = await applyCounterfactualTestAction(persona)
            setCounterfactualResults(result)
        } catch {
            setCounterfactualResults([{ detail: "Test failed", reason: "Unable to run counterfactual test", attribute: "error" }])
        } finally {
            setIsRunningCounterfactual(false)
        }
    }, [persona])

    const attrOpacity = (tier?: string, confidence?: number): number => {
        if (!tier || tier === 'observed') return 1
        if (tier === 'interpreted') return confidence && confidence < 0.7 ? 0.6 : 0.8
        if (tier === 'synthetic') return 0.5
        return 1
    }

    React.useEffect(() => {
        if (persona) {
            setBigFive({
                conscientiousness: mapToDiscrete(persona.conscientiousness),
                neuroticism: mapToDiscrete(persona.neuroticism),
                openness: mapToDiscrete(persona.openness),
                extraversion: mapToDiscrete(persona.extraversion),
                agreeableness: mapToDiscrete(persona.agreeableness),
            })
            setVariationLevel(mapToDiscrete(40))
            setSelectedCount(3)
        }
    }, [persona])

    React.useEffect(() => {
        if (isOpen) {
            setActiveTab(defaultTab)
        }
    }, [isOpen, defaultTab])

  React.useEffect(() => {
    if (persona) {
      setDraftPersona({ ...persona })
    }
    setIsEditing(false)
  }, [persona?.id])

    const handleStartEdit = React.useCallback(() => {
        if (persona) {
            setDraftPersona({ ...persona })
            setIsEditing(true)
        }
    }, [persona])

    const handleCancelEdit = React.useCallback(() => {
        setIsEditing(false)
        setDraftPersona(null)
    }, [])

    const handleSaveEdit = React.useCallback(async () => {
        if (!draftPersona || !onEdit || !persona) return
        const { id: personaId, variantOf, ...editableUpdates } = draftPersona

        const backstoryChanged = draftPersona.backstory !== persona.backstory

        // Always save the current edits immediately
        onEdit(personaId, editableUpdates)

    if (backstoryChanged && draftPersona.backstory) {
      setIsSaving(true)
      setSuggestedTraits(null)
      setShowSuggestionDialog(true)
      try {
        const traits = await regenPersonaTraitsAction(draftPersona.backstory)
        setSuggestedTraits(traits)
      } catch (err) {
        console.warn("[PersonaDetailSheet] Trait regeneration failed:", err)
        setShowSuggestionDialog(false)
      } finally {
        setIsSaving(false)
      }
    }

        setIsEditing(false)
    }, [draftPersona, onEdit, persona])

    const handleApplySuggestions = React.useCallback(
        (decisions: Record<string, boolean>) => {
            if (!persona || !suggestedTraits || !onEdit) return
            const updates: Partial<Persona> = {}

            if (decisions.conscientiousness) updates.conscientiousness = suggestedTraits.conscientiousness
            if (decisions.neuroticism) updates.neuroticism = suggestedTraits.neuroticism
            if (decisions.openness) updates.openness = suggestedTraits.openness
            if (decisions.extraversion) updates.extraversion = suggestedTraits.extraversion
            if (decisions.agreeableness) updates.agreeableness = suggestedTraits.agreeableness

            if (decisions.values) updates.values = suggestedTraits.values
            if (decisions.fears) updates.fears = suggestedTraits.fears
            if (decisions.communicationStyle) updates.communicationStyle = suggestedTraits.communicationStyle
            if (decisions.decisionStyle) updates.decisionStyle = suggestedTraits.decisionStyle

            if (Object.keys(updates).length > 0) {
                onEdit(persona.id, updates)
            }

            setShowSuggestionDialog(false)
        },
        [onEdit, persona, suggestedTraits],
    )

    const updateDraft = React.useCallback((updates: Partial<Persona>) => {
        setDraftPersona((prev) => prev ? { ...prev, ...updates } : null)
    }, [])

    const allParagraphs = React.useMemo(() =>
        persona?.backstory ? persona.backstory.split('\n\n') : [],
        [persona?.backstory]
    )

    const filteredBackstory = React.useMemo(() => {
        if (!searchTerm) return allParagraphs
        return allParagraphs.filter(paragraph =>
            paragraph.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [allParagraphs, searchTerm])

    if (!persona) return null

    const renderScalar = (label: string, value: number, leftLabel: string, rightLabel: string) => (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-end">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
                <span className="text-sm font-bold font-mono">{value}</span>
            </div>
            <Progress value={value} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground/60 font-medium">
                <span>{leftLabel}</span>
                <span>{rightLabel}</span>
            </div>
        </div>
    )

    const updateBigFive = (key: keyof typeof bigFive, value: number) => {
        setBigFive((prev) => ({ ...prev, [key]: value }))
    }

    const handleGenerateVariation = () => {
        if (!onGenerateVariation || !persona) return
        console.log("[PersonaDetailSheet] Generating variation - bigFive:", bigFive, "variationLevel:", variationLevel, "count:", selectedCount)
        const mappedFormData: VariationFormData = {
            bigFive: {
                conscientiousness: bigFive.conscientiousness * 20,
                neuroticism: bigFive.neuroticism * 20,
                openness: bigFive.openness * 20,
                extraversion: bigFive.extraversion * 20,
                agreeableness: bigFive.agreeableness * 20,
            },
            variationLevel: variationLevel * 20,
            count: selectedCount,
        }
        console.log("[PersonaDetailSheet] Mapped formData:", mappedFormData)
        onGenerateVariation(persona, mappedFormData)
    }

    const getRandomDiscrete = () => Math.floor(Math.random() * 5) + 1

    const handleRandomizeVariation = () => {
        console.log("[PersonaDetailSheet] Randomizing slider values")
        setBigFive({
            conscientiousness: getRandomDiscrete(),
            neuroticism: getRandomDiscrete(),
            openness: getRandomDiscrete(),
            extraversion: getRandomDiscrete(),
            agreeableness: getRandomDiscrete(),
        })
        setVariationLevel(getRandomDiscrete())
    }

    const BIG_FIVE_CONFIG = [
        { key: "conscientiousness" as const, label: "Conscientiousness", left: "Chaotic", right: "Meticulous" },
        { key: "neuroticism" as const, label: "Neuroticism", left: "Stable", right: "Anxious" },
        { key: "openness" as const, label: "Openness", left: "Traditional", right: "Curious" },
        { key: "extraversion" as const, label: "Extraversion", left: "Introvert", right: "Extrovert" },
        { key: "agreeableness" as const, label: "Agreeableness", left: "Competitive", right: "Compassionate" },
    ]
    const COUNT_OPTIONS = [1, 3, 5] as const

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent
                    showCloseButton={false}
                    className="sm:max-w-[600px] md:max-w-[680px] h-[85dvh] overflow-y-auto flex flex-col p-0"
                >
                    <DialogTitle className="sr-only">
                        {persona.name} — Profile &amp; Chat
                    </DialogTitle>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-border/40 px-5 py-4 shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <PersonaAvatar name={persona.name} size="md" className="w-10 h-10 shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <h2 className="text-base font-semibold tracking-tight truncate">{persona.name}</h2>
                                <p className="text-xs text-muted-foreground truncate">{persona.occupation}</p>
                                {persona.generationMode && (
                                    <span className="text-[10px] font-medium text-primary/70 mt-0.5">
                                        {persona.generationMode === 'research' ? 'Transcript-based' : persona.generationMode === 'cluster' ? 'Synthesized from interviews' : 'Description-based'}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 ml-4 shrink-0">
                            <button
                                onClick={() => setActiveTab("profile")}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                    activeTab === "profile"
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <User className="w-3.5 h-3.5" />
                                Profile
                            </button>
                            <button
                                onClick={() => setActiveTab("chat")}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                    activeTab === "chat"
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Chat
                            </button>
                            {onCreateVariant && (
                                <button
                                    onClick={() => setActiveTab("variant")}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                        activeTab === "variant"
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <CopyIcon className="w-3.5 h-3.5" />
                                    Variant
                                </button>
                            )}
                            {onEdit && (
                                <button
                                    onClick={isEditing ? undefined : handleStartEdit}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                        isEditing
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                    aria-label={isEditing ? "Editing persona" : "Edit persona"}
                                >
                                    <PenIcon className="w-3.5 h-3.5" />
                                    {isEditing ? "Editing" : "Edit"}
                                </button>
                            )}
                            {persona.generationMode === 'strategy' && (
                                <button
                                    onClick={handleCounterfactual}
                                    disabled={isRunningCounterfactual}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                                    title="Check for risky synthetic details"
                                >
                                    <ShieldAlertIcon className="w-3.5 h-3.5" />
                                    {isRunningCounterfactual ? "Checking..." : "Check"}
                                </button>
                            )}
                            <div className="w-px h-5 bg-border/40 mx-1" />
                            <button
                                onClick={onClose}
                                className="inline-flex items-center justify-center h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                                aria-label="Close"
                            >
                                <XIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Profile Tab — Read Mode */}
                    {activeTab === "profile" && !isEditing && (
                        <ScrollArea className="flex-1 min-h-0">
                            <div className="p-5 flex flex-col gap-6">

                                {/* Counterfactual Results */}
                                {counterfactualResults && counterfactualResults.length > 0 && (
                                    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                        <h4 className="text-xs font-bold text-amber-700 uppercase tracking-widest">⚠ Assumptions to Review</h4>
                                        <p className="text-xs text-amber-600/80">These details could change product decisions if incorrect:</p>
                                        <ul className="space-y-1.5">
                                            {counterfactualResults.map((r, i) => (
                                                <li key={i} className="text-xs text-amber-700 flex gap-2">
                                                    <span className="font-medium shrink-0">{r.attribute}:</span>
                                                    <span>{r.detail} — {r.reason}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {counterfactualResults && counterfactualResults.length === 0 && (
                                    <div className="flex flex-col gap-1 rounded-lg border border-green-200 bg-green-50/50 p-3">
                                        <p className="text-xs font-medium text-green-700">✓ All synthetic details pass counterfactual test</p>
                                    </div>
                                )}

                                {/* Behavioral Model — derived from behavioralDimensions or existing data */}
                                <div className="flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">BEHAVIOR</h4>
                                    {persona.behavioralDimensions && persona.behavioralDimensions.length > 0 ? (
                                        <div className="space-y-3">
                                            {persona.behavioralDimensions.map((dim, i) => (
                                                <div key={i} className="flex flex-col gap-1.5" style={{ opacity: attrOpacity(dim.evidence ? 'observed' : undefined) }}>
                                                    <div className="flex justify-between items-end">
                                                        <span className="text-xs font-medium text-foreground">{dim.name}</span>
                                                        <span className="text-xs font-mono text-muted-foreground">{dim.score}/100</span>
                                                    </div>
                                                    <Progress value={dim.score} className="h-1.5" />
                                                    <div className="flex justify-between text-[11px] text-muted-foreground/60">
                                                        <span>{dim.context}</span>
                                                        {dim.evidence && (
                                                            <span className="text-primary/60 flex items-center gap-1" title={dim.evidence}>
                                                                ● evidence
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground/80">{dim.description}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {persona.goals.length > 0 && (
                                                <div className="flex flex-col gap-2">
                                                    {persona.goals.map((goal, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs text-foreground/80">
                                                            <span className="text-primary shrink-0">✓</span>
                                                            {goal}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {persona.communicationStyle && (
                                                <p className="text-xs text-muted-foreground/70 mt-1">
                                                    Communicates {persona.communicationStyle}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Motivations — from values */}
                                {persona.values && persona.values.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">MOTIVATIONS</h4>
                                        <div className="flex flex-wrap gap-1.5">
                                            {persona.values.map((v, i) => (
                                                <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-sm">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                    {v}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Frictions — from fears */}
                                {persona.fears && persona.fears.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">FRICTIONS</h4>
                                        <ul className="space-y-1.5">
                                            {persona.fears.map((f, i) => (
                                                <li key={i} className="text-xs text-foreground/80 flex gap-2">
                                                    <span className="text-destructive shrink-0">✕</span>
                                                    {f}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Decision Model */}
                                <div className="flex flex-col gap-2">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">DECISION MODEL</h4>
                                    {persona.decisionStyle && (
                                        <p className="text-xs text-foreground/80">
                                            Decision style: <span className="font-medium text-foreground">{persona.decisionStyle}</span>
                                        </p>
                                    )}
                                    <div className="flex gap-3 text-xs text-muted-foreground/80">
                                        <span>Price sensitivity: {persona.pricingSensitivity}/100</span>
                                        {persona.typicalBudget && <span>· Budget: {persona.typicalBudget}</span>}
                                    </div>
                                    {persona.goals.length > 0 && (
                                        <div className="mt-1 flex flex-col gap-1">
                                            <span className="text-[11px] font-medium text-green-700">Likely to adopt if helps with:</span>
                                            {persona.goals.slice(0, 3).map((g, i) => (
                                                <span key={i} className="text-xs text-green-700/80 ml-2">✓ {g}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Evidence & Confidence */}
                                <div className="flex flex-col gap-2">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">EVIDENCE &amp; CONFIDENCE</h4>
                                    {persona.provenance ? (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2 text-xs text-foreground/80">
                                                <span>Overall confidence:</span>
                                                <div className="flex-1 h-1.5 max-w-[120px] rounded-full bg-secondary">
                                                    <div
                                                        className="h-full rounded-full bg-primary transition-all"
                                                        style={{ width: `${persona.provenance.overallConfidence * 100}%` }}
                                                    />
                                                </div>
                                                <span className="font-mono text-muted-foreground">
                                                    {Math.round(persona.provenance.overallConfidence * 100)}%
                                                </span>
                                            </div>
                                            {persona.provenance.attributes.length > 0 && (
                                                <details className="group">
                                                    <summary className="text-xs text-muted-foreground hover:text-foreground cursor-pointer list-none flex items-center gap-1">
                                                        <span className="text-[10px] text-muted-foreground/40 group-open:rotate-90 transition-transform">▶</span>
                                                        Per-attribute breakdown ({persona.provenance.attributes.length})
                                                    </summary>
                                                    <div className="space-y-1 pt-1">
                                                        {persona.provenance.attributes.map((attr, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-xs text-foreground/60">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                                    attr.tier === 'observed' ? 'bg-green-500' :
                                                                    attr.tier === 'interpreted' ? 'bg-amber-400' : 'bg-gray-300'
                                                                }`} />
                                                                <span>{attr.attribute}</span>
                                                                <span className="text-muted-foreground/40">·</span>
                                                                <span>{attr.tier}</span>
                                                                <span className="text-muted-foreground/40">·</span>
                                                                <span>{Math.round(attr.confidence * 100)}%</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground/60">
                                            {persona.generationMode === 'research'
                                                ? "No provenance data available"
                                                : "This persona was generated from a description, not from interviews. Individual attributes are not linked to specific sources."
                                            }
                                        </p>
                                    )}
                                </div>

                                {/* Sources */}
                                {persona.evidenceLinks && persona.evidenceLinks.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">SOURCES</h4>
                                        <div className="space-y-2">
                                            {persona.evidenceLinks.map((link, i) => (
                                                <div key={i} className="flex flex-col gap-1 rounded-lg border border-border/40 bg-secondary/20 p-3">
                                                    <span className="text-xs font-medium text-foreground">{link.attribute}</span>
                                                    <p className="text-xs text-muted-foreground/80 italic">"{link.excerpt}"</p>
                                                    <span className="text-[10px] text-muted-foreground/60">{link.transcriptId}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Full Details — collapsible */}
                                <details className="flex flex-col gap-3 group border-t border-border/20 pt-4">
                                    <summary className="text-xs font-bold text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground/40 group-open:rotate-90 transition-transform">▶</span>
                                        FULL DETAILS
                                    </summary>
                                    <div className="flex flex-col gap-5 pt-3">

                                        {/* Quick Info */}
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span>{persona.age} years old</span>
                                            <span className="w-1 h-1 rounded-full bg-border" />
                                            <span>{persona.educationLevel}</span>
                                            {persona.occupation && (
                                                <><span className="w-1 h-1 rounded-full bg-border" /><span>{persona.occupation}</span></>
                                            )}
                                        </div>

                                        {/* Backstory */}
                                        {persona.backstory && (
                                            <div className="flex flex-col gap-3">
                                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">BACKSTORY</h4>
                                                <div className="relative">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                                                    <Input
                                                        placeholder="Search backstory..."
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                        className="h-8 text-xs pl-8 rounded-md bg-muted/30 border-none transition-all focus:ring-1 focus:ring-primary/20"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-4 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
                                                    {filteredBackstory.map((paragraph, i) => (
                                                        <p key={`${persona.id}-para-${i}`}
                                                            className={cn("text-sm md:text-base leading-relaxed text-foreground/80",
                                                                searchTerm && paragraph.toLowerCase().includes(searchTerm.toLowerCase())
                                                                    ? "bg-primary/10 rounded-lg p-2 text-foreground font-medium ring-1 ring-primary/20" : ""
                                                            )}>
                                                            {paragraph}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Big Five */}
                                        <div className="flex flex-col gap-4">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">PERSONALITY (BIG FIVE)</h4>
                                            <div className="space-y-4">
                                                {renderScalar("Conscientiousness", persona.conscientiousness, "Chaotic", "Meticulous")}
                                                {renderScalar("Neuroticism", persona.neuroticism, "Stable", "Anxious")}
                                                {renderScalar("Openness", persona.openness, "Traditional", "Curious")}
                                                {renderScalar("Extraversion", persona.extraversion, "Introvert", "Extrovert")}
                                                {renderScalar("Agreeableness", persona.agreeableness, "Competitive", "Compassionate")}
                                            </div>
                                        </div>

                                        {/* Psychographic */}
                                        <div className="flex flex-col gap-3">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">PSYCHOGRAPHIC</h4>
                                            {persona.communicationStyle && (
                                                <p className="text-xs text-foreground/80">Communicates: {persona.communicationStyle}</p>
                                            )}
                                            {persona.interests && persona.interests.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {persona.interests.map((v, i) => (
                                                        <span key={i} className="text-[11px] text-muted-foreground bg-secondary/40 px-2 py-0.5 rounded-sm">{v}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Identity/Situation Context */}
                                        {(persona.identityContext || persona.situationContext) && (
                                            <div className="flex flex-col gap-2">
                                                {persona.identityContext && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-semibold text-muted-foreground">Stable traits</span>
                                                        <p className="text-sm text-foreground/80">{persona.identityContext}</p>
                                                    </div>
                                                )}
                                                {persona.situationContext && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-semibold text-muted-foreground">Situational</span>
                                                        <p className="text-sm text-foreground/80">{persona.situationContext}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Cluster Info */}
                                        {persona.clusterInfo && (
                                            <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-secondary/20 p-3">
                                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">CLUSTER</h4>
                                                <p className="text-xs text-muted-foreground/80">
                                                    Represents {persona.clusterInfo.representedCount} interview subjects
                                                </p>
                                                {persona.clusterInfo.sourceIds.length > 0 && (
                                                    <p className="text-xs text-muted-foreground/60">
                                                        Sources: {persona.clusterInfo.sourceIds.join(", ")}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </details>
                            </div>
                        </ScrollArea>
                    )}

                    {/* Profile Tab — Edit Mode */}
                    {activeTab === "profile" && isEditing && draftPersona && (
                        <ScrollArea className="flex-1 min-h-0">
                            <div className="p-5 flex flex-col gap-5">
                                {/* Identity */}
                                <div className="flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">IDENTITY</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</span>
                                            <Input
                                                value={draftPersona.name}
                                                onChange={(e) => updateDraft({ name: e.target.value })}
                                                className="h-9 text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Age</span>
                                            <Input
                                                type="number"
                                                value={draftPersona.age}
                      onChange={(e) => updateDraft({ age: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })}
                                                className="h-9 text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Occupation</span>
                                            <Input
                                                value={draftPersona.occupation}
                                                onChange={(e) => updateDraft({ occupation: e.target.value })}
                                                className="h-9 text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Education</span>
                                            <Input
                                                value={draftPersona.educationLevel}
                                                onChange={(e) => updateDraft({ educationLevel: e.target.value })}
                                                className="h-9 text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Backstory */}
                                <div className="flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">BACKSTORY</h4>
                                    <Textarea
                                        value={draftPersona.backstory ?? ""}
                                        onChange={(e) => updateDraft({ backstory: e.target.value })}
                                        className="min-h-[200px] text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus-visible:border-primary/50 focus:ring-2 focus-visible:ring-primary/15 resize-y focus:ring-primary/15"
                                    />
                                </div>

                                {/* Goals */}
                                <div className="flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">GOALS</h4>
                                    <Textarea
                                        value={draftPersona.goals.join("\n")}
                                        onChange={(e) => updateDraft({ goals: e.target.value.split("\n").filter(Boolean) })}
                                        placeholder="e.g. Scale revenue, Optimize burn rate"
                                        className="min-h-[80px] text-sm bg-muted/30 border-0 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 resize-y"
                                    />
                                </div>

                                {/* Interests */}
                                <div className="flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">INTERESTS</h4>
                                    <Textarea
                                        value={draftPersona.interests.join("\n")}
                                        onChange={(e) => updateDraft({ interests: e.target.value.split("\n").filter(Boolean) })}
                                        placeholder="e.g. Hiking, Product Strategy, Tech Networking"
                                        className="min-h-[60px] text-sm bg-muted/30 border-0 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 resize-y"
                                    />
                                </div>

                                {/* Psychographic */}
                                <div className="flex flex-col gap-4">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">PSYCHOGRAPHIC SPECIFICATION</h4>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Values</span>
                                            <Textarea
                                                value={draftPersona.values.join("\n")}
                                                onChange={(e) => updateDraft({ values: e.target.value.split("\n").filter(Boolean) })}
                                                placeholder="e.g. Efficiency, Transparency, Long-term growth"
                                                className="min-h-[60px] text-sm bg-muted/30 border-0 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 resize-y"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fears</span>
                                            <Textarea
                                                value={draftPersona.fears.join("\n")}
                                                onChange={(e) => updateDraft({ fears: e.target.value.split("\n").filter(Boolean) })}
                                                placeholder="e.g. Wasting money, Hidden contract traps"
                                                className="min-h-[60px] text-sm bg-muted/30 border-0 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 resize-y"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex flex-col gap-1.5">
                                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Communication</span>
                                                <Input
                                                    value={draftPersona.communicationStyle}
                                                    onChange={(e) => updateDraft({ communicationStyle: e.target.value })}
                                                    className="h-9 text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Decision Style</span>
                                                <Input
                                                    value={draftPersona.decisionStyle}
                                                    onChange={(e) => updateDraft({ decisionStyle: e.target.value })}
                                                    className="h-9 text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Pricing */}
                                <div className="flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">PRICING</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sensitivity (1-100)</span>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={draftPersona.pricingSensitivity}
                                                onChange={(e) => updateDraft({ pricingSensitivity: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                                                className="h-9 text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                                            />
                                            <span className="text-[11px] text-muted-foreground/60">1 = low sensitivity, 100 = high sensitivity</span>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Typical Budget</span>
                                            <Input
                                                value={draftPersona.typicalBudget}
                                                onChange={(e) => updateDraft({ typicalBudget: e.target.value })}
                                                className="h-9 text-sm bg-muted/30 border border-transparent focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Big Five — read only */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">BIG FIVE TRAITS</h4>
                                        <span className="text-[11px] font-medium text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded-sm">Inferred from backstory</span>
                                    </div>
                                    <div className="space-y-4">
                                        {renderScalar("Conscientiousness", draftPersona.conscientiousness, "Chaotic", "Meticulous")}
                                        {renderScalar("Neuroticism", draftPersona.neuroticism, "Stable", "Anxious")}
                                        {renderScalar("Openness", draftPersona.openness, "Traditional", "Curious")}
                                        {renderScalar("Extraversion", draftPersona.extraversion, "Introvert", "Extrovert")}
                                        {renderScalar("Agreeableness", draftPersona.agreeableness, "Competitive", "Compassionate")}
                                    </div>
                                </div>

                                {/* Save / Cancel */}
                                <div className="flex gap-3 pt-2 pb-4">
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="flex-1 inline-flex h-10 items-center justify-center rounded-md border border-border/60 bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted/30"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveEdit}
                                        disabled={isSaving}
                                        className="flex-1 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 ring-1 ring-primary/20 disabled:opacity-50 gap-2"
                                    >
                                        {isSaving && <LoaderIcon className="w-3.5 h-3.5 animate-spin" />}
                                        {isSaving ? "Analyzing backstory..." : "Save Changes"}
                                    </button>
                                </div>
                            </div>
                        </ScrollArea>
                    )}

                    {/* Chat Tab */}
                    {activeTab === "chat" && (
                        <div className="flex-1 min-h-0 flex flex-col">
                            <PersonaChatInline persona={persona} />
                        </div>
                    )}

                    {/* Variant Tab */}
                    {activeTab === "variant" && (
                        <ScrollArea className="flex-1 min-h-0">
                            <div className="p-5 flex flex-col gap-6">
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                                Big Five Personality Traits
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={handleRandomizeVariation}
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-card text-foreground border border-border/60 transition-colors hover:bg-muted/30"
                                                aria-label="Randomize traits"
                                            >
                                                <ShuffleIcon className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <span className="text-xs text-muted-foreground/60">
                                            Adjust the personality profile
                                        </span>
                                    </div>
                                    <div className="space-y-4">
                                        {BIG_FIVE_CONFIG.map(({ key, label, left, right }) => (
                                            <Slider
                                                key={key}
                                                label={label}
                                                value={bigFive[key]}
                                                min={1}
                                                max={5}
                                                step={1}
                                                showTickMarks
                                                leftLabel={left}
                                                rightLabel={right}
                                                onChange={(v) => updateBigFive(key, v)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="h-px w-full bg-border/40" />

                                <Slider
                                    label="Creative Freedom"
                                    value={variationLevel}
                                    min={1}
                                    max={5}
                                    step={1}
                                    showTickMarks
                                    leftLabel="Close to original"
                                    rightLabel="Wildly different"
                                    onChange={setVariationLevel}
                                />

                                <div className="h-px w-full bg-border/40" />

                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                            How Many?
                                        </h3>
                                        <span className="text-xs text-muted-foreground/60">
                                            Number of variations to generate
                                        </span>
                                    </div>
                                    <div className="flex gap-3">
                                        {COUNT_OPTIONS.map((count) => (
                                            <button
                                                key={count}
                                                type="button"
                                                onClick={() => setSelectedCount(count)}
                                                className={cn(
                                                    "flex-1 h-10 rounded-md text-sm font-medium transition-all border",
                                                    selectedCount === count
                                                        ? "bg-muted text-foreground border-border"
                                                        : "bg-transparent text-muted-foreground border-border hover:border-border/80 hover:text-foreground",
                                                )}
                                            >
                                                {count}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleGenerateVariation}
                                    disabled={!onGenerateVariation}
                                    className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring gap-2 disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Generate {selectedCount} Variation{selectedCount > 1 ? "s" : ""}
                                </button>
                            </div>
                        </ScrollArea>
                    )}
                </DialogContent>
            </Dialog>

            <PersonaTraitsSuggestionDialog
                isOpen={showSuggestionDialog}
                onClose={() => setShowSuggestionDialog(false)}
                onApply={handleApplySuggestions}
                suggestedTraits={suggestedTraits}
                originalPersona={persona}
            />
        </>
    )
}
