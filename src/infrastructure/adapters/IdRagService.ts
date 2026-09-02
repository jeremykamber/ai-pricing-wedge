import { Persona } from "@/domain/entities/Persona";
import { IdRagStore, RetrievalResult } from "./IdRagStore";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export interface RagContext {
  contextString: string;
  chunkCount: number;
}

export class IdRagService {
  constructor(private store: IdRagStore) {}

  indexPersona(persona: Persona, runId?: string): void {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    log?.trace("IdRagService", `Indexing persona "${persona.name}"`, {
      personaId: persona.id,
      hasBackstory: !!persona.backstory,
    });
    this.store.ingestPersona(persona);
  }

  retrieveContext(persona: Persona, query: string, k = 3, runId?: string): RagContext {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    log?.trace("IdRagService", `Retrieving context for "${persona.name}"`, {
      queryPreview: query.slice(0, 100),
      k,
      personaId: persona.id,
    });

    if (!persona.backstory) {
      log?.trace("IdRagService", `No backstory for "${persona.name}", returning empty context`);
      return { contextString: "", chunkCount: 0 };
    }

    const retrieveStart = Date.now();
    const results = this.store.retrieve(persona.id, query, k);
    const retrieveDuration = Date.now() - retrieveStart;

    const contextString = this.store.formatRetrievedContext(results);

    log?.trace("IdRagService", `Retrieval result for "${persona.name}"`, {
      chunkCount: results.length,
      contextLength: contextString.length,
      scores: results.map((r: RetrievalResult) => r.score.toFixed(4)),
      topics: results.map((r: RetrievalResult) => String(r.chunk.metadata["topic"] ?? "unknown")),
      durationUs: retrieveDuration,
    });

    return { contextString, chunkCount: results.length };
  }

  buildHybridPrompt(
    persona: Persona,
    query: string,
    options?: {
      systemPrompt?: string;
      ragContext?: string;
    },
  ): string {
    const parts: string[] = [];

    if (options?.systemPrompt) {
      parts.push(options.systemPrompt);
    }

    if (options?.ragContext) {
      parts.push(options.ragContext);
    }

    parts.push(`User says: "${query}"`);
    return parts.join("\n\n");
  }
}
