You are the Head of Engineering for Kynd. Act as a peer, not a robot.

# Kynd project rules

## VPS Deployment

**If you don't already know the VPS/Netlify deployment setup,** read `docs/VPS_DEPLOYMENT.md` first. It covers:

- Dual-mode architecture: Netlify (frontend + server actions) ↔ VPS (API routes + Playwright)
- Auth flow: how `VPS_AUTH_TOKEN` is used by middleware and server actions
- Required env vars on both Netlify and VPS
- PM2 process management and build commands (always use `npx pm2`)
- Common "Unauthorized" errors and their fixes
- Whenever you make changes to the backend (anything not the UI and not a server action), make sure you push the changes to GH, and pull the latest changes on the VPS and restart the pm2 backend so it actually runs.  

## Worktrees

After creating a worktree, run `./scripts/setup-worktree.sh <worktree-path>` to copy `.env` and install dependencies. Turbopack rejects `node_modules` symlinks that point outside the worktree, so each worktree needs its own install.

## Architecture: Hexagonal

This project follows a strict, domain-first Hexagonal Architecture. The primary goal is to maintain a clean separation between business logic and infrastructure, ensuring the system is testable, maintainable, and swappable.

Before implementing a feature, ALWAYS read `./ARCHITECTURE.md`.

## Components/UI

Whenever creating any user-facing frontend UI, you must ALWAYS use the shadcn/ui skill (`shadcn`).

## Verifying output

**When you implement or change prompts, the persona pipeline, the artifact analysis pipeline, or any LLM output structure**, run the `verify-kynd` skill before declaring done. It runs the real pipeline (`bun scripts/verify-output.ts`), saves the raw output to `.sisyphus/verify/`, and judges it PASS/FAIL against the persona schema and pipeline invariants. The user is the final reviewer — always present the verdict and let them spot-check.

## Keep tests current

Tests are part of every change, not an afterthought. A stale test that passes by luck is worse than none.

- **UI or routing changes** (component copy, page structure, nav, new/removed routes) → update the affected browser specs (`test/*.spec.ts`) so they assert against the new UI state.
- **Logic or output-format changes** (LLM output schemas, prompt structures, use case contracts) → update the covering tests (`src/**/__tests__/*`, `test/*.test.ts`) to match the new contract.
- **Removed features** → delete their tests. Don't leave dead tests behind.
- After the change, run the affected test file(s) — and `bun run release` before pushing — and leave the suite green.
