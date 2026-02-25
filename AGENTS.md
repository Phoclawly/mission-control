# AGENTS.md — Mission Control Development

## Boot Sequence

1. `CLAUDE.md` — project context, stack, conventions
2. `git status` + `git log --oneline -5` — current state
3. `npm run build` — verify clean baseline
4. This file — gotchas, anti-patterns, learnings

## Key Gotchas

**DB_PATH module-level capture:** `src/lib/db/index.ts` reads `DATABASE_PATH` at module load time (line 7). In tests, you MUST set `DATABASE_PATH` BEFORE any code imports `@/lib/db`. The test helpers (`src/test/helpers/db.ts`) own a separate better-sqlite3 connection and call `setupTestDb()` in `beforeAll()` which sets the env var first.

**Vitest pool:** `pool: 'forks'` in vitest.config.ts — required for native module isolation (better-sqlite3). Do NOT change to 'threads'.

**Migration ID uniqueness:** Migration IDs in `src/lib/db/migrations.ts` must be unique. A duplicate ID `'011'` was the root cause of 70 test failures (3 suites failing in `beforeAll`). Validated at startup — `runMigrations()` throws on duplicate IDs.

**Migration ordering:** Migrations in `src/lib/db/migrations.ts` must NEVER be reordered or removed. Always check column existence with `PRAGMA table_info` before ALTER TABLE. Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

**PM2 stale dumps:** After container recreation, PM2 `resurrect` may load stale process configs. Fix: `pm2 delete all` + `pm2 start ecosystem.config.cjs` + `pm2 save`.

**API helpers:** `src/lib/api-helpers.ts` provides `buildPatchQuery()` and `notFound()` for API routes. Use these instead of manual update/values arrays in PATCH handlers.

## Testing Rules

- Use real better-sqlite3 databases (temp files), NOT mocks
- Each test file: `setupTestDb()` in `beforeAll`, `resetTables()` in `beforeEach`, `teardownTestDb()` in `afterAll`
- Route handlers must be dynamically imported (`await import()`) AFTER `setupTestDb()` to ensure they see the test DB
- Use seed helpers (`seedWorkspace`, `seedAgent`, `seedTask`, etc.) from `src/test/helpers/db.ts`
- 101 tests total, 101/101 passing. All 4 test suites green. If tests fail, investigate — don't skip
- **Visual QA:** After UI changes, use `/dogfood http://localhost:14040` for comprehensive browser-based testing — navigates every page, screenshots interactions, and produces structured bug reports with full repro evidence. Prefer this over ad-hoc browser clicks
- Test behavior, not implementation — assert on API response shapes, not internal state
- Visual QA with `/dogfood` is a hard gate for UI changes, not optional

## Anti-Patterns (NEVER DO)

- Importing `@/lib/db` at top level in test files (breaks DB_PATH capture)
- Mocking better-sqlite3 (breaks native module, gives false positives)
- Adding migrations with duplicate IDs (silently skipped)
- Changing vitest pool to 'threads' (native module crashes)
- Running `pm2 resurrect` after config changes without verifying the dump
- Force-pushing to main
- Over-engineering solutions (extracting abstractions for one-time patterns)
- Retry loops (sleep + retry) instead of diagnosing root cause
- Skipping visual QA after UI changes (always run `/dogfood`)
- Creating new type files instead of extending `src/lib/types.ts`

## Autonomy Boundaries

**Free to do (no confirmation needed):**
- Edit code, run tests, run builds
- Read any file, search codebase
- Create/edit files in src/
- Run git status/log/diff

**Ask first:**
- git commit, git push
- Deleting files
- Modifying CLAUDE.md, AGENTS.md, package.json
- Changes to middleware or auth logic
- Database schema changes

**Never do without explicit ask:**
- Force push, reset --hard
- Delete branches
- Modify .env or credentials
- Skip pre-commit hooks
- Deploy to production

## Deploy Checklist

1. `npm run build` locally — zero errors
2. `npx vitest run` — tests pass
3. No secrets in staged files (check for .env, tokens, keys)
4. Changelog entry in `changelog/` if significant change
5. `git push origin main`
6. VPS: `git pull && npm run build && pm2 restart mission-control`
7. Verify: `curl http://localhost:4040/api/health` (or via SSH tunnel)

## Reflection Protocol

After completing a significant task (feature, bugfix, investigation):
1. If you discovered a new gotcha or anti-pattern, add it to the relevant section above
2. If a workaround was needed, document WHY so future sessions don't repeat the investigation
3. Keep entries concrete and actionable — no vague "be careful with X"
