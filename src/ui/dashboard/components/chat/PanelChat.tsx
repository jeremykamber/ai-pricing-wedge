"use client"

import React, { useState, useTransition, useRef, useEffect } from "react"
import type { PersonaResponse } from "@/domain/entities/PersonaResponse"
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis"
import { chatWithPanelAction } from "@/actions/chatWithPanel"
import { Send, Loader2, UsersIcon } from "lucide-react"
import { readStreamableValue } from "@ai-sdk/rsc"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { parseMessageContent } from "./parseMessageContent"

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PanelChatProps {
  responses: PersonaResponse[]
  synthesis: ArtifactSynthesis | null
  personaNames: string[]
  isOpen: boolean
  onClose: () => void
}

/**
 * Panel synthesis chat — question the whole cohort at once. The assistant is
 * a research synthesizer grounded in every persona's analysis response plus
 * the cross-persona synthesis: "we're thinking of adding X — what would our
 * users think?" gets an evidence-backed answer across all personas.
 */
export function PanelChat({ responses, synthesis, personaNames, isOpen, onClose }: PanelChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isPending, startTransition] = useTransition()
  const chatRef = useRef<HTMLDivElement>(null)
  // True while the user is at (or near) the bottom of the chat pane. Auto-follow
  // only applies then; scrolling up to read earlier messages suspends it.
  const stickToBottomRef = useRef(true)

  // Pin to the newest message while the conversation grows. Runs per-token
  // during streaming, so an instant (non-smooth) assignment keeps up with the
  // stream without stacking animation jitter. Skipped when the user has
  // scrolled away to read older messages.
  useEffect(() => {
    const el = chatRef.current
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, isPending])

  const handleSend = (overrideMessage?: string) => {
    const messageToSend = (overrideMessage || input).trim()
    if (!messageToSend || isPending) return

    // Sending a message means the user wants to watch the reply arrive —
    // re-engage follow mode.
    stickToBottomRef.current = true
    setInput("")
    const newMessages: Message[] = [...messages, { role: 'user', content: messageToSend }]
    setMessages(newMessages)
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    startTransition(async () => {
      try {
        const { streamData } = await chatWithPanelAction(
          responses,
          synthesis,
          messageToSend,
          messages
        )

        for await (const content of readStreamableValue(streamData)) {
          if (content) {
            // Error step delivered as object via stream.done({ step: "ERROR" })
            if (typeof content !== 'string') {
              const errorMsg = (content as { error?: string }).error || 'Chat failed'
              throw new Error(errorMsg)
            }
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last && last.role === 'assistant') {
                return [...prev.slice(0, -1), { role: 'assistant', content }]
              }
              return prev
            })
          }
        }
      } catch (error) {
        console.error('Panel chat error:', error)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && last.content === '') {
            return [...prev.slice(0, -1), { role: 'assistant', content: 'Connection lost. Please try again.' }]
          }
          return [...prev, { role: 'assistant', content: 'Connection lost. Please try again.' }]
        })
      }
    })
  }

  const names = personaNames.length > 0
    ? personaNames.join(', ')
    : responses.length > 0
      ? `${responses.length} personas`
      : 'your audience'

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UsersIcon className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base">Ask the simulated users</DialogTitle>
                <DialogDescription className="text-xs">
                  One question, synthesized across {names}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div
            ref={chatRef}
            onScroll={(e) => {
              const el = e.currentTarget
              stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}
            className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar"
          >
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-xl">
                  🎯
                </div>
                <p className="text-sm max-w-[280px] text-balance">
                  Ask the simulated users about what they experienced — what
                  they saw, what stopped them, what they'd want changed.
                </p>
                <div className="flex flex-col gap-2 w-full max-w-[280px]">
                  {[
                    "We're thinking of adding a free tier — what would the simulated users think?",
                    "What stopped people from signing up?",
                    "Where did the simulated users disagree?",
                    "Show me the dissenting opinions.",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSend(suggestion)}
                      className="text-xs text-left px-3 py-2 rounded-md border border-border bg-background hover:bg-muted/40 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/60 max-w-[280px]">
                  Findings describe simulated users — hypotheses to test, not
                  proof about real users.
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`flex flex-col max-w-[85%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
                >
                  <div
                    style={{
                      backgroundColor: m.role === 'user'
                        ? 'var(--chat-user-bubble)'
                        : 'var(--chat-assistant-bubble)',
                    }}
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed break-words min-w-0 max-w-full text-foreground ${
                      m.role === 'user' ? 'rounded-tr-sm whitespace-pre-wrap' : 'rounded-tl-sm border border-border/40'
                    }`}
                  >
                    {parseMessageContent(m.content)}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1.5 px-1">
                    {m.role === 'user' ? 'You' : 'Synthesis'}
                  </span>
                </div>
              ))
            )}
            {isPending && (
              <div className="self-start flex flex-col max-w-[85%] items-start">
                <div
                  style={{ backgroundColor: 'var(--chat-assistant-bubble)' }}
                  className="px-5 py-4 rounded-2xl rounded-tl-sm text-foreground border border-border/40 flex items-center gap-1.5"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-[fade-in-out_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-[fade-in-out_1.4s_ease-in-out_infinite]" style={{ animationDelay: '467ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-[fade-in-out_1.4s_ease-in-out_infinite]" style={{ animationDelay: '933ms' }} />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-card border-t border-border/40 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
              className="relative flex items-center"
            >
              <input
                type="text"
                className="w-full h-12 pl-4 pr-12 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all placeholder:text-muted-foreground/70"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the whole audience..."
                disabled={isPending}
              />
              <button
                type="submit"
                disabled={isPending || !input || !input.trim()}
                className="absolute right-1.5 h-9 w-9 flex items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
