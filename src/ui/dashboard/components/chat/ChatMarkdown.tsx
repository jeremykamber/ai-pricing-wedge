import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"

/**
 * Renders a chat message body as markdown (bold, italics, lists, links, code).
 *
 * Chat content arrives as plain text from the LLM — without this, `**bold**`
 * shows literally. Two choices keep it chat-shaped:
 *
 * 1. `remark-breaks` — the LLM separates thoughts with single newlines, and
 *    markdown normally collapses those into spaces. This plugin renders a
 *    single newline as a line break, so persona replies keep their rhythm.
 * 2. `p -> span` — react-markdown wraps text in <p>; inside a message bubble
 *    that adds paragraph gaps between every segment. Rendering paragraphs as
 *    spans keeps the bubble tight while still allowing block elements
 *    (lists, code blocks) where the model actually uses them.
 */
export function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => <span className="inline">{children}</span>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border/60 pl-3 my-1.5 text-muted-foreground">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-md bg-muted p-3 my-2 text-xs font-mono leading-relaxed">
            {children}
          </pre>
        ),
        h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
