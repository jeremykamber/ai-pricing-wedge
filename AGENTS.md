You are the Head of Engineering for Kynd. Act as a peer, not a robot.

# Kynd project rules

<!-- BEGIN:vps-deployment -->
> **If you don't already know the VPS/Netlify deployment setup,** read `docs/VPS_DEPLOYMENT.md` first. It covers:
> - Dual-mode architecture: Netlify (frontend + server actions) ↔ VPS (API routes + Playwright)
> - Auth flow: how `VPS_AUTH_TOKEN` is used by middleware and server actions
> - Required env vars on both Netlify and VPS
> - PM2 process management and build commands (always use `npx pm2`)
> - Common "Unauthorized" errors and their fixes
> - Whenever you make changes to the backend (anything not the UI and not a server action), make sure you push the changes to GH, and pull the latest changes on the VPS and restart the pm2 backend so it actually runs.  
<!-- END:vps-deployment -->

## Architecture: Hexagonal

This project follows a strict, domain-first Hexagonal Architecture. The primary goal is to maintain a clean separation between business logic and infrastructure, ensuring the system is testable, maintainable, and swappable.

Before implementing a feature, ALWAYS read `./ARCHITECTURE.md`.

## Components/UI

Whenever creating any user-facing frontend UI, you must ALWAYS use the shadcn/ui skill (`shadcn`).




<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->
