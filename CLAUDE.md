# Mission Control

Next.js dashboard for managing OpenClaw agent workspaces, capabilities, integrations, and cron jobs. Runs inside the `botmaker-gateway` Docker container on Hetzner VPS via PM2.

## Before Starting (every session)

1. `git pull --rebase` — always sync before touching code
2. `npm run build` — verify clean build before and after changes
3. Read relevant source files before editing — understand existing patterns

## Behavior

- Surgical and concise — go straight to the point
- Act and report, don't ask permission for routine changes
- Prefer editing existing files over creating new ones
- Don't over-engineer: minimum code for the current task
- Use Task tool to parallelize independent work (subagents)
- Prefer dedicated tools (Read, Edit, Grep, Glob) over Bash equivalents

## Stack

- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database:** SQLite via `better-sqlite3` (synchronous queries)
- **Process:** PM2 inside Docker container (`botmaker-gateway`)
- **Port:** 4040 inside container, tunneled to `localhost:14040` locally

## Key Paths

| Path | Purpose |
|------|---------|
| `src/app/workspace/[slug]/capabilities/page.tsx` | Capabilities page (tabs: Capabilities, Integrations, Crons, Health) |
| `src/components/` | UI components (CapabilityTable, IntegrationCard, AlertsBanner, etc.) |
| `src/lib/types.ts` | All TypeScript interfaces and types |
| `src/lib/db.ts` | Database helpers (`queryAll`, `queryOne`, `run`) |
| `src/app/api/` | API routes |
| `tests/e2e/` | Playwright E2E tests |

## Build & Deploy

```bash
# 1. Build locally (always verify before pushing)
npm run build

# 2. Commit + push
git add <files> && git commit -m "..." && git push origin main

# 3. Deploy on VPS (pull, build, restart)
ssh mission-control-vps \
  "docker exec botmaker-gateway bash -c 'cd /home/node/.openclaw/repos/mission-control && git pull && npm run build 2>&1 | tail -10 && pm2 restart mission-control'"
```

## Testing

### Automated E2E (Playwright)
```bash
PLAYWRIGHT_BASE_URL=http://localhost:14040 npx playwright test tests/e2e/
```

### Visual / Exploratory Testing — use `/dogfood`

After deploying UI changes, **always** use the `/dogfood` skill to visually verify the live app:

```
/dogfood http://localhost:14040
```

`/dogfood` systematically navigates the app, screenshots every page and interaction, tests interactive elements (buttons, modals, tabs, forms), and produces a structured bug report with full reproduction evidence (screenshots, repro steps, repro videos).

Prefer `/dogfood` over ad-hoc browser automation for exploratory testing — it produces better coverage and structured, actionable reports.

### When to use which

| Scenario | Tool |
|----------|------|
| Regression checks, CI-style assertions | Playwright (`tests/e2e/`) |
| Post-deploy visual QA, UX review, bug hunting | `/dogfood` |
| Writing new automated test cases | Playwright |

## Conventions

- **CSS:** Tailwind only, using `mc-*` design tokens (`mc-bg`, `mc-text`, `mc-accent`, `mc-border`, etc.)
- **Icons:** `lucide-react` exclusively
- **DB:** Synchronous `queryAll`/`queryOne`/`run` from `@/lib/db`
- **API:** `NextResponse.json(...)`, errors as `{ error: string }` with HTTP status
- **State:** React `useState` + `useCallback`, Zustand store for global agent/online state
- **Types:** All interfaces in `src/lib/types.ts` — extend there, don't create type files per component

## Guardrails

- NEVER commit `.env`, credentials, or tokens
- NEVER force-push without explicit user confirmation
- NEVER use `git add -A` or `git add .` — stage specific files
- NEVER skip pre-commit hooks (`--no-verify`)
- NEVER create documentation files unless explicitly asked
- Build must pass (`npm run build`) before committing — no shipping type errors
