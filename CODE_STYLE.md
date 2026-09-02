# Code Style Guide

Consistent conventions observed across the DeepBound codebase.

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| **Files — domain, app, infra** | `PascalCase` | `ChatWithPersonaUseCase.ts`, `LlmServicePort.ts` |
| **Files — pages/routes** | `kebab-case` | `page.tsx`, `layout.tsx`, `route.ts` |
| **Files — utils, hooks, stores** | `camelCase` | `use-theme.ts`, `personaStore.ts`, `utils.ts` |
| **Test files** | Match source + `.test.ts` | `PersonaAdapter.test.ts` (co-located in `__tests__/`) |
| **Classes** | `PascalCase` | `LlmServiceImpl`, `AnalysisLogger` |
| **Interfaces** | `PascalCase` (no `I` prefix) | `LlmServicePort`, `Persona` |
| **Types** | `PascalCase` | `AgentAction`, `SimulationStatus` |
| **Functions** | `camelCase` | `execute()`, `createChatCompletion()` |
| **Methods** | `camelCase` | `handleGenerateVariation()`, `getActiveBatch()` |
| **Variables** | `camelCase` | `personaCount`, `activeBatchId` |
| **Constants** | `UPPER_SNAKE_CASE` | `OR_TEXT_MODEL`, `LOG_DIR` |
| **Boolean vars** | `is` / `has` prefix | `isOpen`, `isPending`, `_initialized` |

### Exceptions & Inconsistencies

- `IChatServicePort` uses Hungarian `I` prefix — **do not follow**. All other ports omit the `I` (e.g., `LlmServicePort`, `BrowserServicePort`).
- Store files use `camelCase` (e.g., `personaStore.ts`) but are PascalCase in exports (`PersonaStoreState`).

---

## File Organization

### Per-layer file placement

| Layer | Directory | Files |
|-------|-----------|-------|
| **Domain entities** | `src/domain/entities/` | One file per entity, same name as exported interface |
| **Domain ports** | `src/domain/ports/` | One file per port interface, suffix `Port` |
| **Domain DTOs** | `src/domain/dtos/` | One file per DTO, suffix `DTO` |
| **Use cases** | `src/application/usecases/` | One class per file, suffix `UseCase` |
| **Interview pipeline** | `src/application/interviewPipeline/` | One concern per file |
| **Adapters** | `src/infrastructure/adapters/` | Suffix `Impl` or descriptive (`OpenRouterChatAdapter`) |
| **Mappers** | `src/infrastructure/mappers/` | Suffix `Mapper` |
| **Server actions** | `src/actions/` | Suffix `Action` |
| **UI stores** | `src/ui/stores/` | Suffix `Store` (e.g., `personaStore.ts`) |
| **UI components** | `src/ui/*/components/` or `src/components/custom/` | PascalCase, `.tsx` |
| **shadcn/ui** | `src/components/ui/` | One file per component (kebab-case filenames) |

### Co-located tests

Tests sit in `__tests__/` next to their source file:

```
src/domain/entities/Persona.ts
src/domain/entities/__tests__/Persona.test.ts

src/infrastructure/adapters/LlmServiceImpl.ts
src/infrastructure/adapters/__tests__/LlmServiceImpl.test.ts

src/application/usecases/ChatWithPersonaUseCase.ts
src/application/usecases/__tests__/ChatWithPersonaUseCase.test.ts
```

E2E tests live in the root `test/` directory.

---

## Import Style

### Path aliases

Use `@/` absolute imports (configured in `tsconfig.json`):

```typescript
// ✅ Correct
import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { cn } from "@/lib/utils";

// ❌ Wrong
import { Persona } from "../../domain/entities/Persona";
```

### Import grouping (implicit convention)

Order imports by layer, from domain → infrastructure:

```typescript
// 1. External libraries
import OpenAI from "openai";
import { create } from "zustand";
import { describe, it, expect, vi } from "vitest";

// 2. Domain entities & ports
import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";

// 3. Application types
import { PricingAnalysisProgressStep } from "@/application/usecases/ParsePricingPageUseCase";

// 4. Infrastructure (same-layer imports)
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";
```

---

## Code Patterns

### 1. Interface → Class (Port → Adapter)

```typescript
// Port (domain/ports)
export interface LlmServicePort {
  generateInitialPersonas(description: string, count?: number): Promise<Persona[]>;
}

// Implementation (infrastructure/adapters)
export class LlmServiceImpl implements LlmServicePort {
  // ...implements interface methods
}
```

### 2. Use Case pattern

```typescript
export class ChatWithPersonaUseCase {
  constructor(private llmService: LlmServicePort) { }

  async execute(
    persona: Persona,
    analysis: PricingAnalysis | null,
    message: string,
    history: { role: 'user' | 'assistant', content: string }[]
  ): Promise<string> {
    return this.llmService.chatWithPersona(persona, analysis, message, history);
  }
}
```

### 3. Server Action pattern

```typescript
"use server"

export async function chatWithPersonaAction(...) {
  const stream = createStreamableValue<any>("");

  (async () => {
    try {
      const service = LlmServiceImpl.createFromEnv("openrouter");
      const useCase = new ChatWithPersonaUseCase(service);
      const responseStream = useCase.executeStream(...);
      for await (const chunk of responseStream) { stream.update(chunk); }
      stream.done(fullText);
    } catch (error) {
      console.error("Error:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}
```

### 4. Static factory method

```typescript
export class LlmServiceImpl implements LlmServicePort {
  static createFromEnv(
    provider: "ollama" | "openrouter",
    overrides?: { text?: string; vision?: string; ... }
  ): LlmServiceImpl {
    // Read env vars, create client, return instance
  }

  constructor(
    private client: OpenAI,
    private provider: OpenAIProvider,
    private models: { text: string; vision: string; ... }
  ) { ... }
}
```

### 5. Zustand store pattern

```typescript
interface PersonaStoreState {
  batches: PersonaBatch[];
  activeBatchId: string | null;
  addBatch: (batch: PersonaBatch) => void;
  setActiveBatch: (id: string | null) => void;
}

export const usePersonaStore = create<PersonaStoreState>()(
  persist(
    (set, get) => ({
      batches: [],
      activeBatchId: null,
      addBatch: (batch) =>
        set((state) => ({ batches: [batch, ...state.batches] })),
      // ...
    }),
    { name: 'persona-storage', storage: createJSONStorage(() => localStorage) }
  )
);
```

### 6. Entity + Zod schema

```typescript
export interface Persona {
  id: string;
  name: string;
  conscientiousness: number;  // 0-100
  neuroticism: number;
  // ...
}

export const PersonaSchema = z.object({
  id: z.string().describe("Unique identifier"),
  name: z.string(),
  conscientiousness: z.number().min(0).max(100),
  // ...
});

export function validatePersona(entity: Persona): boolean {
  return !!entity.id;
}
```

### 7. Component prop typing

```typescript
interface PersonaDetailSheetProps {
  persona: Persona | null;
  isOpen: boolean;
  onClose: () => void;
  onGenerateVariation: (adjustments: BigFiveAdjustment) => void;
}
```

### 8. Retry pattern (infrastructure)

```typescript
public async withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (error: unknown) {
      lastError = error;
      const status = (error as { status?: number }).status;
      const isRetryable = status === 429 || (status !== undefined && status >= 500);
      if (!isRetryable || i === maxRetries - 1) throw error;
      const waitTime = Math.pow(2, i) * 2000 + Math.random() * 1000;
      await this.sleep(waitTime);
    }
  }
  throw lastError;
}
```

---

## Error Handling

- **Return typed errors** from actions and use cases (not thrown strings)
- **Console.error** in actions and adapters with descriptive messages
- **AnalysisLogger** for structured JSONL logging in analysis pipelines
- **Retry transient failures** (429, 5xx) in LLM calls via `withRetry()`
- **Guard against null/undefined** with optional chaining and default values:

```typescript
return entity?.name ?? "—";
const isRetryable = status === 429 || (status !== undefined && status >= 500);
```

- **No empty catch blocks** — every catch must log, re-throw, or handle
- **Error boundaries** in stores (Zustand `set` must handle partial updates)

---

## Logging

### Console logging

Use `console.log` / `console.warn` / `console.error` with consistent prefixes:

```typescript
console.log(`[ModuleName] [Req #${id}] [${purpose}] Message`);
console.warn(`[LlmService] Retry ${i}/${maxRetries} after ${waitTime}ms`);
console.error("Error in useCaseName:", error);
```

### Structured logging (AnalysisLogger)

For analysis pipelines, use `AnalysisLogger` which writes JSONL to `logs/analysis/`:

```typescript
const log = AnalysisLogger.forRun(runId);
await log.init();
log.info("ModuleName", "Message", { key: "data" });
log.warn("ModuleName", "Warning message");
log.error("ModuleName", "Error message", { error });
await log.close();  // → logs/analysis/analysis-{runId}-{timestamp}.log
```

### Log levels

```
TRACE → DEBUG → INFO → WARN → ERROR
```

---

## Testing Patterns

### File naming

- Co-located: `src/**/__tests__/EntityName.test.ts`
- E2E: `test/feature-name-e2e.test.ts` or `test/feature-name-e2e.spec.ts`

### Test structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("PersonaAdapter", () => {
  let adapter: PersonaAdapter;
  let mockLlm: { createChatCompletion: ReturnType<typeof vi.fn>; ... };

  beforeEach(() => {
    mockLlm = { createChatCompletion: vi.fn(), ... };
    adapter = new PersonaAdapter(mockLlm as unknown as LlmServiceImpl);
  });

  describe("generateVariationPersonas", () => {
    it("should generate N variations with adjusted traits", async () => {
      mockLlm.createChatCompletion.mockResolvedValue(JSON.stringify([...]));
      const result = await adapter.generateVariationPersonas(ref, adj, 3);
      expect(result).toHaveLength(3);
      expect(result[0].name).toBeDefined();
    });
  });
});
```

### Mocking patterns

- **Mock LLM responses**: `mockLlm.createChatCompletion.mockResolvedValue(...)`
- **Cast adapters**: `as unknown as LlmServiceImpl` for type compatibility
- **Use `expect` for calls**: `expect(mockFn).toHaveBeenCalledWith(...)`
- **No real network in unit tests** — all LLM/API calls mocked

---

## Do's and Don'ts

### ✅ DO

- Use `bunx plop` to scaffold new entities, use cases, ports, adapters
- Keep domain layer **pure** — no framework, no infra imports
- One class/interface per file, named after the file
- Co-locate tests in `__tests__/` next to source
- Use `@/` path alias for all imports
- Constructor-inject dependencies in use cases and adapters
- Use `createFromEnv` static factories for infrastructure classes
- Prefer `AsyncIterable` for streaming LLM responses
- Return typed error objects from actions
- Log with `AnalysisLogger` for analysis pipeline runs

### ❌ DON'T

- Import from `infrastructure` or `ui` in `domain` or `application` layers
- Put business logic in Server Actions or UI components
- Use `I` prefix on interfaces — inconsistent with codebase convention
- Create Zustand stores for component-local state
- Leave empty `catch` blocks — always log or handle
- Use relative imports (`../../`) — use `@/` aliases
- Hardcode model names outside `LlmServiceImpl` — use defaults there
- Bypass Plop generators — they enforce naming and structure
- Commit `.env` files, `node_modules`, or `.next/` to git
