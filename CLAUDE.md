# Mission Control

Next.js dashboard for managing OpenClaw agent workspaces, capabilities, integrations, and cron jobs. Runs inside the `botmaker-gateway` Docker container on Hetzner VPS via PM2.

## Before Starting (every session)

1. `git pull --rebase` — always sync before touching code
2. `npm run build` — verify clean build before and after changes
3. Read relevant source files before editing — understand existing patterns
4. Check `AGENTS.md` for known gotchas and anti-patterns before touching related areas

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
| `src/lib/db/` | Database module (`index.ts` helpers, `schema.ts`, `migrations.ts`, `seed.ts`) |
| `src/app/api/` | API routes |
| `src/test/__tests__/` | Vitest unit/integration tests (4 files, 100 tests) |
| `src/test/helpers/db.ts` | Test DB lifecycle + seed helpers (owns its own better-sqlite3 connection) |
| `tests/e2e/` | Playwright E2E tests |
| `src/lib/db/migrations.ts` | Schema migrations (idempotent, never reorder/remove) |
| `src/lib/task-types.ts` | Pluggable task type registry (openclaw-native, claude-team, multi-hypothesis) |
| `changelog/` | Daily changelog entries (YYYY-MM-DD.md) |
| `docs/` | Architecture docs (orchestration, heartbeat, realtime, production setup) |
| `src/lib/api-helpers.ts` | Shared API route utilities (buildPatchQuery, notFound) |

## Build & Deploy

```bash
# 1. Build locally (always verify before pushing)
npm run build

# 2. Commit + push
git add <files> && git commit -m "..." && git push origin main

# 3. Deploy on VPS (pull, build, restart)
# NOTE: pm2 is NOT in default PATH inside container — must prepend it
ssh mission-control-vps \
  "docker exec botmaker-gateway bash -c 'export PATH=/home/node/.openclaw/npm-persistent/node_modules/.bin:\$PATH && cd /home/node/.openclaw/repos/mission-control && git pull && npm run build 2>&1 | tail -10 && pm2 restart mission-control'"
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

### Vitest Unit/Integration
```bash
npx vitest run                    # all tests
npx vitest run src/test/__tests__/tasks.test.ts  # single file
```

### When to use which

| Scenario | Tool |
|----------|------|
| API route logic, DB operations, validation | Vitest (`src/test/__tests__/`) |
| Regression checks, CI-style assertions | Playwright (`tests/e2e/`) |
| Post-deploy visual QA, UX review, bug hunting | `/dogfood` |

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
- PM2 `resurrect` can load stale dumps with old configs. If MC crashes post-resurrect: `pm2 delete all` + `pm2 start ecosystem.config.cjs` + `pm2 save`
- Migrations run on first DB connection, NOT on code change — if MC was already running, apply migrations manually before restart

## Code Hygiene

- **Delete aggressively** — remove dead code, unused imports, stale comments
- **Colocate** — keep related code together (component + types + styles)
- **Rule of Three** — extract only when a pattern appears 3+ times
- **Refactor hotspots** — when touching a file with tech debt, clean up what you touch
- **Minimal code** — the best code is no code; solve with less whenever possible

## Core Documentation

| Doc | Purpose |
|-----|---------|
| `CLAUDE.md` | Project context, stack, conventions (this file) |
| `AGENTS.md` | Agent-facing gotchas, anti-patterns, testing rules |
| `docs/` | Architecture docs (orchestration, heartbeat, realtime, production) |
| `changelog/` | Daily changelog entries |

## Quality Gates (before commit)

1. `npm run build` — zero type errors
2. `npx vitest run` — all 101 tests pass (101/101 expected)
3. Verify the change works on `localhost:14040` if it touches UI
4. `/dogfood http://localhost:14040` — mandatory after ANY UI change (not optional)

## Post-Task Reflection

After completing a significant task, ask:
1. Did I discover a new gotcha or anti-pattern? → Add to AGENTS.md
2. Did I change something that affects the build/deploy/test workflow? → Update this file
3. Should future sessions know about this? → Add to changelog/
