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
                                        <p className="text-xs font-medium text-green-700">✓ All details pass counterfactual test</p>
                                    </div>
                                )}

                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">BEHAVIOR PATTERNS</h4>
                                    </div>
                                    {persona.behavioralDimensions && persona.behavioralDimensions.length > 0 ? (
                                        <div className="flex flex-col">
                                            {[...persona.behavioralDimensions].sort((a, b) => {
                                                const ap = persona.provenance?.attributes?.find(pa => pa.attribute === a.name);
                                                const bp = persona.provenance?.attributes?.find(pa => pa.attribute === b.name);
                                                return (bp?.confidence ?? 0) - (ap?.confidence ?? 0);
                                            }).map((dim, i) => {
                                                const label = dim.score >= 80 ? 'Very High' : dim.score >= 60 ? 'High' : dim.score >= 40 ? 'Moderate' : dim.score >= 20 ? 'Low' : 'Very Low';
                                                const lc = dim.score >= 80 ? 'text-emerald-600' : dim.score >= 60 ? 'text-sky-600' : dim.score >= 40 ? 'text-amber-600' : 'text-gray-400';
                                                return (
                                                    <div key={i} className="flex flex-col py-3 border-b border-border/10 last:border-0">
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="text-xs font-medium text-foreground">{dim.name}</span>
                                                            <span className={'text-[10px] font-medium ' + lc}>{label}</span>
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground/60 mt-1 leading-relaxed">{dim.description}</p>
                                                        {dim.evidence && <details className="mt-1.5 group"><summary className="text-[10px] text-muted-foreground/50 cursor-pointer hover:text-foreground/70 transition-colors list-none flex items-center gap-1.5 font-sans"><span className="text-[10px] leading-none">▶</span> Source</summary><p className="text-[11px] text-foreground/60 italic mt-1.5 leading-relaxed border-l-2 border-border/30 pl-3">{dim.evidence}</p></details>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>


                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">DECISION MODEL</h4>
                                    </div>
                                    {persona.decisionStyle && <p className="text-xs text-foreground/80"><span className="text-muted-foreground">Style:</span> {persona.decisionStyle}</p>}
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/80">
                                        <span>Price sensitivity: {persona.pricingSensitivity}/100</span>
                                        {persona.typicalBudget && <span className="text-muted-foreground/40">/</span>}
                                        {persona.typicalBudget && <span>{persona.typicalBudget}</span>}
                                    </div>
                                    {persona.goals.length > 0 && (
                                        <div className="flex flex-col gap-1.5 mt-1">
                                             <span className="text-[11px] font-medium text-muted-foreground">Likely to adopt if helps with</span>
                                             <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                 {persona.goals.slice(0, 4).map((g, i) => (
                                                     <span key={i} className="text-xs text-foreground/80">{g}</span>
                                                 ))}
                                             </div>
                                        </div>
                                    )}
                                </div>


                                    {(persona.bestFor?.length || persona.lessReliableFor?.length) ? (
                                    <div className="flex flex-col gap-3">
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">PREDICTION SCOPE</h4>
                                        {persona.bestFor && persona.bestFor.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {persona.bestFor!.map((item, i) => (
                                                    <span key={i} className="inline-flex items-center text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">{item}</span>
                                                ))}
                                            </div>
                                        )}
                                        {persona.lessReliableFor && persona.lessReliableFor.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {persona.lessReliableFor!.map((item, i) => (
                                                    <span key={i} className="inline-flex items-center text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">{item}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    ) : null}
                                    
                                {/* TIER 2 */}
                                <div className="flex flex-col gap-6">

                                {persona.values && persona.values.length > 0 && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">MOTIVATIONS</h4>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex flex-wrap gap-2">
                                                {persona.values.map((v, i) => (
                                                    <div key={i} className="flex flex-col">
                                                        <span className="inline-flex items-center text-xs font-medium text-foreground bg-secondary/50 border border-border/30 rounded-full px-3 py-1">{v}</span>
                                                        {persona.valueEvidence?.[i] && <details className="mt-1 group"><summary className="text-[10px] text-muted-foreground/50 cursor-pointer hover:text-foreground/70 transition-colors list-none flex items-center gap-1.5 font-sans pl-1"><span className="text-[10px] leading-none">▶</span> Source</summary><p className="text-[11px] text-foreground/60 italic mt-1 leading-relaxed border-l-2 border-border/30 pl-3 ml-1">{persona.valueEvidence[i]}</p></details>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {persona.fears && persona.fears.length > 0 && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">FRICTIONS</h4>
                                        </div>
                                        <ul className="space-y-3">
                                            {persona.fears.map((f, i) => (
                                                <li key={i} className="flex flex-col">
                                                    <div className="flex items-center gap-2.5 text-xs text-foreground/70 leading-relaxed">
                                                        <span className="text-destructive/60 shrink-0 mt-0.5">/</span>
                                                        {f}
                                                    </div>
                                                    {persona.fearEvidence?.[i] && <details className="mt-1 group ml-4"><summary className="text-[10px] text-muted-foreground/50 cursor-pointer hover:text-foreground/70 transition-colors list-none flex items-center gap-1.5 font-sans"><span className="text-[10px] leading-none">▶</span> Source</summary><p className="text-[11px] text-foreground/60 italic mt-1 leading-relaxed border-l-2 border-border/30 pl-3">{persona.fearEvidence[i]}</p></details>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                </div>

                                {/* TIER 3 */}
                                <div className="flex flex-col gap-5 mt-6 border-t border-border/10 pt-6">

                                <div className="flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">EVIDENCE &amp; CONFIDENCE</h4>
                                    {persona.provenance ? (
                                        <>
                                            {persona.provenance.attributes.length > 0 && (
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
                                                    {[...persona.provenance.attributes].sort((a, b) => b.confidence - a.confidence).map((attr, i) => {
                                                        const tc = attr.tier === 'observed' ? 'bg-emerald-500' : attr.tier === 'interpreted' ? 'bg-amber-400' : 'bg-gray-400';
                                                        return (
                                                            <div key={i} className="group relative flex items-center gap-2.5 text-xs">
                                                                <span className={'w-1.5 h-1.5 rounded-full shrink-0 ' + tc} />
                                                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                                                    <span className="text-foreground/70 truncate">{attr.attribute}</span>
                                                                    <span className="text-muted-foreground/40 text-[10px] font-mono">{attr.confidence >= 0.8 ? 'High' : attr.confidence >= 0.6 ? 'Moderate' : 'Low'}</span>
                                                                </div>
                                                                {attr.evidence && (
                                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 p-2.5 rounded-lg border border-border bg-card text-[11px] text-foreground/80 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                                                                        {attr.evidence}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-xs text-muted-foreground/60">
                                            {persona.generationMode === 'research' ? "No provenance data available" : "Generated from a description."}
                                        </p>
                                    )}
                                </div>

                                {persona.evidenceLinks && persona.evidenceLinks.length > 0 && (
                                    <div className="flex flex-col gap-3">
                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">SOURCES</h4>
                                        <div className="flex flex-col gap-2">
                                            {persona.evidenceLinks.map((link, i) => (
                                                <div key={i} className="relative pl-4 border-l-2 border-border/40">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{link.attribute}</span>
                                                        <span className="text-[10px] text-muted-foreground/40">{link.transcriptId}</span>
                                                    </div>
                                                    <p className="text-xs text-foreground/70 italic leading-relaxed">{link.excerpt}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                </div>

                                <div className="flex flex-col gap-3 mt-6 border-t border-border/10 pt-6">

                                <details className="group">
                                    <summary className="text-xs font-bold text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-2 py-1">
                                        <span className="text-[10px] text-muted-foreground/30 group-open:rotate-90 transition-transform duration-150">{'▶'}</span>
                                        ADDITIONAL CONTEXT
                                    </summary>
                                    <div className="flex flex-col gap-4 pt-4 pb-2">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            {persona.age && <span>{persona.age} years old</span>}
                                            {persona.educationLevel && <><span className="w-1 h-1 rounded-full bg-border" /><span>{persona.educationLevel}</span></>}
                                            {persona.occupation && <><span className="w-1 h-1 rounded-full bg-border" /><span>{persona.occupation}</span></>}
                                        </div>
                                        {persona.backstory && (
                                            <div className="flex flex-col gap-2">
                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">BACKSTORY</h4>
                                                <div className="relative">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                                                    <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-8 text-xs pl-8 rounded-md bg-muted/30 border-none" />
                                                </div>
                                                <div className="flex flex-col gap-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                                    {filteredBackstory.map((paragraph, i) => (
                                                        <p key={persona.id + '-para-' + i} className={cn("text-sm leading-relaxed text-foreground/70",
                                                            searchTerm && paragraph.toLowerCase().includes(searchTerm.toLowerCase()) ? "bg-primary/5 rounded-lg p-2" : ""
                                                        )}>{paragraph}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {(persona.identityContext || persona.situationContext) && (
                                            <div className="flex flex-col gap-2">
                                                {persona.identityContext && <p className="text-xs text-foreground/70"><span className="text-muted-foreground">Stable</span> {persona.identityContext}</p>}
                                                {persona.situationContext && <p className="text-xs text-foreground/70"><span className="text-muted-foreground">Context</span> {persona.situationContext}</p>}
                                            </div>
                                        )}
                                        {persona.clusterInfo && (
                                            <div className="text-xs text-muted-foreground/70">
                                                Represents {persona.clusterInfo.representedCount} interview subjects
                                                {persona.clusterInfo.sourceIds.length > 0 && (' (' + persona.clusterInfo.sourceIds.join(', ') + ')')}
                                            </div>
                                        )}
                                    </div>
                                </details>

                                <details className="group">
                                    <summary className="text-xs font-bold text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-2 py-1">
                                        <span className="text-[10px] text-muted-foreground/30 group-open:rotate-90 transition-transform duration-150">{'▶'}</span>
                                        ADVANCED MODEL DETAILS
                                    </summary>
                                    <div className="flex flex-col gap-5 pt-4 pb-2">
                                        <div className="space-y-4">
                                            {renderScalar("Conscientiousness", persona.conscientiousness, "Chaotic", "Meticulous")}
                                            {renderScalar("Neuroticism", persona.neuroticism, "Stable", "Anxious")}
                                            {renderScalar("Openness", persona.openness, "Traditional", "Curious")}
                                            {renderScalar("Extraversion", persona.extraversion, "Introvert", "Extrovert")}
                                            {renderScalar("Agreeableness", persona.agreeableness, "Competitive", "Compassionate")}
                                        </div>
                                        {persona.communicationStyle && <p className="text-xs text-foreground/70">Communication: {persona.communicationStyle}</p>}
                                        {persona.interests && persona.interests.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {persona.interests.map((v, i) => (
                                                    <span key={i} className="text-[11px] text-muted-foreground bg-secondary/30 px-2 py-0.5 rounded-sm">{v}</span>
                                                ))}
                                            </div>
                                        )}
                                        {persona.pbjRationales && (
                                            <div className="flex flex-col gap-2 pt-2 border-t border-border/10">
                                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">PSYCHOLOGICAL RATIONALES (PB&amp;J)</h4>
                                                <div className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto custom-scrollbar">{persona.pbjRationales}</div>
                                            </div>
                                        )}
                                    </div>
                                </details>
                                </div>
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
