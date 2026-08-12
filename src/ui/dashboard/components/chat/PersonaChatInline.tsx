"use client"

import React, { useState, useTransition, useRef, useEffect } from "react"
import { Persona } from "@/domain/entities/Persona"
import { chatWithPersonaAction } from "@/actions/chatWithPersona"
import { useLocalStorage } from "@/ui/hooks/useLocalStorage"
import { Send, Loader2 } from "lucide-react"
import { readStreamableValue } from "@ai-sdk/rsc"
import { TooltipProvider } from "@/components/ui/tooltip"
import { parseMessageContent } from "./parseMessageContent"

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PersonaChatInlineProps {
  persona: Persona
}

export function PersonaChatInline({ persona }: PersonaChatInlineProps) {
  const storageKey = `persona_chat_${persona.id}`
  const [messages, setMessages] = useLocalStorage<Message[]>(storageKey, [])
  const [input, setInput] = useState("")
  const [isPending, startTransition] = useTransition()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  // Scroll to the newest message only when the conversation changes.
  // Runs per-token during streaming, so an instant (non-smooth) scroll keeps
  // up with the stream; smooth scrolling here stacks animations and jitters.
  useEffect(() => {
    const el = messagesEndRef.current
    if (!el) return
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "auto", block: "end" })
    })
    return () => cancelAnimationFrame(frame)
  }, [messages])

  // Keep the chat pane pinned to the newest message while streaming.
  useEffect(() => {
    const el = chatRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [isPending])

  const handleSend = (overrideMessage?: string) => {
    const messageToSend = (overrideMessage || input).trim()
    if (!messageToSend || isPending) return

    setInput("")
    const newMessages: Message[] = [...messages, { role: 'user', content: messageToSend }]
    setMessages(newMessages)

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    startTransition(async () => {
      try {
        const { streamData } = await chatWithPersonaAction(
          persona,
          null,
          messageToSend,
          messages
        )

        for await (const content of readStreamableValue(streamData)) {
          if (content) {
            if (typeof content !== 'string') {
              const errorMsg = (content as any)?.error || 'Chat failed'
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
        console.error('Chat error:', error)
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

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar"
        >
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-xl">
                💬
              </div>
              <p className="text-sm max-w-[250px] text-balance">
                Start a conversation with {persona.name}. Ask them about your product, pricing, or their pain points.
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
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap text-foreground ${
                    m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm border border-border/40'
                  }`}
                >
                  {parseMessageContent(m.content)}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1.5 px-1">
                  {m.role === 'user' ? 'You' : persona.name}
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
          <div ref={messagesEndRef} />
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
              placeholder={`Message ${persona.name}...`}
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
      </div>
    </TooltipProvider>
  )
}
