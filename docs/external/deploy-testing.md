# Testing PRs against the deployed stack

- Netlify auto-creates a deploy preview per PR: `https://deploy-preview-<PR#>--deepbound.netlify.app` (SUCCESS status is a GitHub check).
- The VPS backend runs whatever branch is checked out at `/home/jeremykamber/dev/kynd` (pm2 `kynd-backend-engine`). For full-stack PR testing, the VPS must be on the same branch as the preview — after merging a PR, switch the VPS back to `main` (`git pull origin main && npm run build && npx pm2 restart ecosystem.config.js`).
- API probe (no UI): POST `VPS_BACKEND_URL/api/vps/generate-personas` with `Authorization: Bearer $VPS_AUTH_TOKEN`, body `{personaDescription, count, mode}` (`mode` is `strategy` or `research`; omitting it routes to the legacy pipeline). Poll `GET /api/vps/persona-result?runId=...` for `found: true`.
- Local pipeline check: `bun scripts/verify-output.ts persona --description "..." --count 2 --mode strategy|research` — same code as the deployed VPS.
