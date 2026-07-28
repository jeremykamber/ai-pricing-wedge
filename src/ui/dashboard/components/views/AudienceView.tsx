"use client"

import { useState } from "react"
import { Persona } from '@/domain/entities/Persona'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import { PersonaProfilePanel } from '@/components/custom/PersonaProfilePanel'
import { PersonaChat } from "../chat/PersonaChat"
import { PersonaDetailModal } from "@/components/custom/PersonaDetailModal"

interface AudienceViewProps {
  personas: Persona[]
  analysisFlow: ReturnType<typeof useAnalysisFlow>
}

export function AudienceView({ personas, analysisFlow }: AudienceViewProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)

  const getPersona = (id: string) => personas.find(p => p.id === id)
  const selectedPersona = selectedPersonaId ? getPersona(selectedPersonaId) : null

  const handleOpenDetail = (id: string) => {
    setSelectedPersonaId(id)
    setIsDetailModalOpen(true)
  }

  const handleOpenChat = (persona: Persona) => {
    setSelectedPersonaId(persona.id)
    setIsDetailModalOpen(false)
    setIsChatOpen(true)
  }

  return (
    <div className="flex flex-col gap-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2 border-b border-border/40 pb-6">
        <h2 className="text-2xl font-bold tracking-tight">Generated Audience</h2>
        <p className="text-muted-foreground text-sm">
          Review the personas synthesized from your target market description. You can also chat with them before running the simulation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {personas.map((persona) => (
          <PersonaProfilePanel
            key={persona.id}
            persona={persona}
            onClick={() => handleOpenDetail(persona.id)}
            onChatClick={() => handleOpenChat(persona)}
          />
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="button"
          disabled={analysisFlow.isPending || (!analysisFlow.artifactUrl && !analysisFlow.artifactImageBase64)}
          onClick={() => analysisFlow.handleAnalyzeArtifact(personas)}
          className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {analysisFlow.isPending ? "Simulating Feedback..." : "Run Analysis"}
        </button>
      </div>

      {analysisFlow.error && (
        <div className="bg-destructive/10 text-destructive text-sm font-medium p-4 rounded-lg border border-destructive/20 mt-4">
          {analysisFlow.error}
        </div>
      )}

      {/* Detail Modal */}
      <PersonaDetailModal
        persona={selectedPersona ?? null}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onChatClick={handleOpenChat}
      />

      {selectedPersona && (
        <PersonaChat
          persona={selectedPersona}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  )
}
