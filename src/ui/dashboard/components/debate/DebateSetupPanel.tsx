"use client";

import React, { useState } from "react";
import type { Persona } from "@/domain/entities/Persona";

interface DebateSetupConfig {
  proposal: string;
  participants: Persona[];
  totalRounds: number;
}

interface DebateSetupPanelProps {
  availablePersonas: Persona[];
  onStart: (config: DebateSetupConfig) => void;
  onCancel: () => void;
}

/**
 * Setup panel for configuring a new debate.
 * User selects personas, enters a proposal, and sets rounds.
 */
export function DebateSetupPanel({
  availablePersonas,
  onStart,
  onCancel,
}: DebateSetupPanelProps) {
  const [proposal, setProposal] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [totalRounds, setTotalRounds] = useState(3);

  const togglePersona = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Max 5 participants
        if (next.size >= 5) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const selectedPersonas = availablePersonas.filter((p) =>
    selectedIds.has(p.id),
  );

  const canSubmit =
    proposal.trim().length > 0 &&
    selectedPersonas.length >= 2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    onStart({
      proposal: proposal.trim(),
      participants: selectedPersonas,
      totalRounds,
    });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold tracking-tight">New Debate</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Proposal */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Proposal
          </label>
          <textarea
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            placeholder="What proposal should the personas debate?"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            rows={3}
          />
        </div>

        {/* Persona selection */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Participants ({selectedPersonas.length}/5 — select 2-5)
          </label>
          <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto custom-scrollbar">
            {availablePersonas.map((p) => {
              const isSelected = selectedIds.has(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors text-sm ${
                    isSelected
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-background border border-border/40 hover:border-border/80"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePersona(p.id)}
                    className="rounded border-input h-4 w-4 accent-primary"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {p.occupation}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-xs text-primary font-medium shrink-0">
                      Selected
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {availablePersonas.length < 2 && (
            <p className="text-xs text-destructive">
              You need at least 2 personas in your batch. Create more personas first.
            </p>
          )}
        </div>

        {/* Rounds */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Rounds: {totalRounds}
          </label>
          <input
            type="range"
            min={1}
            max={5}
            value={totalRounds}
            onChange={(e) => setTotalRounds(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>3 (recommended)</span>
            <span>5</span>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Start Debate
        </button>
      </form>
    </div>
  );
}
