# E2E Test Guide

A practical guide to writing, running, and maintaining end-to-end tests for Kynd.

## Overview

DeepBound uses **Playwright** (via Vitest) for E2E tests. Tests live in the root `test/` directory and run against the real Next.js application stack.

### Test Types vs Location

| Test Type | Location | Framework | Purpose |
|-----------|----------|-----------|---------|
| **Unit** | `src/**/__tests__/` | Vitest | Entities, adapters, mappers |
| **Integration** | `src/**/__tests__/*.integration.*` | Vitest | Use cases with real adapters |
| **E2E** | `test/*.test.ts` | Vitest + Playwright | Full system flows |

---

## Project Structure (E2E)

```
test/
├── helpers/server.ts                    # findOrStartServer, screenshot dir (shared)
├── dashboard-navigation.spec.ts         # Dashboard smoke: setup view, nav, demo batch
├── artifact-analysis-detail.spec.ts     # Completed analysis rendering (seeded IndexedDB)
├── persona-system-e2e.test.ts           # Persona pipeline (no browser needed)
├── persona-names.test.ts                # Deterministic naming
└── two-stage-pipeline.test.ts           # Domain validation
```

Screenshots from failed tests are saved to `.sisyphus/evidence/`.

---

## Quick Start

### Prerequisites

- `bun install` (installs Playwright browsers for the **current** `playwright-core` version)
- `.env` with `OPENROUTER_API_KEY` (only needed for tests that call LLMs)
- A running local server, **or** the test will auto-start one (see [Server Management](#server-management))

### Run All E2E Tests

```bash
bun vitest run test/
```

### Run a Single Test

```bash
bun vitest run test/pricing-analysis-e2e.test.ts
```

### Watch Mode (dev loop)

```bash
bun vitest --watch test/pricing-analysis-e2e.test.ts
```

---

## Two E2E Test Patterns

DeepBound has two distinct E2E test patterns depending on whether the test needs a **browser** or not.

### Pattern 1: No Browser (Persona Pipeline)

Used for testing persona system internals — the pipeline runs in Node with no UI. These tests directly import source classes.

```typescript
// test/persona-system-e2e.test.ts
import { describe, it, expect } from "vitest";
import { PersonaPromptCompiler } from "../src/infrastructure/adapters/PersonaPromptCompiler";

describe("Kynd Persona System", () => {
  it("compiles a compartmentalized prompt", () => {
    const compiler = new PersonaPromptCompiler();
    const prompt = compiler.compileSystemPrompt(jordan);
    expect(prompt).toContain("<<PERSONA IDENTITY>>");
  });
});
```

**When to use:** Testing domain/application/infrastructure classes that don't require a browser.

### Pattern 2: Full Browser (UI Rendering)

Used for testing the frontend rendering pipeline — opens a real browser, seeds localStorage, and verifies page output.

```typescript
// test/pricing-analysis-e2e.test.ts
// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser } from "playwright";
import { spawn, type ChildProcess } from "child_process";

describe("Pricing Analysis E2E", () => {
  let browser: Browser;
  let server: ChildProcess | null = null;

  beforeAll(async () => {
    const result = await findOrStartServer();
    BASE_URL = result.url;
    server = result.process;
    browser = await chromium.launch({ headless: true });
  }, SERVER_TIMEOUT + 30_000);

  afterAll(async () => {
    await browser?.close();
    if (server) server.kill("SIGTERM");
  });

  it("renders completed analysis", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    // Seed the simulation store (IndexedDB) with a completed run.
    // See test/artifact-analysis-detail.spec.ts for a full fixture builder.
    await seedSimulationStorage(page, {
      simulations: [completedSimulation],
      dismissedSimulationIds: [],
    });

    await page.goto(`${BASE_URL}/dashboard/simulations/test-sim`, {
      waitUntil: "networkidle",
    });

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Executive Synthesis");
    expect(bodyText).toContain("Individual Persona Reports");

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "my-test.png"),
      fullPage: true,
    });
  });
});
```

**When to use:** Testing UI rendering, page structure, navigation flows, and regression checks.

---

## Server Management

Every browser-based E2E test includes `findOrStartServer()`:

```typescript
async function findOrStartServer(): Promise<{
  url: string;
  process: ChildProcess | null;
}> {
  // 1. Try ports 3000, 3001, 3100, 3207 for an existing server
  // 2. If none found, spawn `bun run next dev -p 3207`
  // 3. Poll until server responds (120s timeout)
  // 4. Return { url, process }
}
```

The test will **reuse your existing `bun dev` server** if one is running, or start its own. Server is killed in `afterAll` only if the test started it.

**Tip:** Keep `bun dev` running in a separate terminal for faster test iterations.

---

## Data Seeding: IndexedDB vs API

### IndexedDB (simulation store)

The simulation store persists to **IndexedDB** (via `idb-keyval`: DB `keyval-store`, store `keyval`, key `simulation-storage`), not localStorage. Seed it with `page.addInitScript` before navigation:

```typescript
await page.addInitScript((seed) => {
  return new Promise<void>((resolve) => {
    const req = indexedDB.open('keyval-store');
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('keyval')) req.result.createObjectStore('keyval');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('keyval', 'readwrite');
      tx.objectStore('keyval').put(seed, 'simulation-storage');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    };
    req.onerror = () => resolve();
  });
}, JSON.stringify({ state: { simulations: [...], dismissedSimulationIds: [] }, version: 2 }));
```

See `test/artifact-analysis-detail.spec.ts` for a full example with valid `Simulation`/`PersonaResponse`/`ArtifactSynthesis` fixtures.

### API (VPS Pattern)

For tests that need real data from the analysis pipeline, POST to the report API:

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/pricing", "personas": [...]}'
```

Or via the VPS endpoint directly:

```bash
curl -X POST http://localhost:3000/api/vps/analyze-pricing \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/pricing"}'
```

The VPS endpoint returns `{"runId": "pricing-<timestamp>"}` (fire-and-forget). Use the Report API for synchronous results.

---

## Writing a New E2E Test

### Step-by-step

1. **Create the file** in `test/` with a descriptive name:
   ```
   test/my-feature-e2e.test.ts
   ```

2. **Add the Vitest environment header** for browser tests:
   ```typescript
   // @vitest-environment node
   ```

3. **Copy the boilerplate** from an existing test:
   - `findOrStartServer()` helper
   - `beforeAll`/`afterAll` with browser lifecycle
   - `SCREENSHOT_DIR` constant
   - `TEST_TIMEOUT` constant
   - `ensureScreenshotDir()` helper

4. **Write your test with assertions:**
   ```typescript
   it("should render the feature correctly", async () => {
     const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

     // Seed data
     // Navigate
     // Assert
     // Screenshot
   });
   ```

5. **Run and verify:**
   ```bash
   bun vitest run test/my-feature-e2e.test.ts
   ```

---

## Test Patterns & Best Practices

### 1. Screenshot on Failure

Use `page.screenshot()` at the end of every test:

```typescript
await page.screenshot({
  path: path.join(SCREENSHOT_DIR, "my-feature-result.png"),
  fullPage: true,
});
```

Screenshots are saved to `.sisyphus/evidence/` for post-mortem analysis.

### 2. Page Error Tracking

Catch rendering errors (especially for regression tests):

```typescript
const pageErrors: string[] = [];
page.on("pageerror", (err) => {
  if (!err.message.includes("Hydration failed")) {
    pageErrors.push(err.message);
  }
});
// ... after assertions
expect(pageErrors).toHaveLength(0);
```

### 3. Console Log Tracing

Capture and assert on TRACE-level console logs:

```typescript
const consoleMessages: string[] = [];
page.on("console", (msg) => consoleMessages.push(msg.text()));

// ... after page loads
const traceMessages = consoleMessages.filter((m) => m.includes("[TRACE]"));
expect(traceMessages.length).toBeGreaterThanOrEqual(3);
```

### 4. Transition / Streaming Tests

Seed an `IN_PROGRESS` state, then update the store and reload. The simulation store lives in IndexedDB, so seed/mutate through a small helper:

```typescript
// Seed or overwrite the simulation store (idb-keyval: DB "keyval-store", store "keyval")
async function seedSimulationStorage(page: Page, state: unknown) {
  await page.evaluate(async (seed) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("keyval-store");
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("keyval")) req.result.createObjectStore("keyval");
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("keyval", "readwrite");
        tx.objectStore("keyval").put(seed, "simulation-storage");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  }, JSON.stringify({ state, version: 2 }));
}

// Seed in-progress state, then update and reload
await seedSimulationStorage(page, { simulations: [inProgressSimulation], dismissedSimulationIds: [] });

await page.goto(`${BASE_URL}/dashboard/simulations/${simId}`, {
  waitUntil: "networkidle",
});

// Update to completed
await seedSimulationStorage(page, {
  simulations: [{ ...inProgressSimulation, status: "COMPLETED", analyses: mockAnalyses }],
  dismissedSimulationIds: [],
});

await page.reload({ waitUntil: "networkidle" });
```

### 5. Legacy Data Compatibility

Test that old data formats still render without errors:

```typescript
const legacyAnalyses = mockAnalyses.map((a) => {
  const { personaProfile: _, ...rest } = a;
  return rest;
});

await seedSimulationStorage(page, {
  simulations: [buildSimulation("legacy-sim", "Legacy", legacyAnalyses)],
  dismissedSimulationIds: [],
});
```

---

## Console Log Verification (Telemetry-Driven Development)

DeepBound follows a **Telemetry-Driven** approach — E2E tests should exercise the real stack and capture logs.

### Flow

1. **Write the E2E test** that runs against the real app
2. **Embed strategic `console.log` statements** at critical junctions in the code: function entries, conditional branches, intermediate values, API payloads
3. **Run the E2E test** and capture ALL console output from the Playwright browser
4. **Write logs to a file** (`.sisyphus/e2e-logs.txt`) for systematic review
5. **Trace each logged step** against the expected execution flow:
   - Did every intended function execute?
   - Were intermediate values correct?
   - Did execution hit every expected branch?
6. **Fix any anomalies** before declaring done — even if the test reported pass

### Example: TRACE Log Verification

```typescript
it("emits trace logs for Benchmark and Divergence", async () => {
  const consoleMessages: string[] = [];
  page.on("console", (msg) => consoleMessages.push(msg.text()));

  await page.goto(`${BASE_URL}/dashboard/simulations/trace-sim`, {
    waitUntil: "networkidle",
  });

  const traceLogs = consoleMessages.filter((m) => m.includes("[TRACE]"));

  // Verify Benchmark traces
  const benchmarkLines = traceLogs.filter((m) => m.includes("[Benchmark]"));
  expect(benchmarkLines.length).toBeGreaterThanOrEqual(3);
  expect(benchmarkLines[0]).toContain("analysis=");

  // Verify Divergence traces
  const divergenceLines = traceLogs.filter((m) => m.includes("[Divergence]"));
  expect(divergenceLines.length).toBeGreaterThanOrEqual(1);
  expect(divergenceLines[0]).toContain("analyses=");
});
```

---

## Common Patterns Reference

### Shared Constants

```typescript
const PORTS_TO_TRY = [3000, 3001, 3100, 3207];
const SCREENSHOT_DIR = path.resolve(process.cwd(), ".sisyphus", "evidence");
const SERVER_TIMEOUT = 120_000;  // 2 min
const TEST_TIMEOUT = 60_000;     // 1 min
```

### Browser Options

```typescript
// Standard viewport
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Mobile viewport
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
```

### Wait Strategies

```typescript
// Wait for network to settle (recommended)
await page.goto(url, { waitUntil: "networkidle" });

// Wait for specific content
await page.waitForSelector("h1");
await page.waitForSelector("text=Average Scores");

// Small settling delay
await page.waitForTimeout(500);
```

---

## Release Gate

`bun run release` runs lint + production build (typechecks) + the full deterministic test suite — no live LLM calls. Run it before any external demo, then do the human pass in `docs/RELEASE_CHECKLIST.md`.

Real-pipeline verification (with live LLM calls) is intentional and on-demand: use the `verify-kynd` skill (`bun scripts/verify-output.ts`) when prompts or pipeline structure change. See `.agents/skills/verify-kynd/SKILL.md`.

---

## Running Tests Against the VPS

For tests that need to hit the hosted VPS directly:

```bash
# Trigger a pricing analysis via VPS API
curl -X POST http://154.38.180.173:8080/api/vps/analyze-pricing \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/pricing"}'

# Check VPS server logs
ssh jeremykamber@154.38.180.173 "pm2 logs kynd-backend-engine --lines 50"
```

The VPS runs a Next.js app (port 8080) with a Playwright browser server (port 8081, managed via PM2).

---

## Adding Dependencies

This guide is a living document. If you add a new pattern or discover a test gotcha, update this file with:
- The problem you encountered
- The solution implemented
- The test file where the pattern is demonstrated
