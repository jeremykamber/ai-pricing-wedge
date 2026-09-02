"use client";

import React, { useState } from "react";
import { useDebateStore } from "@/ui/stores/debateStore";
import { usePersonaStore } from "@/ui/stores/personaStore";
import { useDebate } from "@/ui/hooks/useDebate";
import { DebateSidebar } from "@/ui/dashboard/components/debate/DebateSidebar";
import { DebateRoom } from "@/ui/dashboard/components/debate/DebateRoom";
import { DebateSetupPanel } from "@/ui/dashboard/components/debate/DebateSetupPanel";

export default function DebatesPage() {
  const [showSetup, setShowSetup] = useState(false);
  const [startingDebate, setStartingDebate] = useState(false);

  const { startDebate, setActiveDebate } = useDebate();
  const activeBatch = usePersonaStore((s) => {
    const batches = s.batches;
    const activeId = s.activeBatchId;
    return activeId ? batches.find((b) => b.id === activeId) : batches[0];
  });

  const availablePersonas = activeBatch?.personas ?? [];

  const handleStart = async (config: {
    proposal: string;
    participants: any[];
    totalRounds: number;
  }) => {
    setStartingDebate(true);
    try {
      const debateId = await startDebate(
        config.proposal,
        config.participants,
        config.totalRounds,
      );
      setShowSetup(false);
      setActiveDebate(debateId);
    } catch (err) {
      console.error("[DebatesPage] Failed to start debate:", err);
    } finally {
      setStartingDebate(false);
    }
  };

  return (
    <div className="flex h-full w-full animate-in fade-in duration-500">
      <DebateSidebar onNewDebate={() => setShowSetup(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        {showSetup ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-lg mx-auto">
              <DebateSetupPanel
                availablePersonas={availablePersonas}
                onStart={handleStart}
                onCancel={() => {
                  setShowSetup(false);
                }}
              />
              {startingDebate && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Starting debate...
                </div>
              )}
            </div>
          </div>
        ) : (
          <DebateRoom />
        )}
      </div>
    </div>
  );
}
