"use client";

import React from "react";
import type { DebateMessage } from "@/domain/entities/DebateRoom";

interface DebateMessageBubbleProps {
  message: DebateMessage;
  occupation?: string;
  isStreaming?: boolean;
}

/**
 * A single message bubble in the debate room.
 * Participant messages show avatar initials + name + occupation.
 * User messages show "You" label with right-alignment.
 */
export function DebateMessageBubble({
  message,
  occupation,
  isStreaming,
}: DebateMessageBubbleProps) {
  const isUser = message.role === "user";
  const initials = message.personaName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Streaming placeholder — show typing dots
  if (isStreaming && !message.content) {
    return (
      <div className="flex flex-col max-w-[85%] self-start items-start">
        <div
          data-testid="typing-indicator"
          className="px-5 py-4 rounded-2xl rounded-tl-sm text-foreground border border-border/40 flex items-center gap-1.5"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col max-w-[85%] ${
        isUser ? "self-end items-end" : "self-start items-start"
      }`}
    >
      {/* Speaker label */}
      {!isUser && (
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary font-semibold text-xs text-secondary-foreground">
            {initials}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground leading-tight">
              {message.personaName}
            </span>
            {occupation && (
              <span className="text-[10px] text-muted-foreground leading-tight">
                {occupation}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap text-foreground ${
          isUser
            ? "rounded-tr-sm bg-primary/10 border border-primary/20"
            : "rounded-tl-sm bg-card border border-border/40"
        }`}
      >
        {message.content || (isStreaming ? "…" : "")}
      </div>

      {/* Label for user messages */}
      {isUser && (
        <span className="text-[10px] text-muted-foreground mt-1 px-1">You</span>
      )}
    </div>
  );
}
