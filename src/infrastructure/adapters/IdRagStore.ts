/**
 * In-memory vector store for ID-RAG (Identity Retrieval-Augmented Generation).
 * Implements the identity graph retrieval approach from Tan et al. (2025).
 *
 * Each persona has:
 * - Chunks of their backstory with metadata (topic, tone, relationships)
 * - Simple embedding via character n-gram hashing for semantic similarity
 * - Top-K retrieval with relevance scoring
 */
import { Persona } from "@/domain/entities/Persona";
import { ngramFingerprint, cosineSimilarity } from "@/application/interviewPipeline/ngramUtils";

export interface Chunk {
  id: string;
  personaId: string;
  text: string;
  chunkType: "backstory" | "interview";
  metadata: Record<string, unknown>; // emotionalTone, topic for backstory; signalTypes, sourceInterviewId for interview
}

export interface RetrievalResult {
  chunk: Chunk;
  score: number;
}

export function detectTone(text: string): "positive" | "negative" | "neutral" | "mixed" {
  const lower = text.toLowerCase();
  const positive = ["love", "great", "excited", "happy", "success", "proud", "wonderful", "thrilled"];
  const negative = ["hate", "terrible", "awful", "angry", "regret", "fail", "worst", "trauma", "scam", "loss"];

  let posScore = 0;
  let negScore = 0;

  for (const w of positive) {
    if (lower.includes(w)) posScore++;
  }
  for (const w of negative) {
    if (lower.includes(w)) negScore++;
  }

  if (posScore > 0 && negScore > 0) return "mixed";
  if (posScore > 0) return "positive";
  if (negScore > 0) return "negative";
  return "neutral";
}

/** Link related chunks (those adjacent or same-topic). Works on generic Chunk[] (expects metadata.topic). */
export function linkRelated(chunks: Chunk[]): void {
  for (let i = 0; i < chunks.length; i++) {
    const related: string[] = [];

    if (i > 0) related.push(chunks[i - 1].id);
    if (i < chunks.length - 1) related.push(chunks[i + 1].id);

    for (let j = 0; j < chunks.length; j++) {
      if (j !== i) {
        const topicJ = String(chunks[j].metadata["topic"] ?? "");
        const topicI = String(chunks[i].metadata["topic"] ?? "");
        if (topicJ && topicJ === topicI) {
          if (!related.includes(chunks[j].id)) {
            related.push(chunks[j].id);
          }
        }
      }
    }

    // store up to 5 related ids
    chunks[i].metadata["relatedChunkIds"] = related.slice(0, 5);
  }
}

/** Split backstory text into semantically coherent chunks with metadata. Exported for reuse. */
export function chunkBackstory(personaId: string, backstory: string): Chunk[] {
  if (!backstory || !backstory.trim()) {
    return [];
  }

  const paragraphs = backstory
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 50);

  const topicTags = [
    { keywords: ["childhood", "grew up", "family", "parent", "school", "college", "university"], topic: "early-life" },
    { keywords: ["career", "job", "work", "company", "startup", "role", "position", "promotion", "fired", "laid off"], topic: "career" },
    { keywords: ["money", "purchase", "buy", "cost", "price", "budget", "spend", "saving", "invest", "roi"], topic: "finance" },
    { keywords: ["fail", "loss", "trauma", "scam", "mistake", "regret", "bad", "waste", "terrible"], topic: "setback" },
    { keywords: ["home", "office", "apartment", "environment", "design", "decor", "aesthetic", "style", "clutter"], topic: "environment" },
    { keywords: ["value", "believe", "philosophy", "principle", "priority", "trust", "risk", "efficiency"], topic: "values" },
    { keywords: ["current", "now", "recent", "today", "present", "looking"], topic: "present-outlook" },
  ];

  const chunks: Chunk[] = paragraphs.map((text, idx) => {
    const lower = text.toLowerCase();
    const matched = topicTags
      .filter((t) => t.keywords.some((kw) => lower.includes(kw)))
      .map((t) => t.topic);

    const tone = detectTone(text);
    const chunk: Chunk = {
      id: `chunk-${personaId}-${idx}`,
      personaId,
      text,
      chunkType: "backstory",
      metadata: {
        topic: matched.length > 0 ? matched.join(", ") : "general",
        emotionalTone: tone,
        relatedChunkIds: [] as string[],
        relationshipType: "temporal",
      },
    };
    return chunk;
  });

  linkRelated(chunks);
  return chunks;
}

export class IdRagStore {
  private chunks: Map<string, Chunk[]> = new Map();

  // NOTE: The instance-private chunkBackstory implementation was removed.
  // The exported standalone `chunkBackstory(personaId, backstory)` above is the
  // canonical implementation and the backwards-compatible wrapper below
  // delegates to it. Keeping this class small avoids duplicate implementations
  // and references to removed types like `BackstoryChunk`.

  /** Ingest a persona's backstory into the store. */
  ingestPersona(persona: Persona): void {
    if (!persona.backstory) return;
    const chunks = chunkBackstory(persona.id, persona.backstory);
    this.chunks.set(persona.id, chunks);
  }

  /** Append pre-built chunks to a persona's existing chunks. */
  ingestChunks(personaId: string, chunks: Chunk[]): void {
    const existing = this.chunks.get(personaId) ?? [];
    this.chunks.set(personaId, [...existing, ...chunks]);
  }

  /** Backwards-compatible method kept for tests and callers: delegates to exported chunkBackstory. */
  chunkBackstory(personaId: string, backstory: string): Chunk[] {
    return chunkBackstory(personaId, backstory);
  }

  /** Retrieve top-K chunks most relevant to a query. */
  retrieve(
    personaId: string,
    query: string,
    k = 3,
  ): RetrievalResult[] {
    const personaChunks = this.chunks.get(personaId);
    if (!personaChunks || personaChunks.length === 0) return [];

    const queryVec = ngramFingerprint(query);

    const scored = personaChunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryVec, ngramFingerprint(chunk.text)),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /** Build a RAG context string from retrieved chunks. */
  formatRetrievedContext(results: RetrievalResult[]): string {
    if (results.length === 0) return "";

    return results
      .map(
        (r, i) => {
          const meta = r.chunk.metadata;
          if (r.chunk.chunkType === "backstory") {
            const topic = String(meta["topic"] ?? "");
            const tone = String(meta["emotionalTone"] ?? "");
            return `[Relevant Memory ${i + 1}] (Topic: ${topic}, Tone: ${tone})\n${r.chunk.text}`;
          }

          // interview or unknown
          const src = String(meta["sourceInterviewId"] ?? "");
          const signals = Array.isArray(meta["signalTypes"]) ? (meta["signalTypes"] as string[]).join(", ") : String(meta["signalTypes"] ?? "");
          return `[Relevant Memory ${i + 1}] (Source: ${src}, Signals: ${signals})\n${r.chunk.text}`;
        },
      )
      .join("\n\n");
  }

  /** Clear all chunks for a persona. */
  clearPersona(personaId: string): void {
    this.chunks.delete(personaId);
  }
}
