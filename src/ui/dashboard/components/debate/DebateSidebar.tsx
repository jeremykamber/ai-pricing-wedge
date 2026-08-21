"use client";

import React from "react";
import { useDebateStore } from "@/ui/stores/debateStore";
import { MessageSquareIcon, PlusIcon } from "lucide-react";

interface DebateSidebarProps {
  onNewDebate: () => void;
}

/**
 * Sidebar listing all debates with status badges.
 * Clicking a debate sets it as the active view.
 */
export function DebateSidebar({ onNewDebate }: DebateSidebarProps) {
  const debates = useDebateStore((s) => s.debates);
  const activeDebateId = useDebateStore((s) => s.activeDebateId);
  const setActive = useDebateStore((s) => s.setActive);

  const statusConfig: Record<string, { label: string; dotClass: string }> = {
    setup: { label: "Setup", dotClass: "bg-muted-foreground" },
    in_progress: { label: "In Progress", dotClass: "bg-blue-500 animate-pulse" },
    completed: { label: "Completed", dotClass: "bg-green-500" },
    error: { label: "Error", dotClass: "bg-destructive" },
  };

  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r border-border/40 bg-sidebar flex flex-col h-full">
      <div className="h-14 flex items-center px-5 border-b border-border/40">
        <span className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <MessageSquareIcon className="h-4 w-4" />
          Debates
        </span>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {debates.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
            <MessageSquareIcon className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-xs text-muted-foreground">No debates yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-3 overflow-y-auto custom-scrollbar">
            {debates.map((debate) => {
              const config = statusConfig[debate.status] ?? statusConfig.error;
              const isActive = debate.id === activeDebateId;
              const preview = debate.proposal.length > 40
                ? debate.proposal.slice(0, 40) + "…"
                : debate.proposal;

              return (
                <button
                  key={debate.id}
                  onClick={() => setActive(debate.id)}
                  className={`flex flex-col gap-1 px-3 py-2.5 rounded-md text-left transition-colors w-full ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${config.dotClass}`} />
                    <span className={`text-xs font-medium truncate ${isActive ? "text-primary" : ""}`}>
                      {config.label}
                    </span>
                  </div>
                  <span className="text-xs truncate pl-[14px]">{preview}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/40">
        <button
          type="button"
          onClick={onNewDebate}
          className="flex items-center justify-center gap-2 w-full h-9 rounded-md bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New Debate
        </button>
      </div>
    </aside>
  );
}
