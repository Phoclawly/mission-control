# AGENTS.md — Mission Control Development

## Boot Sequence

1. `CLAUDE.md` — project context, stack, conventions
2. `git status` + `git log --oneline -5` — current state
3. `npm run build` — verify clean baseline
4. This file — gotchas, anti-patterns, learnings

## Key Gotchas

**DB_PATH module-level capture:** `src/lib/db/index.ts` reads `DATABASE_PATH` at module load time (line 7). In tests, you MUST set `DATABASE_PATH` BEFORE any code imports `@/lib/db`. The test helpers (`src/test/helpers/db.ts`) own a separate better-sqlite3 connection and call `setupTestDb()` in `beforeAll()` which sets the env var first.

**Vitest pool:** `pool: 'forks'` in vitest.config.ts — required for native module isolation (better-sqlite3). Do NOT change to 'threads'.

**Middleware IPv6 bug:** `middleware.ts` `isAllowedIp()` — Tailscale IPv6 (fd7a:115c::) is never matched because `ip4ToInt()` returns 0 for IPv6 (`NaN >>> 0 = 0`), preventing the catch block from running. Documented in middleware tests as known bug.

**Migration ordering:** Migrations in `src/lib/db/migrations.ts` must NEVER be reordered or removed. Always check column existence with `PRAGMA table_info` before ALTER TABLE. Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

**PM2 stale dumps:** After container recreation, PM2 `resurrect` may load stale process configs. Fix: `pm2 delete all` + `pm2 start ecosystem.config.cjs` + `pm2 save`.

## Testing Rules

- Use real better-sqlite3 databases (temp files), NOT mocks
- Each test file: `setupTestDb()` in `beforeAll`, `resetTables()` in `beforeEach`, `teardownTestDb()` in `afterAll`
- Route handlers must be dynamically imported (`await import()`) AFTER `setupTestDb()` to ensure they see the test DB
- Use seed helpers (`seedWorkspace`, `seedAgent`, `seedTask`, etc.) from `src/test/helpers/db.ts`
- 100 tests total, 93 passing. 7 known failures in middleware auth-enabled section — do not try to "fix" these without explicit ask
- **Visual QA:** After UI changes, use `/dogfood http://localhost:14040` for comprehensive browser-based testing — navigates every page, screenshots interactions, and produces structured bug reports with full repro evidence. Prefer this over ad-hoc browser clicks

## Anti-Patterns (NEVER DO)

- Importing `@/lib/db` at top level in test files (breaks DB_PATH capture)
- Mocking better-sqlite3 (breaks native module, gives false positives)
- Adding migrations with duplicate IDs (silently skipped)
- Changing vitest pool to 'threads' (native module crashes)
- Running `pm2 resurrect` after config changes without verifying the dump
- Force-pushing to main

## Deploy Checklist

1. `npm run build` locally — zero errors
2. `npx vitest run` — tests pass
3. `git push origin main`
4. VPS: `git pull && npm run build && pm2 restart mission-control`
5. Verify: `curl http://localhost:4040/api/health` (or via SSH tunnel)

## Reflection Protocol

After completing a significant task (feature, bugfix, investigation):
1. If you discovered a new gotcha or anti-pattern, add it to the relevant section above
2. If a workaround was needed, document WHY so future sessions don't repeat the investigation
3. Keep entries concrete and actionable — no vague "be careful with X"
