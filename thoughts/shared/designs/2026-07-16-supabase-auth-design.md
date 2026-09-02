---
date: 2026-07-16
topic: "Supabase + Auth: Cloud Persistence & Multi-Device Access"
status: draft
---

## Problem Statement

Kynd currently stores all simulation data in browser localStorage/IndexedDB. This creates three problems:

1. **No multi-device access** — simulations are locked to the browser that created them
2. **No data safety** — clearing browser data loses everything
3. **Lifecycle tied to browser** — if the user closes the tab during a simulation, progress is lost on refresh (the VPS keeps running, but the browser has no way to reconnect)

The IndexedDB migration (completed) solves the storage quota issue, but not the fundamental limitation: **data lives in the browser, not in the cloud**.

## Key Insight

> **A simulation's lifecycle must be independent of any browser session.**

A simulation isn't just a document — it's a **durable job**. The user configures it, sends it to the VPS for processing, and expects to see results whenever they come back — on any device, at any time. The browser should be a *consumer* of simulation state, not the *owner*.

This principle drives every architectural decision below.

## Goals

- Simulations persist in the cloud (Supabase) as the source of truth
- Users authenticate via Google OAuth (frictionless, near-zero signup cost)
- Simulation lifecycle is browser-independent (close tab, come back later, see results)
- Multi-device access works out of the box
- IndexedDB remains as a read cache for fast reloads
- VPS writes results directly to Supabase (no in-memory intermediate stores)

## Non-Goals

- Offline-first sync engine (two-way sync between IndexedDB and Supabase)
- Anonymous/pseudonymous usage (auth is required to save simulations)
- Organization/team features (schema leaves room, but not building now)
- Real-time collaboration on simulations
- Migration of existing localStorage data (users start fresh with their account)

## Constraints

- Must work with the existing Netlify + VPS dual-deployment architecture
- Must follow the project's hexagonal architecture (ports & adapters)
- VPS must be able to write to Supabase directly (service role key)
- Supabase free tier limits: 500MB database, 1GB file storage, 500MB bandwidth
- Auth must feel like "Continue with Google" — no passwords, no friction
- Schema must be extensible for future features (orgs, teams, sharing)

## Approach

### Auth: Google OAuth via Supabase Auth

**Why Google OAuth (not magic links, not passwords):**
- Zero-friction signup — one click, done
- Users already expect this pattern from productivity tools (Figma, Notion, Linear)
- No password reset flows, no email verification, no credential management
- Magic links as fallback for users without Google accounts

**Auth flow:**

```
User lands on app (browses freely, no auth required)
    ↓
Clicks "Run Simulation"
    ↓
"Sign in to save your work" → Google OAuth popup
    ↓
Supabase creates/returns user session
    ↓
Simulation runs → saves to Supabase → caches in IndexedDB
    ↓
Next visit: auto-sign-in via Supabase session cookie
```

The auth gate is on **saving**, not on **using**. Users can browse the app, configure simulations, and explore without an account. The moment they want to persist something, they sign in.

### Storage: Supabase as Source of Truth, IndexedDB as Cache

```
User creates simulation
    ↓
Server action (thin wrapper) → Use Case (orchestrator) → SimulationRepositoryPort → SupabaseAdapter
    ↓
Supabase row created → returns simulation object
    ↓
Zustand store holds in memory (UI rendering)
    ↓
IndexedDB caches (fast reload, offline viewing)
    ↓
On page load: Supabase → IndexedDB fallback
```

### Job Lifecycle: Browser-Independent

```
User clicks "Run" → use case creates simulation row (status=PENDING) in Supabase
    ↓
Use case calls VPS via server action → VPS starts processing
    ↓
VPS writes progress directly to Supabase (via Supabase adapter with service role key)
    ↓
Browser can disappear entirely
    ↓
VPS writes analyses + screenshots to Supabase
    ↓
Simulation status = COMPLETED
    ↓
User comes back (any device) → reads from Supabase → sees completed simulation
```

## Architecture: Hexagonal Integration

This is how Supabase fits into the existing hexagonal architecture.

### Communication Flow

```
UI Components
    ↓
Server Actions (thin wrappers — instantiate deps, call use case)
    ↓
Use Cases (orchestrate domain logic through ports)
    ↓
Ports (interfaces in domain layer)
    ↓
Adapters (Supabase implementations in infrastructure layer)
    ↓
Supabase (auth, database, storage)
```

**Server actions are thin wrappers.** They never contain business logic, never write to databases directly, and never call adapters. They instantiate use cases with the correct adapters and invoke them.

**Use cases are orchestrators.** They take ports as constructor dependencies, validate inputs, coordinate domain entities, and call ports to persist/read data. They have no knowledge of Supabase, localStorage, or any infrastructure.

**Adapters implement ports.** They translate between the domain and external systems (Supabase, VPS API, etc.). They contain no business logic.

### What the VPS Does

The VPS is a separate deployment with its own codebase. It does **not** use the same use case layer as Netlify. Instead:

```
VPS API Route → VPS-specific adapters → Supabase (service role key)
```

The VPS writes directly to Supabase using adapters that bypass RLS (via `service_role` key). It doesn't go through use cases because the VPS is a **worker**, not an application layer — it receives a job, does Playwright work, and writes results.

### Dependency Wiring

Server actions wire everything together at the edge:

```ts
// actions/createSimulation.ts (thin wrapper)
'use server'

export async function createSimulationAction(url: string, batchId: string) {
  const userId = await requireAuth()  // Supabase Auth
  const useCase = new CreateSimulationUseCase(
    new SupabaseSimulationRepository(),  // adapter
    new SupabasePersonaRepository()       // adapter
  )
  return useCase.execute({ userId, url, batchId })
}
```

The use case doesn't know about `SupabaseSimulationRepository` — it only knows `SimulationRepositoryPort`. The server action wires the concrete adapter.

## Schema Design

### Tables

```sql
-- Managed by Supabase Auth, extended with app-specific fields
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Reusable across simulations
CREATE TABLE personas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  traits      JSONB NOT NULL,           -- Big Five (OCEAN), psychographics, pricing calibration
  source      TEXT NOT NULL,            -- 'manual' | 'interview' | 'generated'
  batch_id    UUID,                     -- nullable: not all personas come from batches
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Groups of personas (manual or interview-generated)
CREATE TABLE persona_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  source      TEXT NOT NULL,            -- 'manual' | 'interview'

  -- Job lifecycle (relevant for interview-generated batches)
  status          TEXT DEFAULT 'COMPLETED',  -- PENDING | RUNNING | COMPLETED | FAILED
  progress_step   TEXT,
  completed_count INT,
  total_count     INT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  last_heartbeat  TIMESTAMPTZ,

  created_at  TIMESTAMPTZ DEFAULT now()
);

-- The core entity: a simulation run
CREATE TABLE simulations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  batch_id        UUID REFERENCES persona_batches(id) ON DELETE SET NULL,

  -- Job lifecycle
  status          TEXT NOT NULL DEFAULT 'QUEUED',  -- QUEUED | STARTING | RUNNING | ANALYZING | COMPLETED | FAILED | CANCELLED
  progress_step   TEXT,                             -- OPENING_PAGE | FINDING_PRICING | THINKING
  completed_count INT DEFAULT 0,
  total_count     INT DEFAULT 0,
  error           TEXT,

  -- Final artifacts
  screenshot_url  TEXT,              -- viewport screenshot (Supabase Storage URL)

  -- Timestamps
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  last_heartbeat  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- One per persona per simulation
CREATE TABLE analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id   UUID REFERENCES simulations(id) ON DELETE CASCADE NOT NULL,
  persona_id      UUID REFERENCES personas(id) ON DELETE SET NULL,

  -- Snapshot of persona at time of analysis (reproducibility)
  persona_snapshot JSONB NOT NULL,

  -- Results
  scores          JSONB NOT NULL,
  risks           TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  suggestion      TEXT,
  gaze_points     JSONB,

  -- Artifacts
  screenshot_url  TEXT,              -- per-analysis screenshot (Supabase Storage URL)

  created_at      TIMESTAMPTZ DEFAULT now(),

  -- Each persona is analyzed exactly once per simulation
  UNIQUE (simulation_id, persona_id)
);
```

### Indexes

```sql
CREATE INDEX idx_simulations_user_id ON simulations(user_id);
CREATE INDEX idx_simulations_status ON simulations(status);
CREATE INDEX idx_simulations_user_status ON simulations(user_id, status);
CREATE INDEX idx_analyses_simulation_id ON analyses(simulation_id);
CREATE INDEX idx_persona_batches_user_id ON persona_batches(user_id);
CREATE INDEX idx_personas_user_id ON personas(user_id);
CREATE INDEX idx_personas_batch_id ON personas(batch_id);
```

### Row Level Security

Every table gets RLS policies. Users can only read/write their own data:

```sql
-- Simulations
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own simulations"
  ON simulations FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create own simulations"
  ON simulations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own simulations"
  ON simulations FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own simulations"
  ON simulations FOR DELETE
  USING (auth.uid() = user_id);

-- Similar policies for analyses, personas, persona_batches
-- (analyses policy joins through simulations to check user_id)
```

**VPS bypass:** The VPS uses the `service_role` key, which bypasses RLS. This is necessary because the VPS writes progress/results but doesn't have a user session.

### Storage Buckets

```sql
-- Screenshots bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', false);

-- RLS: users can only access their own screenshots
-- Path convention: {user_id}/{simulation_id}/{filename}
```

## Domain Ports (New)

Three ports, mapping to three business concepts: simulations (with analyses), personas (with batches), and screenshots (files).

```ts
// src/domain/ports/SimulationRepositoryPort.ts
// Simulations own analyses — one aggregate. You never create an analysis without a simulation.
interface SimulationRepositoryPort {
  create(simulation: Simulation): Promise<Simulation>
  findById(id: string): Promise<Simulation>          // includes analyses
  findByUser(userId: string): Promise<Simulation[]>
  update(id: string, updates: Partial<Simulation>): Promise<void>
  updateProgress(id: string, step: string, completed: number, total: number): Promise<void>
  upsertAnalysis(analysis: PricingAnalysis): Promise<void>  // idempotent via UNIQUE constraint
  delete(id: string): Promise<void>                  // cascades to analyses
}

// src/domain/ports/PersonaRepositoryPort.ts
// Persona batches own personas — one aggregate.
interface PersonaRepositoryPort {
  createBatch(batch: PersonaBatch): Promise<PersonaBatch>
  findBatchById(id: string): Promise<PersonaBatch>   // includes personas
  findBatchesByUser(userId: string): Promise<PersonaBatch[]>
  createPersonas(batchId: string, personas: Persona[]): Promise<void>
  deleteBatch(id: string): Promise<void>             // cascades to personas
}

// src/domain/ports/ScreenshotStoragePort.ts
// Separate port because it's binary file storage (Supabase Storage),
// not database rows. Different infrastructure concern.
interface ScreenshotStoragePort {
  upload(userId: string, simulationId: string, filename: string, base64: string): Promise<string>  // returns URL
  delete(path: string): Promise<void>
}
```

## Infrastructure Adapters (New)

Three adapters implementing the three ports:

```ts
// src/infrastructure/adapters/SupabaseSimulationRepository.ts
// Implements SimulationRepositoryPort
// - create/findById/findByUser/update/delete → standard DB operations
// - updateProgress → updates status, progress_step, completed_count, last_heartbeat
// - upsertAnalysis → uses Supabase upsert with UNIQUE(simulation_id, persona_id)

// src/infrastructure/adapters/SupabasePersonaRepository.ts
// Implements PersonaRepositoryPort
// - Batch CRUD + persona creation within a batch

// src/infrastructure/adapters/SupabaseScreenshotStorage.ts
// Implements ScreenshotStoragePort
// - upload → stores binary in Supabase Storage bucket, returns public URL
// - delete → removes from Storage bucket
```

## Use Cases (New/Modified)

Orchestrate workflows through the three ports:

```ts
// src/application/usecases/CreateSimulationUseCase.ts
// Orchestrates: validate input → create simulation row → return simulation
// Ports: SimulationRepositoryPort, PersonaRepositoryPort

// src/application/usecases/RunSimulationUseCase.ts
// Orchestrates: create simulation → call VPS (fire and forget) → return runId
// Ports: SimulationRepositoryPort, PersonaRepositoryPort
// Note: does NOT write results — VPS writes progress/results directly to Supabase

// src/application/usecases/ListSimulationsUseCase.ts
// Orchestrates: fetch simulations for user → return list
// Ports: SimulationRepositoryPort

// src/application/usecases/GetSimulationUseCase.ts
// Orchestrates: fetch simulation + analyses → return enriched simulation
// Ports: SimulationRepositoryPort

// src/application/usecases/DeleteSimulationUseCase.ts
// Orchestrates: validate ownership → delete screenshots → delete simulation (cascades)
// Ports: SimulationRepositoryPort, ScreenshotStoragePort

// src/application/usecases/CreatePersonaBatchUseCase.ts
// Orchestrates: create batch → create personas → return batch
// Ports: PersonaRepositoryPort
```

## VPS Integration

### What Changes on the VPS

Today the VPS writes to in-memory Maps. It needs to write to Supabase via adapters:

| Current (in-memory) | New (Supabase adapter) |
|---|---|
| `progressStore.set(runId, {...})` | `SimulationRepositoryPort.updateProgress(...)` |
| `simulationResultStore.set(runId, analyses)` | `SimulationRepositoryPort.upsertAnalysis(...)` |
| `screenshotStore.set(runId, base64)` | `ScreenshotStoragePort.upload(...)` |

The VPS uses the same adapter implementations as the Netlify side, but instantiated with a Supabase client using the `service_role` key (bypasses RLS).

### New Dependencies

- `@supabase/supabase-js` — Supabase client for the VPS
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### Cancellation Flow

```
Browser: user clicks "Cancel"
    ↓
Server action → use case → SimulationRepositoryPort.update(status='CANCELLED')
    ↓
VPS: before each major step, reads simulations.status via SimulationRepositoryPort
    ↓
If status = 'CANCELLED' → stop processing, return early
```

The VPS reads `simulations.status` before each major step (opening page, finding pricing, analyzing per persona). This adds one DB read per step (~5-10 total), which is negligible.

### Error Recovery

If the VPS crashes mid-simulation:

1. `last_heartbeat` stops updating
2. A separate process (cron job or Supabase Edge Function) detects stale heartbeats (>60s)
3. Marks the simulation as `FAILED`
4. On retry, the VPS uses **upsert** on `analyses` — the `UNIQUE(simulation_id, persona_id)` constraint prevents duplicates

### Heartbeat

The VPS writes `last_heartbeat = now()` every 10 seconds during processing via `SimulationRepositoryPort.updateProgress()`. This serves two purposes:
- Detect crashed jobs (stale heartbeat = VPS died)
- UX: client can show "still processing" vs. "stale/unknown"

## Client-Side Changes

### Zustand Store Overhaul

The `simulationStore` needs to become **Supabase-first**:

1. **Writes** go to Supabase via server actions → use cases → adapters, then update local state
2. **Reads** check Supabase on hydration, fall back to IndexedDB cache
3. **IndexedDB** becomes a read-only cache, not a write target

```ts
// New flow:
// 1. Page loads → hydrate from Supabase (via server action → use case)
// 2. If offline → fall back to IndexedDB cache
// 3. Writes always go to Supabase first
// 4. After successful write → update IndexedDB cache
```

The Zustand `persist` middleware stays, but its role changes from "primary storage" to "offline cache."

### Realtime Subscriptions

Instead of polling, the client subscribes to simulation updates:

```ts
// On simulation detail page:
supabase
  .channel(`sim-${simulationId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'simulations',
    filter: `id=eq.${simulationId}`
  }, (payload) => {
    updateSimulation(payload.new)
  })
  .subscribe()
```

This replaces the current 2-second polling interval and gives instant updates when the VPS writes progress.

### Server Actions

New/modified server actions — all thin wrappers:

| Action | What it does |
|---|---|
| `createSimulationAction` | Instantiates `CreateSimulationUseCase`, calls `execute()` |
| `listSimulationsAction` | Instantiates `ListSimulationsUseCase`, calls `execute()` |
| `getSimulationAction` | Instantiates `GetSimulationUseCase`, calls `execute()` |
| `deleteSimulationAction` | Instantiates `DeleteSimulationUseCase`, calls `execute()` |
| `createPersonaBatchAction` | Instantiates `CreatePersonaBatchUseCase`, calls `execute()` |
| `runSimulationAction` | Instantiates `RunSimulationUseCase`, calls `execute()` (calls VPS) |
| `cancelSimulationAction` | Instantiates `CancelSimulationUseCase`, calls `execute()` |

**No business logic in server actions.** They only: (1) authenticate the user, (2) instantiate the use case with adapters, (3) call the use case, (4) return the result.

Existing actions (`analyzePricingPage`, `generatePersonasFromInterviews`) are modified to route through use cases instead of calling VPS directly.

## Migration Strategy

### Clean Slate

Users start fresh with their Supabase account. No data migration from IndexedDB.

**Why:**
- Existing simulations in IndexedDB have stripped screenshots (from the partialize change)
- The data model is changing (new fields, new relationships)
- Migration code adds complexity for a small user base
- Users can still see their old simulations if they don't clear browser data

### Future Migration (Optional)

If needed later, a migration flow could be built:

```
User signs in for first time
    ↓
Detect IndexedDB has simulations not in Supabase
    ↓
"Import your existing simulations?"
    ↓
Upload to Supabase (without screenshots, since those were stripped)
```

This is a nice-to-have, not a requirement for launch.

## Error Handling

| Failure | Handling |
|---|---|
| VPS crashes mid-simulation | Detect via stale heartbeat → mark FAILED → user can retry |
| Supabase write fails | Use case retries once → falls back to IndexedDB cache → shows error to user |
| VPS can't reach Supabase | VPS queues writes locally → retries on next heartbeat cycle |
| User cancels simulation | Use case updates status via port → VPS checks before each step |
| Duplicate analysis on retry | UNIQUE constraint + upsert prevents duplicates |
| Supabase auth session expires | Auto-refresh via Supabase client → re-authenticate if needed |

## Testing Strategy

- **Unit tests:** Use cases with mocked ports (test orchestration logic)
- **Integration tests:** Adapters against Supabase (test real DB operations)
- **VPS tests:** VPS adapters writing to Supabase (mock Supabase client)
- **E2E tests:** Full simulation lifecycle (create → run → see results after refresh)
- **Edge cases:** Cancellation during run, VPS crash recovery, concurrent simulations

## Phases

### Phase 1: Supabase Setup + Auth
- Create Supabase project
- Set up auth (Google OAuth + magic links)
- Create `profiles` table
- Add auth middleware to Next.js
- Add sign-in/sign-out UI
- Gate simulation creation behind auth

### Phase 2: Schema + Ports + Adapters
- Create `simulations`, `analyses`, `personas`, `persona_batches` tables
- Set up RLS policies
- Create Supabase Storage bucket for screenshots
- Set up indexes
- Create 3 domain ports (`SimulationRepositoryPort`, `PersonaRepositoryPort`, `ScreenshotStoragePort`)
- Implement 3 Supabase adapters

### Phase 3: Use Cases + Server Actions
- Create `CreateSimulationUseCase`, `ListSimulationsUseCase`, etc.
- Create thin server action wrappers
- Wire adapters to use cases in server actions
- Modify existing actions to route through use cases

### Phase 4: VPS Integration
- Add Supabase client to VPS
- Implement VPS adapters (same code, service role key)
- Modify VPS routes to write to Supabase instead of in-memory stores
- Implement heartbeat mechanism via `SimulationRepositoryPort.updateProgress()`
- Implement cancellation flow
- Add error recovery (stale heartbeat detection)

### Phase 5: Client-Side Migration
- Modify Zustand store to be Supabase-first
- Implement realtime subscriptions
- Keep IndexedDB as read cache
- Remove in-memory server-side stores (SimulationResultStore, progressStore, screenshotStore)

### Phase 6: Polish
- Add "Import from local" flow (optional, future)
- Optimize screenshot storage (final only, not progress)
- Add usage/credits tracking
- Monitor Supabase free tier limits

## Open Questions

1. **Supabase project region** — where to host? Closest to VPS (for low-latency writes) or closest to users (for low-latency reads)?
2. **Screenshot retention policy** — keep all screenshots forever, or expire after N days?
3. **Concurrent simulation limits** — should we cap how many simulations a user can run simultaneously?
4. **Supabase Edge Functions** — should heartbeat monitoring be a cron job or an Edge Function?
5. **Persona ownership** — should personas be global (shared across users) or per-user? Currently per-user, but shared personas could be a future feature.
