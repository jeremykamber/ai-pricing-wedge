# Supabase Auth & Cloud Persistence Implementation Plan

**Goal:** Migrate Kynd from browser-local storage to Supabase as the source of truth, with Google OAuth for authentication and browser-independent simulation lifecycles.

**Architecture:** Simulations, personas, and analyses persist in Supabase (PostgreSQL + Storage). Three domain ports (`SimulationRepositoryPort`, `PersonaRepositoryPort`, `ScreenshotStoragePort`) abstract the storage layer. Adapters implement these ports against Supabase. Use cases orchestrate through ports. Server actions are thin wrappers that authenticate + wire dependencies. VPS writes directly to Supabase via service-role adapters. IndexedDB becomes a read-only cache.

**Design:** `thoughts/shared/designs/2026-07-16-supabase-auth-design.md`

---

## Key Decisions

1. **Supabase client:** Create a single `createSupabaseClient()` utility in `src/infrastructure/supabase.ts` that reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A separate `createSupabaseServiceClient()` reads `SUPABASE_SERVICE_ROLE_KEY` for VPS use. Both use `@supabase/supabase-js`.

2. **Auth helper:** Create `src/infrastructure/auth.ts` with `requireAuth()` that extracts the user from the Supabase session cookie (via `cookies()` in server components/actions). Returns `{ userId: string }` or throws.

3. **Simulation entity update:** The existing `Simulation` interface in `src/domain/entities/Simulation.ts` needs additional fields to match the Supabase schema: `userId`, `screenshotUrl`, `startedAt`, `lastHeartbeat`, `progressStep`. The `SimulationStatus` type needs to be expanded to match Supabase: `'QUEUED' | 'STARTING' | 'RUNNING' | 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'`.

4. **New entities:** `PersonaBatch` entity (domain) and `Analysis` entity (domain) — the existing `PricingAnalysis` gets renamed/restructured to `Analysis` to match the Supabase table, while the LLM analysis shape stays in `PricingAnalysis`.

5. **Clean slate:** No IndexedDB migration. Users start fresh. The `persist` middleware on `simulationStore` stays but becomes a read-only cache (writes go to Supabase first, then update IndexedDB).

6. **Existing store replacement:** The in-memory stores (`SimulationResultStore`, `progressStore`, `screenshotStore`) are replaced by Supabase reads. On the VPS, the same adapters with service-role key handle writes.

7. **Auth gating:** Auth is required for saving simulations, not for browsing. The `runSimulationAction` and `createSimulationAction` will call `requireAuth()` at the top. The UI shows a sign-in prompt when unauthenticated users try to run.

---

## Dependency Graph

```
Batch 1 (parallel): 1.1, 1.2, 1.3, 1.4, 1.5 [foundation — no deps]
Batch 2 (parallel): 2.1, 2.2, 2.3, 2.4 [domain entities + ports — depends on 1.1]
Batch 3 (parallel): 3.1, 3.2, 3.3 [adapters + auth — depends on 1.2, 1.3, 2.1–2.4]
Batch 4 (parallel): 4.1, 4.2, 4.3, 4.4, 4.5, 4.6 [use cases — depends on 2.x, 3.x]
Batch 5 (parallel): 5.1, 5.2, 5.3 [server actions + auth middleware — depends on 3.x, 4.x]
Batch 6 (parallel): 6.1, 6.2, 6.3, 6.4, 6.5 [VPS integration — depends on 3.x, 4.x]
Batch 7 (parallel): 7.1, 7.2, 7.3, 7.4 [client-side — depends on 5.x]
Batch 8:            8.1 [cleanup + wiring — depends on all]
```

---

## Batch 1: Foundation (parallel — 5 implementers)

All tasks in this batch have NO dependencies and run simultaneously.

### Task 1.1: Install Supabase dependencies
**File:** `package.json` (modify)
**Test:** none (config)
**Depends:** none

**Change:** Add `@supabase/supabase-js` and `@supabase/ssr` as dependencies. Run `bun install`.

**Why both packages:** `@supabase/supabase-js` is the core client. `@supabase/ssr` provides Next.js App Router integration (cookie-based sessions in Server Components and Server Actions). Without `@supabase/ssr`, we'd need to manually wire cookie handling.

**Verify:** `bun install` succeeds, `node -e "require('@supabase/supabase-js')"` doesn't error
**Commit:** `chore(deps): add supabase client packages`

---

### Task 1.2: Create Supabase client utility
**File:** `src/infrastructure/supabase.ts` (create)
**Test:** none (infrastructure config, verified by adapter tests)
**Depends:** 1.1

**Change:** Create a module that exports two factory functions:

1. `createSupabaseClient()` — reads `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` from env, returns a `createClient()` from `@supabase/supabase-js`. This is for the Netlify side (user-scoped, respects RLS).

2. `createSupabaseServiceClient()` — reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env, returns a `createClient()` with `auth: { persistSession: false }`. This is for the VPS side (bypasses RLS).

Both functions throw if env vars are missing.

**Verify:** TypeScript compiles: `bunx tsc --noEmit src/infrastructure/supabase.ts`
**Commit:** `feat(infrastructure): add Supabase client factories`

---

### Task 1.3: Create auth helper
**File:** `src/infrastructure/auth.ts` (create)
**Test:** none (verified by integration tests in batch 5)
**Depends:** 1.1

**Change:** Create a module with a single exported function:

```ts
export async function requireAuth(): Promise<{ userId: string }>
```

Implementation:
- Import `cookies` from `next/headers`
- Create a Supabase client using `createClient` from `@supabase/ssr` with the cookies adapter (reads the `sb-<project-ref>-auth-token` cookie set by Supabase Auth)
- Call `supabase.auth.getUser()` to validate the session
- If no user or error, throw an `UnauthorizedError`
- Return `{ userId: user.id }`

Also export a simple `UnauthorizedError` class for use by server actions.

**Verify:** TypeScript compiles
**Commit:** `feat(infrastructure): add auth helper for server actions`

---

### Task 1.4: Create Supabase env vars template
**File:** `.env.local.example` (create)
**Test:** none (config)
**Depends:** none

**Change:** Create an example env file documenting all required Supabase variables:

```
# Supabase (required for cloud persistence)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**Verify:** File exists and is well-formed
**Commit:** `chore(config): add Supabase env vars template`

---

### Task 1.5: Create Supabase SQL migration
**File:** `supabase/migrations/001_initial_schema.sql` (create)
**Test:** none (run against Supabase SQL editor)
**Depends:** none

**Change:** Create the full SQL migration from the design spec:
- `profiles` table (extends `auth.users`)
- `simulations` table with all columns from design
- `analyses` table with UNIQUE constraint on `(simulation_id, persona_id)`
- `personas` table
- `persona_batches` table
- All indexes from design
- RLS policies for all tables (users can only CRUD their own data)
- `screenshots` storage bucket (private)
- Storage RLS policies (users can only access `{user_id}/{simulation_id}/*` paths)
- Trigger on `auth.users` insert to auto-create `profiles` row

Also create `supabase/migrations/001_initial_schema_rollback.sql` for safety.

**Verify:** SQL is syntactically valid (paste into Supabase SQL editor, check for errors)
**Commit:** `feat(db): add initial Supabase schema migration`

---

## Batch 2: Domain Entities + Ports (parallel — 4 implementers)

All tasks in this batch depend on Batch 1 completing.

### Task 2.1: Update Simulation entity + create SimulationStatus
**File:** `src/domain/entities/Simulation.ts` (modify)
**Test:** `src/domain/entities/__tests__/Simulation.test.ts` (create)
**Depends:** 1.1

**Change:** Update the existing `Simulation` interface and `SimulationStatus` type to match the Supabase schema:

New `SimulationStatus`: `'QUEUED' | 'STARTING' | 'RUNNING' | 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'`

Updated `Simulation` interface adds:
- `userId: string` (required)
- `screenshotUrl?: string` (replaces `screenshot: string` which was base64)
- `startedAt?: string`
- `lastHeartbeat?: string`
- `progressStep?: string` (replaces `currentStep` which was typed to `PricingAnalysisProgressStep`)
- `error?: string` (stays)
- `analyses?: Analysis[]` (use new `Analysis` type, not `PricingAnalysis`)
- Remove: `streamingTexts`, `screenshot` (base64), `completedAnalyses` (computed from `analyses.length`)

Keep `generateSimulationName()` as-is.

**Test:** Unit tests for `generateSimulationName()` (existing tests likely cover this, but add explicit coverage for the new entity shape).

**Verify:** `bun test src/domain/entities/__tests__/Simulation.test.ts`
**Commit:** `feat(domain): update Simulation entity for Supabase schema`

---

### Task 2.2: Create Analysis entity
**File:** `src/domain/entities/Analysis.ts` (create)
**Test:** `src/domain/entities/__tests__/Analysis.test.ts` (create)
**Depends:** 1.1

**Change:** Create a new `Analysis` domain entity that maps to the Supabase `analyses` table:

```ts
interface Analysis {
  id: string
  simulationId: string
  personaId?: string
  personaSnapshot: Record<string, unknown>  // JSONB — snapshot of persona at time of analysis
  scores: Record<string, unknown>           // JSONB — the scoring results
  risks: string[]
  recommendations: string[]
  suggestion?: string
  gazePoints?: GazePoint[]
  screenshotUrl?: string                     // Supabase Storage URL
  createdAt: string
}
```

This is the cloud-persisted representation. The existing `PricingAnalysis` (which has `screenshotBase64`, `thoughts`, etc.) stays as the LLM-level analysis shape — the adapter will map between them.

**Test:** Basic type validation test.

**Verify:** `bun test src/domain/entities/__tests__/Analysis.test.ts`
**Commit:** `feat(domain): add Analysis entity for cloud persistence`

---

### Task 2.3: Create PersonaBatch entity
**File:** `src/domain/entities/PersonaBatch.ts` (create)
**Test:** `src/domain/entities/__tests__/PersonaBatch.test.ts` (create)
**Depends:** 1.1

**Change:** Create a new `PersonaBatch` domain entity:

```ts
type BatchStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
type BatchSource = 'manual' | 'interview'

interface PersonaBatch {
  id: string
  userId: string
  name: string
  source: BatchSource
  status: BatchStatus
  progressStep?: string
  completedCount?: number
  totalCount?: number
  startedAt?: string
  completedAt?: string
  lastHeartbeat?: string
  personas: Persona[]
  createdAt: string
}
```

**Test:** Basic type tests.

**Verify:** `bun test src/domain/entities/__tests__/PersonaBatch.test.ts`
**Commit:** `feat(domain): add PersonaBatch entity`

---

### Task 2.4: Create three domain ports
**File:** `src/domain/ports/SimulationRepositoryPort.ts` (create)
**File:** `src/domain/ports/PersonaRepositoryPort.ts` (create)
**File:** `src/domain/ports/ScreenshotStoragePort.ts` (create)
**Test:** none (interfaces only, verified by adapter + use case tests)
**Depends:** 2.1, 2.2, 2.3

**Change:** Create three port interfaces exactly as specified in the design spec:

**SimulationRepositoryPort** — methods: `create`, `findById`, `findByUser`, `update`, `updateProgress`, `upsertAnalysis`, `delete`

**PersonaRepositoryPort** — methods: `createBatch`, `findBatchById`, `findBatchesByUser`, `createPersonas`, `deleteBatch`

**ScreenshotStoragePort** — methods: `upload`, `delete`

Each port is a TypeScript interface. No implementation. Imports types from domain entities.

**Verify:** `bunx tsc --noEmit` compiles
**Commit:** `feat(domain): add three repository ports`

---

## Batch 3: Adapters + Auth Integration (parallel — 3 implementers)

All tasks in this batch depend on Batch 1 + Batch 2 completing.

### Task 3.1: Create SupabaseSimulationRepository adapter
**File:** `src/infrastructure/adapters/SupabaseSimulationRepository.ts` (create)
**Test:** `src/infrastructure/adapters/__tests__/SupabaseSimulationRepository.test.ts` (create)
**Depends:** 1.2, 2.1, 2.2, 2.4

**Change:** Implement `SimulationRepositoryPort` using Supabase client:

- `create(simulation)` — `supabase.from('simulations').insert(...)` — maps `Simulation` entity → Supabase row
- `findById(id)` — `supabase.from('simulations').select('*, analyses(*)').eq('id', id).single()`
- `findByUser(userId)` — `supabase.from('simulations').select('*').eq('user_id', userId).order('created_at', { ascending: false })`
- `update(id, updates)` — `supabase.from('simulations').update(...).eq('id', id)`
- `updateProgress(id, step, completed, total)` — updates `status`, `progress_step`, `completed_count`, `last_heartbeat`
- `upsertAnalysis(analysis)` — `supabase.from('analyses').upsert(...)` with onConflict on `(simulation_id, persona_id)`
- `delete(id)` — `supabase.from('simulations').delete().eq('id', id)` (cascades to analyses)

Create mapper functions (`toSimulationRow`, `toSimulationEntity`, `toAnalysisRow`, `toAnalysisEntity`) to convert between domain entities and Supabase rows.

**Test:** Unit tests with a mocked Supabase client. Mock `supabase.from()` chain. Verify correct table names, query methods, and mapper round-trips.

**Verify:** `bun test src/infrastructure/adapters/__tests__/SupabaseSimulationRepository.test.ts`
**Commit:** `feat(infrastructure): add SupabaseSimulationRepository adapter`

---

### Task 3.2: Create SupabasePersonaRepository adapter
**File:** `src/infrastructure/adapters/SupabasePersonaRepository.ts` (create)
**Test:** `src/infrastructure/adapters/__tests__/SupabasePersonaRepository.test.ts` (create)
**Depends:** 1.2, 2.3, 2.4

**Change:** Implement `PersonaRepositoryPort` using Supabase client:

- `createBatch(batch)` — inserts into `persona_batches`
- `findBatchById(id)` — `select('*, personas(*)').eq('id', id).single()`
- `findBatchesByUser(userId)` — `select('*').eq('user_id', userId).order('created_at', { ascending: false })`
- `createPersonas(batchId, personas)` — bulk insert into `personas` with `batch_id` set
- `deleteBatch(id)` — deletes batch (cascades to personas)

Mapper functions for `PersonaBatch` ↔ Supabase rows.

**Test:** Unit tests with mocked Supabase client.

**Verify:** `bun test src/infrastructure/adapters/__tests__/SupabasePersonaRepository.test.ts`
**Commit:** `feat(infrastructure): add SupabasePersonaRepository adapter`

---

### Task 3.3: Create SupabaseScreenshotStorage adapter
**File:** `src/infrastructure/adapters/SupabaseScreenshotStorage.ts` (create)
**Test:** `src/infrastructure/adapters/__tests__/SupabaseScreenshotStorage.test.ts` (create)
**Depends:** 1.2, 2.4

**Change:** Implement `ScreenshotStoragePort` using Supabase Storage:

- `upload(userId, simulationId, filename, base64)` — converts base64 → `Uint8Array`, uploads to `screenshots` bucket at path `{userId}/{simulationId}/{filename}`, returns the storage URL via `supabase.storage.from('screenshots').getPublicUrl()` (or signed URL if bucket is private)
- `delete(path)` — `supabase.storage.from('screenshots').remove([path])`

Handle path construction and error cases.

**Test:** Unit tests with mocked Supabase client.

**Verify:** `bun test src/infrastructure/adapters/__tests__/SupabaseScreenshotStorage.test.ts`
**Commit:** `feat(infrastructure): add SupabaseScreenshotStorage adapter`

---

## Batch 4: Use Cases (parallel — 6 implementers)

All tasks in this batch depend on Batch 2 + Batch 3 completing.

### Task 4.1: Create CreateSimulationUseCase
**File:** `src/application/usecases/CreateSimulationUseCase.ts` (create)
**Test:** `src/application/usecases/__tests__/CreateSimulationUseCase.test.ts` (create)
**Depends:** 2.1, 2.4, 3.1

**Change:** Implement the create simulation orchestration:

```ts
class CreateSimulationUseCase {
  constructor(
    private simRepo: SimulationRepositoryPort,
    private personaRepo: PersonaRepositoryPort
  ) {}

  async execute(input: { userId: string; url: string; batchId?: string; name?: string }): Promise<Simulation>
}
```

Logic:
1. Validate URL (non-empty, parseable)
2. If `batchId` provided, verify batch exists and belongs to user via `personaRepo.findBatchById`
3. Generate name via `generateSimulationName(url, batchName)`
4. Create simulation with `status: 'QUEUED'`
5. Return created simulation

**Test:** Mock both ports. Test happy path, invalid URL, missing batch.

**Verify:** `bun test src/application/usecases/__tests__/CreateSimulationUseCase.test.ts`
**Commit:** `feat(application): add CreateSimulationUseCase`

---

### Task 4.2: Create ListSimulationsUseCase + GetSimulationUseCase
**File:** `src/application/usecases/ListSimulationsUseCase.ts` (create)
**File:** `src/application/usecases/GetSimulationUseCase.ts` (create)
**Test:** `src/application/usecases/__tests__/ListSimulationsUseCase.test.ts` (create)
**Test:** `src/application/usecases/__tests__/GetSimulationUseCase.test.ts` (create)
**Depends:** 2.1, 2.4, 3.1

**Change:**

**ListSimulationsUseCase** — takes `{ userId: string }`, calls `simRepo.findByUser(userId)`, returns `Simulation[]`.

**GetSimulationUseCase** — takes `{ simulationId: string, userId: string }`, calls `simRepo.findById(simulationId)`, verifies ownership (`simulation.userId === userId`), returns enriched simulation with analyses.

**Test:** Mock `SimulationRepositoryPort`. Test list returns correct simulations, get returns enriched simulation, get rejects wrong userId.

**Verify:** `bun test src/application/usecases/__tests__/ListSimulationsUseCase.test.ts src/application/usecases/__tests__/GetSimulationUseCase.test.ts`
**Commit:** `feat(application): add ListSimulationsUseCase and GetSimulationUseCase`

---

### Task 4.3: Create DeleteSimulationUseCase + CancelSimulationUseCase
**File:** `src/application/usecases/DeleteSimulationUseCase.ts` (create)
**File:** `src/application/usecases/CancelSimulationUseCase.ts` (create)
**Test:** `src/application/usecases/__tests__/DeleteSimulationUseCase.test.ts` (create)
**Test:** `src/application/usecases/__tests__/CancelSimulationUseCase.test.ts` (create)
**Depends:** 2.1, 2.4, 3.1, 3.3

**Change:**

**DeleteSimulationUseCase** — takes `{ simulationId: string, userId: string }`:
1. Fetch simulation, verify ownership
2. Delete screenshots via `ScreenshotStoragePort.delete()` for each analysis screenshot
3. Delete simulation via `SimulationRepositoryPort.delete()` (cascades to analyses)
4. Return `{ success: true }`

**CancelSimulationUseCase** — takes `{ simulationId: string, userId: string }`:
1. Fetch simulation, verify ownership
2. Verify status is cancellable (`QUEUED`, `STARTING`, `RUNNING`, `ANALYZING`)
3. Update status to `CANCELLED` via `SimulationRepositoryPort.update()`
4. Return updated simulation

**Test:** Mock ports. Test delete verifies ownership, cancel checks status, both reject wrong userId.

**Verify:** `bun test src/application/usecases/__tests__/DeleteSimulationUseCase.test.ts src/application/usecases/__tests__/CancelSimulationUseCase.test.ts`
**Commit:** `feat(application): add DeleteSimulationUseCase and CancelSimulationUseCase`

---

### Task 4.4: Create RunSimulationUseCase
**File:** `src/application/usecases/RunSimulationUseCase.ts` (create)
**Test:** `src/application/usecases/__tests__/RunSimulationUseCase.test.ts` (create)
**Depends:** 2.1, 2.4, 3.1

**Change:** Implement the run simulation orchestration:

```ts
class RunSimulationUseCase {
  constructor(
    private simRepo: SimulationRepositoryPort,
    private personaRepo: PersonaRepositoryPort,
    private vpsClient: VpsClientPort  // thin port for calling VPS
  ) {}

  async execute(input: { simulationId: string; userId: string }): Promise<{ simulationId: string }>
}
```

Logic:
1. Fetch simulation, verify ownership
2. Fetch personas from batch (if batchId set)
3. Update simulation status to `STARTING`
4. Call VPS via `vpsClient.startAnalysis(simulationId, url, personas)` — fire and forget (VPS writes results directly to Supabase)
5. Return `{ simulationId }`

Note: A new `VpsClientPort` is needed (simple interface with `startAnalysis()` method). The VPS client adapter will implement this by calling the existing VPS API routes.

**Test:** Mock all three ports. Test happy path, missing simulation, VPS call failure.

**Verify:** `bun test src/application/usecases/__tests__/RunSimulationUseCase.test.ts`
**Commit:** `feat(application): add RunSimulationUseCase`

---

### Task 4.5: Create CreatePersonaBatchUseCase
**File:** `src/application/usecases/CreatePersonaBatchUseCase.ts` (create)
**Test:** `src/application/usecases/__tests__/CreatePersonaBatchUseCase.test.ts` (create)
**Depends:** 2.3, 2.4, 3.2

**Change:** Implement persona batch creation:

```ts
class CreatePersonaBatchUseCase {
  constructor(private personaRepo: PersonaRepositoryPort) {}

  async execute(input: { userId: string; name: string; source: 'manual' | 'Interview'; personas: Persona[] }): Promise<PersonaBatch>
}
```

Logic:
1. Create batch with `status: 'COMPLETED'` (manual creation is instant)
2. Create personas within batch
3. Return batch with personas

**Test:** Mock `PersonaRepositoryPort`. Test creates batch + personas.

**Verify:** `bun test src/application/usecases/__tests__/CreatePersonaBatchUseCase.test.ts`
**Commit:** `feat(application): add CreatePersonaBatchUseCase`

---

### Task 4.6: Create VpsClientPort
**File:** `src/domain/ports/VpsClientPort.ts` (create)
**Test:** none (interface only)
**Depends:** none (can run in parallel with Batch 2)

**Change:** Define a simple port for VPS communication:

```ts
interface VpsClientPort {
  startAnalysis(simulationId: string, url: string, personas: Persona[]): Promise<{ runId: string }>
  cancelAnalysis(runId: string): Promise<void>
}
```

Also create `src/infrastructure/adapters/VpsClientAdapter.ts` that implements this port by calling the existing VPS API routes (`/api/vps/analyze-pricing`) with the auth token.

**Test:** none for port, mock test for adapter
**Commit:** `feat(domain): add VpsClientPort and VpsClientAdapter`

---

## Batch 5: Server Actions + Auth Middleware (parallel — 3 implementers)

All tasks in this batch depend on Batch 3 + Batch 4 completing.

### Task 5.1: Create new simulation server actions
**File:** `src/actions/createSimulationAction.ts` (create)
**File:** `src/actions/listSimulationsAction.ts` (create)
**File:** `src/actions/getSimulationAction.ts` (create)
**File:** `src/actions/deleteSimulationAction.ts` (create)
**File:** `src/actions/cancelSimulationAction.ts` (create)
**File:** `src/actions/runSimulationAction.ts` (create)
**File:** `src/actions/createPersonaBatchAction.ts` (create)
**Test:** none (thin wrappers, verified by E2E)
**Depends:** 3.1, 3.2, 3.3, 4.1–4.5

**Change:** Create thin server action wrappers following the existing pattern (see `src/actions/analyzePricingPage.ts` for reference). Each action:

1. Starts with `'use server'`
2. Calls `requireAuth()` to get `userId`
3. Instantiates the correct use case with concrete adapters
4. Calls `useCase.execute(input)`
5. Returns the result (serializable)

Example structure:

```ts
'use server'
import { requireAuth } from '@/infrastructure/auth'
import { CreateSimulationUseCase } from '@/application/usecases/CreateSimulationUseCase'
import { SupabaseSimulationRepository } from '@/infrastructure/adapters/SupabaseSimulationRepository'
import { SupabasePersonaRepository } from '@/infrastructure/adapters/SupabasePersonaRepository'

export async function createSimulationAction(url: string, batchId?: string) {
  const { userId } = await requireAuth()
  const useCase = new CreateSimulationUseCase(
    new SupabaseSimulationRepository(),
    new SupabasePersonaRepository()
  )
  return useCase.execute({ userId, url, batchId })
}
```

No business logic in any action. Each is 10-20 lines.

**Verify:** `bunx tsc --noEmit` compiles
**Commit:** `feat(actions): add Supabase-backed server actions`

---

### Task 5.2: Modify existing server actions to route through use cases
**File:** `src/actions/analyzePricingPage.ts` (modify)
**File:** `src/actions/generatePersonas.ts` (modify)
**File:** `src/actions/generatePersonasFromInterviews.ts` (modify)
**File:** `src/actions/cancelRequest.ts` (modify)
**Test:** existing tests still pass
**Depends:** 4.4, 4.6

**Change:** Modify existing server actions to:

1. For `analyzePricingPage.ts`: Instead of writing to `simulationResultStore` / `progressStore` / `screenshotStore`, the `runRemote` path stays the same (calls VPS). But the `runLocally` path now writes to Supabase via the adapters instead of in-memory stores. The VPS `runAnalysis` path also writes to Supabase.

2. For `cancelRequest.ts`: Add a `cancelSimulationAction` that updates the simulation status in Supabase (so the VPS can check it). The existing `cancelRequestAction` stays for backward compatibility.

3. For `generatePersonas.ts` and `generatePersonasFromInterviews.ts`: Route through `CreatePersonaBatchUseCase` instead of directly calling VPS + in-memory stores.

Key principle: The in-memory stores (`simulationResultStore`, `progressStore`, `screenshotStore`) are replaced by Supabase reads. But during the transition, keep them as fallback until the VPS side is also migrated.

**Verify:** `bun test` (existing tests pass)
**Commit:** `refactor(actions): route existing actions through use cases`

---

### Task 5.3: Add auth UI (sign-in/sign-out components)
**File:** `src/ui/components/auth/SignInButton.tsx` (create)
**File:** `src/ui/components/auth/SignOutButton.tsx` (create)
**File:** `src/ui/stores/authStore.ts` (create)
**Test:** none (UI components, verified by visual inspection)
**Depends:** 1.2, 1.3

**Change:**

**authStore.ts** — Zustand store that holds the current Supabase user session. On mount, calls `supabase.auth.getSession()` to check for existing session. Exposes `user`, `loading`, `signInWithGoogle()`, `signOut()`.

**SignInButton.tsx** — Button that calls `supabase.auth.signInWithOAuth({ provider: 'google' })`. Shows "Sign in with Google" or a Google icon. Uses shadcn Button component.

**SignOutButton.tsx** — Button that calls `supabase.auth.signOut()`. Shows "Sign out".

These are client components that use the Supabase browser client (created with `createBrowserClient()` from `@supabase/ssr`).

**Verify:** Components render, TypeScript compiles
**Commit:** `feat(ui): add Google OAuth sign-in/sign-out components`

---

## Batch 6: VPS Integration (parallel — 5 implementers)

All tasks in this batch depend on Batch 3 + Batch 4 completing.

### Task 6.1: Add Supabase client to VPS config
**File:** `src/infrastructure/supabase.ts` (modify)
**Test:** none (config)
**Depends:** 1.1

**Change:** Ensure `createSupabaseServiceClient()` works on the VPS. The VPS standalone build reads env vars from `ecosystem.config.js`, not `.env`. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the VPS env vars documentation in `docs/VPS_DEPLOYMENT.md`.

**Verify:** TypeScript compiles, env vars documented
**Commit:** `feat(infrastructure): configure Supabase service client for VPS`

---

### Task 6.2: Modify VPS analyze-pricing route to write to Supabase
**File:** `src/app/api/vps/analyze-pricing/route.ts` (modify)
**Test:** `src/app/api/vps/analyze-pricing/__tests__/route.test.ts` (update)
**Depends:** 3.1, 3.3

**Change:** Modify the `runAnalysis` function to:

1. Create Supabase service-role client
2. Create `SupabaseSimulationRepository` + `SupabaseScreenshotStorage` with that client
3. Replace `simulationResultStore.save(id, analyses)` with `simRepo.upsertAnalysis(...)` for each analysis
4. Replace `storeProgress(id, {...})` with `simRepo.updateProgress(id, step, completed, total)`
5. Replace `storeScreenshot(id, base64)` with `screenshotStorage.upload(...)` (only for final screenshots, not progress screenshots)
6. Add heartbeat writes: `simRepo.updateProgress(id, step, completed, total)` includes `last_heartbeat = now()`

Keep the existing in-memory stores as fallback during transition (write to both Supabase AND in-memory).

**Test:** Update existing tests to verify Supabase adapter calls.

**Verify:** `bun test src/app/api/vps/analyze-pricing/__tests__/route.test.ts`
**Commit:** `feat(vps): write analysis results to Supabase`

---

### Task 6.3: Add heartbeat mechanism to VPS
**File:** `src/app/api/vps/analyze-pricing/route.ts` (modify, same as 6.2 but different concern)
**Test:** inline in route test
**Depends:** 6.2

**Change:** Add a heartbeat interval (every 10 seconds) during the analysis IIFE:

```ts
const heartbeat = setInterval(() => {
  simRepo.updateProgress(id, currentStep, completedCount, totalCount)
}, 10_000)
```

Clear the interval in `finally` block. This writes `last_heartbeat` to Supabase so stale jobs can be detected.

Also add a check at the start of the IIFE: read `simulations.status` — if `CANCELLED`, return early.

**Verify:** TypeScript compiles, heartbeat interval is cleared in finally
**Commit:** `feat(vps): add heartbeat and cancellation check`

---

### Task 6.4: Add Supabase to other VPS routes
**File:** `src/app/api/vps/generate-personas/route.ts` (modify)
**File:** `src/app/api/vps/generate-personas-from-interviews/route.ts` (modify)
**Test:** update existing route tests
**Depends:** 3.2

**Change:** Similar to Task 6.2 — modify persona generation routes to write to Supabase via `SupabasePersonaRepository` instead of `PersonaGenerationStore` in-memory store.

Keep the in-memory `PersonaGenerationStore` as fallback during transition.

**Verify:** `bun test` (existing tests pass)
**Commit:** `feat(vps): write persona generation results to Supabase`

---

### Task 6.5: Create stale heartbeat detector
**File:** `src/infrastructure/services/staleJobDetector.ts` (create)
**Test:** `src/infrastructure/services/__tests__/staleJobDetector.test.ts` (create)
**Depends:** 3.1

**Change:** Create a service that detects stale simulations:

```ts
async function detectStaleSimulations(supabase: SupabaseClient): Promise<string[]> {
  // Find simulations where:
  // - status IN ('STARTING', 'RUNNING', 'ANALYZING')
  // - last_heartbeat < now() - interval '60 seconds'
  // Returns list of stale simulation IDs
}

async function markStaleAsFailed(supabase: SupabaseClient, simulationId: string): Promise<void> {
  // Update status to 'FAILED', set error = 'VPS heartbeat timeout'
}
```

This can be called from a Supabase Edge Function (cron) or from a server action on page load (check if the simulation the user is viewing is stale).

**Test:** Mock Supabase client, verify query logic.

**Verify:** `bun test src/infrastructure/services/__tests__/staleJobDetector.test.ts`
**Commit:** `feat(infrastructure): add stale job detection service`

---

## Batch 7: Client-Side Migration (parallel — 4 implementers)

All tasks in this batch depend on Batch 5 completing.

### Task 7.1: Update simulationStore for Supabase-first reads
**File:** `src/ui/stores/simulationStore.ts` (modify)
**Test:** `src/ui/stores/__tests__/simulationStore.test.ts` (create or update)
**Depends:** 5.1

**Change:** Overhaul the simulation store:

1. **Hydration:** On store init, call `listSimulationsAction()` to fetch from Supabase. If Supabase fetch fails, fall back to IndexedDB cache (the `persist` middleware still works).

2. **Writes:** After any server action completes successfully, update both the Zustand state AND the IndexedDB cache (via `persist` middleware).

3. **Remove base64 handling:** The `partialize` function no longer needs to strip `screenshotBase64` from analyses — screenshots are now URLs, not inline base64.

4. **Realtime subscription:** Add a method to subscribe to Supabase realtime updates for a specific simulation (used on the simulation detail page).

Key change: The store's `addSimulation` method now calls the server action first, then updates local state on success. The old flow (create locally, sync later) is reversed.

**Verify:** `bun test src/ui/stores/__tests__/simulationStore.test.ts`
**Commit:** `feat(ui): update simulationStore for Supabase-first persistence`

---

### Task 7.2: Add Supabase realtime subscriptions
**File:** `src/ui/hooks/useSimulationRealtime.ts` (create)
**Test:** `src/ui/hooks/__tests__/useSimulationRealtime.test.ts` (create)
**Depends:** 1.2

**Change:** Create a React hook that subscribes to Supabase Postgres Changes for a simulation:

```ts
function useSimulationRealtime(simulationId: string | null) {
  // Subscribes to `simulations` table UPDATE events filtered by simulationId
  // On update: calls `simulationStore.updateSimulation(id, payload.new)`
  // Cleanup: unsubscribes on unmount
}
```

This replaces the current 2-second polling interval. The hook uses `supabase.channel()` with `postgres_changes`.

**Test:** Mock Supabase client, verify subscription setup and cleanup.

**Verify:** `bun test src/ui/hooks/__tests__/useSimulationRealtime.test.ts`
**Commit:** `feat(ui): add Supabase realtime subscription hook`

---

### Task 7.3: Create auth context/provider
**File:** `src/ui/providers/AuthProvider.tsx` (create)
**Test:** none (UI provider, verified by integration)
**Depends:** 5.3

**Change:** Create a React context provider that:

1. On mount, checks `supabase.auth.getSession()` for existing session
2. Listens to `supabase.auth.onAuthStateChange()` for session updates
3. Exposes `{ user, loading, session }` to child components
4. Wraps the app layout

Update `src/app/layout.tsx` to wrap with `<AuthProvider>`.

**Verify:** TypeScript compiles, app renders with provider
**Commit:** `feat(ui): add AuthProvider for session management`

---

### Task 7.4: Update userStore to use Supabase Auth
**File:** `src/ui/stores/userStore.ts` (modify)
**Test:** existing tests (update if needed)
**Depends:** 5.3, 7.3

**Change:** Replace the existing `userStore` (which uses `BrowserDatabaseService` + local `RegisterUserUseCase` / `LoginUserUseCase`) with Supabase Auth:

1. Remove local registration/login logic
2. Add `signInWithGoogle()` that calls `supabase.auth.signInWithOAuth({ provider: 'google' })`
3. Add `signOut()` that calls `supabase.auth.signOut()`
4. The `user` state is now populated from `AuthProvider`'s session, not from local DB
5. Remove the `persist` middleware — auth state comes from Supabase cookies, not localStorage

**Verify:** `bun test` (existing tests pass, userStore compiles)
**Commit:** `refactor(ui): replace userStore with Supabase Auth`

---

## Batch 8: Cleanup + Final Wiring (1 implementer)

### Task 8.1: Remove in-memory stores + final cleanup
**File:** `src/infrastructure/SimulationResultStore.ts` (delete or deprecate)
**File:** `src/infrastructure/progressStore.ts` (delete or deprecate)
**File:** `src/infrastructure/screenshotStore.ts` (delete or deprecate)
**File:** `src/infrastructure/PersonaGenerationStore.ts` (delete or deprecate)
**File:** `src/infrastructure/RequestCancellationManager.ts` (modify — keep for now, used by non-simulation routes)
**Test:** `bun test` (all tests pass)
**Depends:** 6.2, 6.3, 6.4, 7.1, 7.2

**Change:** 

Once the VPS routes are verified to write to Supabase successfully:

1. Remove `SimulationResultStore.ts` — replaced by `SupabaseSimulationRepository.upsertAnalysis()`
2. Remove `progressStore.ts` — replaced by `SupabaseSimulationRepository.updateProgress()`
3. Remove `screenshotStore.ts` — replaced by `SupabaseScreenshotStorage.upload()`
4. Deprecate `PersonaGenerationStore.ts` — keep as fallback until persona generation is fully migrated
5. Clean up imports in `analyzePricingPage.ts` and VPS routes
6. Update `docs/VPS_DEPLOYMENT.md` to document new Supabase env vars
7. Update `ARCHITECTURE.md` to reference the new ports/adapters

**Verify:** `bun test` (all tests pass), `bun run build` succeeds
**Commit:** `chore: remove in-memory stores, complete Supabase migration`

---

## Environment Variables Summary

### Netlify (add to Netlify dashboard)
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client-side accessible) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-side accessible) |
| `SUPABASE_URL` | Same as above, but server-side only |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only, never exposed to client) |

### VPS (add to `ecosystem.config.js`)
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS for VPS writes |

---

## Migration Notes

- **Clean slate:** No data migration from IndexedDB. Users start fresh with Supabase accounts.
- **Backward compatibility:** During transition, in-memory stores are kept as fallback. They are removed in Batch 8 after verification.
- **Existing simulations:** Users with existing IndexedDB simulations can still see them until they clear browser data or sign in (which resets the store).

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Supabase free tier limits (500MB DB, 1GB storage) | Monitor usage; plan for paid tier if needed |
| VPS can't reach Supabase | VPS and Supabase should be in same region; add retry logic |
| Auth session expiry | Supabase client auto-refreshes; add re-auth prompt |
| Realtime subscription performance | Use filtered subscriptions (by simulation ID), not global |
| In-memory store removal breaks things | Keep as fallback until Batch 8 verification passes |
