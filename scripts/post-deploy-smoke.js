#!/usr/bin/env node

'use strict';

const baseUrl = process.env.MISSION_CONTROL_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4040';
const timeoutMs = Number(process.env.MC_SMOKE_TIMEOUT_MS || 15000);

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

async function fetchJson(url) {
  const t = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'x-forwarded-for': '127.0.0.1',
      },
      signal: t.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      text,
      json,
    };
  } finally {
    t.clear();
  }
}

async function fetchText(url) {
  const t = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'x-forwarded-for': '127.0.0.1',
      },
      signal: t.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  } finally {
    t.clear();
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const summary = {
    started_at: startedAt,
    base_url: baseUrl,
    checks: {},
    ok: false,
  };

  const root = await fetchText(`${baseUrl}/`);
  summary.checks.root = {
    status: root.status,
    ok: root.ok,
    has_access_denied_message: root.text.includes('Access denied'),
  };

  if (!root.ok) {
    summary.ok = false;
    console.error(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  const statusRes = await fetchJson(`${baseUrl}/api/openclaw/status`);
  summary.checks.openclaw_status = {
    status: statusRes.status,
    ok: statusRes.ok,
    connected: Boolean(statusRes.json?.connected),
    sessions_count: statusRes.json?.sessions_count ?? null,
    gateway_url: statusRes.json?.gateway_url ?? null,
    error: statusRes.json?.error ?? null,
  };

  const connected = Boolean(statusRes.json?.connected);
  summary.ok = statusRes.ok && connected;

  if (!summary.ok) {
    console.error(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        base_url: baseUrl,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
