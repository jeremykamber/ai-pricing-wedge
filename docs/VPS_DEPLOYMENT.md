# VPS Deployment Guide: DeepBound

## Architecture Overview

DeepBound uses a **dual-mode architecture** with two separate deployments:

| Component | Host | URL | Purpose |
|-----------|------|-----|---------|
| **Frontend + Server Actions** | Netlify | `https://deepbound.bringforthstudio.com` | UI, server actions, client-side logic |
| **Backend API + Playwright** | VPS | `http://154.38.180.173:8080` | `/api/vps/*` routes, browser automation |

```
Browser → Netlify (Next.js) → Server Actions → runRemote() → VPS API (port 8080)
                                                              ↓
                                                         Playwright (port 8081)
```

## How It Works

Server actions (`src/actions/*.ts`) check `shouldRunLocally()` which **always returns `false`** (hardcoded). This forces every server action to call `runRemote()`, which POSTs to `VPS_BACKEND_URL/api/vps/<endpoint>` with an `Authorization: Bearer <token>` header.

The VPS runs a Next.js standalone build that only serves `/api/vps/*` routes. A middleware (`src/middleware.ts`) guards all these routes:
1. Checks `IS_VPS=true` — if not set, returns 404 (prevents Netlify from exposing these routes)
2. Checks `Authorization` header against `VPS_AUTH_TOKEN` — if mismatch, returns 401

## ⚠️ Architectural Principle: Fire-and-Forget for Long-Running Routes

**Long-running VPS routes (multiple sequential LLM calls, 60-120s total) MUST use the fire-and-forget + polling pattern.** This is the core reason for the Netlify/VPS split — Netlify serverless functions have a 10-15s timeout and cannot block on synchronous LLM calls.

### The Pattern

```
Client UI → Server Action (returns immediately with runId)
  ↓
Client UI polls:
  ├── GET /api/vps/analyze-progress?runId=...   (step updates)
  └── GET /api/vps/persona-result?runId=...      (final result)
```

**POST** route:
- Validates input and rate-limits
- Kicks off a background IIFE (the long-running work)
- Returns `{ runId }` immediately

**Background IIFE:**
- Writes progress updates via `storeProgress(runId, { step })` to the in-memory progress map
- On completion, writes final result to a result store (e.g., `PersonaGenerationStore`, `SimulationResultStore`)
- Calls `storeCompleted(runId)` to signal completion

**Client-side (server action `runRemote`):**
- POSTs to VPS → gets `{ runId }`
- Returns `{ streamData: undefined, runId }` to the UI (no streaming on remote path)
- UI polls progress/result endpoints every 2 seconds

### Routes Using This Pattern

| Route | POST | Progress GET | Result GET |
|-------|------|-------------|------------|
| `analyze-pricing` | ✅ Fire-and-forget | `analyze-progress` | `analyze-result` |
| `generate-personas-from-interviews` | ✅ Fire-and-forget | `analyze-progress` (runId prefix: `pi-`) | `persona-result` |
| `generate-personas` | ✅ Fire-and-forget | `analyze-progress` (runId prefix: `pt-`) | `persona-result` |

### Routes That Don't Need It

Routes that make a single fast LLM call or do quick synchronous work can stay synchronous:

- `chat-with-persona` — streaming (SSE)
- `debate` — streaming (SSE)
- `predict-gaze` — single fast LLM call
- `validate-analysis` — single LLM call
- `record-step` — synchronous DB save
- `generate-similar-personas` — single LLM call (~10-30s, tolerable)

### Adding a New Long-Running Route

1. Create a result store (extend `PersonaGenerationStore` or create a new one)
2. POST handler: validate → kick off background IIFE → return `{ runId }`
3. Background IIFE: write progress via `storeProgress`, write result via result store
4. Server action `runRemote`: POST → return `{ streamData: undefined, runId }`
5. Client hook: poll `getPersonaGenerationResultAction(runId)` for results

## Required Environment Variables

### Netlify (`deepbound.bringforthstudio.com`)

| Variable | Value | Purpose |
|----------|-------|---------|
| `IS_VPS` | `false` | Tells middleware this is Netlify (not the VPS) |
| `VPS_BACKEND_URL` | `http://154.38.180.173:8080` | Where to send remote API calls |
| `VPS_AUTH_TOKEN` | (shared secret) | Auth token sent in `Authorization` header |
| `PLAYWRIGHT_WS_ENDPOINT` | `ws://154.38.180.173:8081/playwright-ws` | Playwright browser server on VPS |
| `OPENROUTER_API_KEY` | (API key) | LLM provider key |
| `OPENAI_API_KEY` | (API key) | Fallback LLM provider key |

### VPS (`154.38.180.173`)

Set via `ecosystem.config.js` (not `.env` — the standalone build doesn't read `.env`):

| Variable | Value | Purpose |
|----------|-------|---------|
| `IS_VPS` | `true` | Tells middleware this IS the VPS |
| `VPS_AUTH_TOKEN` | (shared secret, matches Netlify) | Validates incoming requests |
| `VPS_BACKEND_URL` | `http://localhost:8080` | Self-referencing for internal calls |
| `PLAYWRIGHT_WS_ENDPOINT` | `ws://localhost:8081/playwright-ws` | Local browser server |
| `OPENROUTER_API_KEY` | (API key) | LLM provider key |
| `PORT` | `8080` | Next.js server port |
| `NODE_ENV` | `production` | Production mode |

## VPS Setup

### PM2 Processes

Two processes managed by `ecosystem.config.js`:

1. **`kynd-browser-server`** — Playwright browser server on port 8081
   - Script: `playwright-server.js` (root of project)
   - Launches `chromium.launchServer()` 

2. **`kynd-backend-engine`** — Next.js standalone server on port 8080
   - Script: `.next/standalone/server.js`
   - Handles all `/api/vps/*` requests

### Commands

```bash
# Start/Restart everything
npx pm2 start ecosystem.config.js

# View logs
npx pm2 logs kynd-backend-engine --lines 50

# Restart after build
npx pm2 restart ecosystem.config.js

# Stop
npx pm2 stop kynd-backend-engine
```

### Build & Deploy

```bash
# Pull latest
git pull origin main

# Build (produces .next/standalone/)
npm run build

# Restart
npx pm2 restart ecosystem.config.js
```

## Playwright Browser Server (`playwright-server.js`)

A standalone Node.js script that exposes a Playwright Chromium instance via WebSocket. This allows the Next.js server to connect to a persistent browser rather than launching one per request.

- **Port:** 8081
- **Endpoint:** `ws://localhost:8081/playwright-ws`
- **Heartbeat:** 30-second interval via WebSocket ping

## VPS-Only Files (Not in Git Repo)

The following files exist **only on the VPS** and are not tracked in the repository:

- **`ecosystem.config.js`** — PM2 process configuration (ports, env vars for both services)
- **`playwright-server.js`** — Standalone Playwright browser server exposing a WebSocket endpoint

These are deployment artifacts that must be created/managed directly on the VPS. After pulling new code, rebuild and restart via:
```bash
cd /home/jeremykamber/dev/kynd
git pull origin main
npm run build
npx pm2 restart ecosystem.config.js
```

## Auth Flow (Why "Unauthorized" Happens)

1. Netlify server action calls `runRemote()` → fetch to `VPS_BACKEND_URL/api/vps/...`
2. Request includes `Authorization: Bearer ${VPS_AUTH_TOKEN}` header
3. VPS middleware checks `authHeader !== Bearer ${process.env.VPS_AUTH_TOKEN}`
4. If mismatch → returns 401 `{"error":"Unauthorized"}`

**If you see "Unauthorized" on the Netlify site:**
- Verify `VPS_AUTH_TOKEN` is set on **both** Netlify and VPS — they must match
- Redeploy Netlify after changing env vars (they don't take effect until redeploy)
- The VPS `.env` file is NOT read by the standalone build — use `ecosystem.config.js` instead
- The build must be completed (`.next/standalone/server.js` must exist)

## Disk Space & Cleanup

The VPS has filled up before with `ENOSPC: no space left on device` (e.g. the build failing to create `.next/standalone/logs`). The usual cause is **aborted `ollama pull` downloads**: an interrupted pull leaves multi-GB `-partial` blob files behind in `/usr/share/ollama/.ollama/models/blobs/`. In one incident this accounted for ~66 GB of a 145 GB disk.

### Automated cleanup

`infra/vps-disk-cleanup.sh` removes known-reclaimable disk usage and is safe to run repeatedly. It:

- Deletes Ollama `-partial` files (aborted downloads) — skipped while a pull/create is running
- Deletes Ollama orphaned blobs (complete blobs no manifest references and no running `ollama runner` has open) — live models and in-flight inference are never touched
- Truncates PM2 logs over 200 MiB
- Vacuums the systemd journal to 100 MiB
- Clears the npm cache when it exceeds 1 GiB

It logs to `/var/log/kynd-disk-cleanup.log` and exits non-zero if the disk is still above 95% after cleanup.

**Install (one-time, on the VPS):**

```bash
# 1. Passwordless sudo for the script (required so cron can run it as root)
echo 'jeremykamber ALL=(root) NOPASSWD: /home/jeremykamber/dev/kynd/infra/vps-disk-cleanup.sh' \
  | sudo tee /etc/sudoers.d/kynd-disk-cleanup
sudo chmod 440 /etc/sudoers.d/kynd-disk-cleanup

# 2. Cron: run every 6 hours
(crontab -l 2>/dev/null | grep -v 'vps-disk-cleanup'; \
  echo '0 */6 * * * sudo /home/jeremykamber/dev/kynd/infra/vps-disk-cleanup.sh >/dev/null 2>&1') \
  | crontab -

# 3. Verify it runs
sudo /home/jeremykamber/dev/kynd/infra/vps-disk-cleanup.sh
```

Manual dry-run (shows what it would delete without deleting):

```bash
sudo DISK_CLEANUP_LOG=/tmp/cleanup-dry.log \
  /home/jeremykamber/dev/kynd/infra/vps-disk-cleanup.sh --dry-run
```

If you ever see `ENOSPC` again, run the cleanup script before rebuilding.

## Troubleshooting

### "Error: Cannot read properties of undefined (reading 'toLowerCase')"
Bug in the persona analysis validation step — the validation logic expects fields that optional personas might not have. This is a known issue.

### "browserContext.newPage: Browser closed"
The browser server process was killed or couldn't start. Common causes:
1. **Dual PM2 daemons** — If root's PM2 (`/root/.pm2`) and user's PM2 (`~/.pm2`) both try to manage the same ports, the second one crash-loops with `EADDRINUSE`. Check with `npx pm2 list` under both users. Only one should manage the services.
2. **Browser close during navigation** — `RemotePlaywrightAdapter.close()` used to call `this.browser.close()` which killed the WebSocket-connected browser. Fixed — now only page + context are cleaned up.

### "Headers Timeout Error"
OpenRouter API timeout. The LLM provider is slow or unreachable. Retry the request.

### PM2 process running old code
The standalone build must complete successfully. If `npm run build` is aborted, `.next/standalone/` won't exist but the old PM2 process may keep running from a deleted file (Linux keeps FDs alive). Always run `npm run build` to completion before restarting.
