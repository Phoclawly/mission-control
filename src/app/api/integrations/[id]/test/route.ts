/**
 * POST /api/integrations/[id]/test — Test an integration's connection
 *
 * Architecture:
 *   1. Fetch integration from DB
 *   2. Resolve credential via credential_source pattern (see below)
 *   3. Validate credential against provider API (provider-specific)
 *   4. Record health_check row + update integration status
 *   5. Broadcast SSE events (health_check_completed, integration_updated)
 *   6. Return updated integration object
 *
 * Credential source patterns:
 *   .env:VAR_NAME              → process.env[VAR_NAME]
 *   1password:Vault/Item       → `op read` or `op item get` (tries credential/password/api_key/secret/token)
 *   openclaw.json:KEY          → reads ~/.openclaw/openclaw.json env.vars[KEY], falls back to process.env
 *   gog:OAuth2                 → `gog auth list` CLI check
 *   built-in                   → always pass (gateway-managed webhooks)
 *   PLAIN_ENV_VAR              → process.env[PLAIN_ENV_VAR]
 *
 * Provider validation endpoints:
 *   anthropic    → POST /v1/messages (minimal request)
 *   openai       → GET /v1/models
 *   groq         → GET /openai/v1/models
 *   xai          → GET /v1/models
 *   perplexity   → POST /chat/completions (30s timeout)
 *   firecrawl    → POST /v1/scrape
 *   brave        → GET /res/v1/web/search
 *   elevenlabs   → GET /v1/user
 *   agentmail    → GET /v0/inboxes
 *   slack        → POST auth.test
 *   notion       → GET /v1/users/me
 *   (default)    → credential existence check only
 *
 * Special integration types:
 *   credential_provider (1password) → `op whoami`
 *   cli_auth (gog:OAuth2)           → `gog auth list`
 *   webhook (built-in)              → always pass
 *
 * ─── Adding a new integration ───────────────────────────────────────────
 *
 * 1. Create DB record via POST /api/integrations:
 *    {
 *      name: "My Service",
 *      type: "api_key",           // or cli_auth, webhook, credential_provider, etc.
 *      provider: "myservice",     // lowercase identifier, used in validateApiKey() switch
 *      credential_source: ".env:MYSERVICE_API_KEY"  // see patterns above
 *    }
 *
 * 2. Add provider-specific validation (optional but recommended):
 *    - Add a case to `validateApiKey()` below
 *    - Pick a lightweight read-only endpoint (GET /me, GET /models, etc.)
 *    - Use AbortSignal.timeout(10_000) for standard APIs, 30_000 for slow ones
 *    - Return { ok: true, detail } on 200, { ok: false, detail } on 401/403
 *    - 429 (rate limited) should return ok=true (key is valid, just throttled)
 *
 * 3. If no validation endpoint exists, the default handler checks credential
 *    existence and returns `Credential present (N chars)`.
 *
 * 4. For new credential_source patterns, add resolution logic in
 *    `resolveCredential()` above.
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { broadcast } from '@/lib/events';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Integration, HealthCheck } from '@/lib/types';

interface TestResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration_ms: number;
}

// ─── Credential resolution helpers ─────────────────────────────────────────

function runCmd(cmd: string, timeoutMs = 10_000): string {
  return execSync(cmd, {
    timeout: timeoutMs,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Resolve a credential_source to an actual secret value (or null).
 * Patterns:
 *   .env:VAR_NAME              → process.env[VAR_NAME]
 *   1password:Vault/Item       → op read "op://Vault/Item/credential"
 *   openclaw.json:KEY          → process.env[KEY] (mapped through gateway config)
 *   OP_SERVICE_ACCOUNT_TOKEN   → process.env.OP_SERVICE_ACCOUNT_TOKEN
 *   built-in                   → always pass (no credential needed)
 *   gog:OAuth2                 → check gog CLI auth
 */
function resolveCredential(credentialSource: string): { value: string | null; method: string } {
  if (!credentialSource) {
    return { value: null, method: 'none' };
  }

  // .env:VAR_NAME pattern
  if (credentialSource.startsWith('.env:')) {
    const varName = credentialSource.slice(5);
    return { value: process.env[varName] || null, method: 'env' };
  }

  // 1password:Vault/Item pattern — try common field names until one works
  if (credentialSource.startsWith('1password:')) {
    const itemPath = credentialSource.slice(10);
    // Check for special chars that break `op read` (parentheses, etc.)
    const hasSpecialChars = /[()[\]{}]/.test(itemPath);

    if (hasSpecialChars) {
      // Use `op item get` with --format json and parse fields
      const parts = itemPath.split('/');
      const vault = parts[0];
      const itemName = parts.slice(1).join('/');
      try {
        const jsonStr = runCmd(`op item get "${itemName}" --vault "${vault}" --format json`, 15_000);
        const item = JSON.parse(jsonStr);
        const fields = item.fields || [];
        // Priority order for finding the credential value
        const priorityLabels = ['credential', 'password', 'api_key', 'api key', 'secret', 'token', 'notesPlain'];
        for (const label of priorityLabels) {
          const field = fields.find((f: { label?: string; value?: string }) =>
            f.label?.toLowerCase() === label.toLowerCase() && f.value && f.value.length > 0
          );
          if (field) return { value: field.value, method: '1password' };
        }
        // Fall back to any field with a value
        const anyField = fields.find((f: { value?: string; label?: string }) =>
          f.value && f.value.length > 0 && !['username', 'notesPlain'].includes(f.label || '')
        );
        if (anyField) return { value: anyField.value, method: '1password' };
      } catch { /* item not found */ }
      return { value: null, method: '1password' };
    }

    // Standard path — try field names via `op read`
    const fieldNames = ['credential', 'password', 'api_key', 'api key', 'secret', 'token', 'notesPlain'];
    for (const field of fieldNames) {
      try {
        const value = runCmd(`op read "op://${itemPath}/${field}"`, 15_000);
        if (value && value.length > 0) {
          return { value, method: '1password' };
        }
      } catch {
        // Field doesn't exist, try next
      }
    }
    return { value: null, method: '1password' };
  }

  // openclaw.json:KEY pattern — read from gateway config file, then fall back to env
  if (credentialSource.startsWith('openclaw.json:')) {
    const varName = credentialSource.slice(14);
    // Try reading from openclaw.json env.vars
    const configPaths = [
      path.join(process.env.HOME || '/home/node', '.openclaw', 'openclaw.json'),
      '/home/node/.openclaw/openclaw.json',
    ];
    for (const cfgPath of configPaths) {
      try {
        if (fs.existsSync(cfgPath)) {
          const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
          const val = config?.env?.vars?.[varName];
          if (val) return { value: val, method: 'openclaw.json' };
        }
      } catch { /* ignore parse errors */ }
    }
    // Fall back to process.env
    return { value: process.env[varName] || null, method: 'env' };
  }

  // gog:OAuth2 — CLI auth check
  if (credentialSource.startsWith('gog:')) {
    try {
      runCmd('gog auth check', 10_000);
      return { value: 'authenticated', method: 'cli' };
    } catch {
      return { value: null, method: 'cli' };
    }
  }

  // built-in — always available
  if (credentialSource === 'built-in') {
    return { value: 'built-in', method: 'built-in' };
  }

  // Plain env var name (e.g. OP_SERVICE_ACCOUNT_TOKEN)
  if (/^[A-Z_][A-Z0-9_]*$/.test(credentialSource)) {
    return { value: process.env[credentialSource] || null, method: 'env' };
  }

  return { value: null, method: 'unknown' };
}

// ─── Provider-specific API validation ──────────────────────────────────────

async function validateApiKey(provider: string, apiKey: string): Promise<{ ok: boolean; detail: string }> {
  try {
    switch (provider) {
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok || res.status === 200) return { ok: true, detail: 'API key valid' };
        if (res.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
        if (res.status === 429) return { ok: true, detail: 'API key valid (rate limited)' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'groq': {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'xai': {
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'firecrawl': {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'], onlyMainContent: true }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401 || res.status === 403) return { ok: false, detail: 'Invalid API key' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'brave': {
        const res = await fetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1', {
          headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401 || res.status === 403) return { ok: false, detail: 'Invalid API key' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'elevenlabs': {
        const res = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': apiKey },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'perplexity': {
        const res = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
        if (res.status === 429) return { ok: true, detail: 'API key valid (rate limited)' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'agentmail': {
        const res = await fetch('https://api.agentmail.to/v0/inboxes', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401 || res.status === 403) return { ok: false, detail: 'Invalid API key' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      case 'slack': {
        const res = await fetch('https://slack.com/api/auth.test', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) return { ok: true, detail: `Authenticated as ${data.user || data.bot_id || 'bot'}` };
          return { ok: false, detail: `Slack error: ${data.error}` };
        }
        return { ok: false, detail: `Slack API returned ${res.status}` };
      }

      case 'notion': {
        const res = await fetch('https://api.notion.com/v1/users/me', {
          headers: { Authorization: `Bearer ${apiKey}`, 'Notion-Version': '2022-06-28' },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { ok: true, detail: 'API key valid' };
        if (res.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
        return { ok: false, detail: `API returned ${res.status}` };
      }

      // For providers without a known validation endpoint, just check the key exists
      default:
        return { ok: true, detail: `Credential present (${apiKey.length} chars)` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('timeout') || msg.includes('TimeoutError')) {
      return { ok: false, detail: `Request timed out` };
    }
    return { ok: false, detail: `Network error: ${msg}` };
  }
}

// ─── Main test logic ───────────────────────────────────────────────────────

async function testIntegration(integration: Integration): Promise<TestResult> {
  const start = Date.now();
  const elapsed = () => Date.now() - start;

  const credSource = integration.credential_source || '';

  // 1Password credential provider — check `op whoami`
  if (integration.type === 'credential_provider' && integration.provider === '1password') {
    try {
      const out = runCmd('op whoami', 10_000);
      return { status: 'pass', message: `1Password CLI authenticated: ${out.split('\n')[0]}`, duration_ms: elapsed() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'fail', message: `1Password CLI not authenticated: ${msg.slice(0, 200)}`, duration_ms: elapsed() };
    }
  }

  // Webhooks with built-in credential — always pass (managed by gateway)
  if (credSource === 'built-in') {
    return { status: 'pass', message: 'Built-in integration (managed by gateway)', duration_ms: elapsed() };
  }

  // CLI auth (e.g. gog:OAuth2)
  if (integration.type === 'cli_auth') {
    if (credSource.startsWith('gog:')) {
      try {
        const out = runCmd('gog auth list', 10_000);
        if (out.includes('No tokens stored') || out.trim().length === 0) {
          return { status: 'fail', message: 'Google auth: No tokens stored', duration_ms: elapsed() };
        }
        return { status: 'pass', message: `Google auth: ${out.split('\n')[0]}`, duration_ms: elapsed() };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { status: 'fail', message: `Google auth failed: ${msg.slice(0, 200)}`, duration_ms: elapsed() };
      }
    }
    return { status: 'warn', message: `Unknown CLI auth method: ${credSource}`, duration_ms: elapsed() };
  }

  // All other types — resolve credential then validate
  const { value, method } = resolveCredential(credSource);

  if (!value) {
    const hint = method === '1password'
      ? `Could not read from 1Password (${credSource})`
      : method === 'env'
        ? `Environment variable not set (${credSource})`
        : `Credential not found (${credSource})`;
    return { status: 'fail', message: hint, duration_ms: elapsed() };
  }

  // For API keys and similar — validate against the provider API
  const provider = integration.provider || '';
  const validation = await validateApiKey(provider, value);

  return {
    status: validation.ok ? 'pass' : 'fail',
    message: validation.detail,
    duration_ms: elapsed(),
  };
}

// ─── Route handler ─────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const integration = queryOne<Integration>('SELECT * FROM integrations WHERE id = ?', [id]);
    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const result = await testIntegration(integration);

    const now = new Date().toISOString();
    const healthCheckId = uuidv4();

    // Record health check
    run(
      `INSERT INTO health_checks (id, target_type, target_id, status, message, duration_ms, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [healthCheckId, 'integration', id, result.status, result.message, result.duration_ms, now]
    );

    // Update integration status
    const intStatus = result.status === 'pass' ? 'connected' : result.status === 'fail' ? 'broken' : 'unknown';
    run(
      'UPDATE integrations SET status = ?, last_validated = ?, validation_message = ?, updated_at = ? WHERE id = ?',
      [intStatus, now, result.message, now, id]
    );

    // Fetch updated integration
    const updated = queryOne<Integration>('SELECT * FROM integrations WHERE id = ?', [id]);

    // Broadcast events
    const healthCheck = queryOne<HealthCheck>('SELECT * FROM health_checks WHERE id = ?', [healthCheckId]);
    broadcast({ type: 'health_check_completed', payload: healthCheck! });
    broadcast({ type: 'integration_updated', payload: updated! });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to test integration:', error);
    return NextResponse.json(
      { error: 'Test failed', message: 'Internal server error during connection test' },
      { status: 500 }
    );
  }
}
