/**
 * Middleware tests — IP allowlist + token auth + demo mode
 *
 * Tests map to plan:
 *   TC-SEC-001 … TC-SEC-005  (IP allowlist + auth ordering)
 *   TC-NEG-003, TC-NEG-004  (missing / invalid token)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { NextMiddleware } from 'next/server';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeReq(
  url: string,
  opts: {
    method?: string;
    ip?: string;
    xForwardedFor?: string;
    authorization?: string;
    origin?: string;
    referer?: string;
    host?: string;
  } = {}
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.xForwardedFor)  headers['x-forwarded-for'] = opts.xForwardedFor;
  if (opts.authorization)  headers['authorization']   = opts.authorization;
  if (opts.origin)         headers['origin']          = opts.origin;
  if (opts.referer)        headers['referer']         = opts.referer;
  if (opts.host)           headers['host']            = opts.host;

  const req = new NextRequest(url, {
    method: opts.method ?? 'GET',
    headers,
  });

  // Simulate NextRequest.ip (not settable via constructor in Next 14)
  if (opts.ip) {
    Object.defineProperty(req, 'ip', { value: opts.ip, writable: false });
  }

  return req;
}

function status(res: Response | NextResponse): number {
  return res.status;
}

// ─── Suite 1: no token set (auth disabled) ───────────────────────────────────

describe('middleware — auth disabled (MC_API_TOKEN unset)', () => {
  let middleware: NextMiddleware;

  beforeAll(async () => {
    delete process.env.MC_API_TOKEN;
    delete process.env.DEMO_MODE;
    vi.resetModules();
    ({ middleware } = await import('@/middleware'));
  });

  afterAll(() => {
    vi.resetModules();
  });

  // TC-SEC-002: Tailscale IP allowed
  it('allows requests from Tailscale subnet (100.64.x.x)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '100.64.1.5' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  it('allows requests from Tailscale subnet (100.127.x.x — boundary)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '100.127.255.255' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  // TC-SEC-001: external IP blocked
  it('blocks requests from public IPv4 (TC-SEC-001)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '1.2.3.4' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(403);
  });

  it('blocks requests from 100.128.x.x (just outside Tailscale /10)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '100.128.0.1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(403);
  });

  it('allows localhost (127.0.0.1)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '127.0.0.1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  it('allows localhost (::1)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '::1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  it('allows IPv6-mapped localhost (::ffff:127.0.0.1)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '::ffff:127.0.0.1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  it('allows private Docker bridge range (172.x.x.x)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '172.17.0.2' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  it('allows private range 10.x.x.x', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '10.0.0.1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  it('allows Tailscale IPv6 (fd7a:115c::/48)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: 'fd7a:115c::1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  it('prefers CF-Connecting-IP over X-Forwarded-For', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '127.0.0.1' });
    // Inject CF-Connecting-IP header pointing to blocked IP
    (req.headers as unknown as Map<string, string>).set('cf-connecting-ip', '8.8.8.8');
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(403);
  });

  // Auth disabled — API routes should pass through
  it('passes /api/* with no auth header when MC_API_TOKEN unset', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '127.0.0.1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(401);
  });

  // Non-API routes always pass through
  it('allows non-API routes (UI pages)', () => {
    const req = makeReq('http://localhost/', { xForwardedFor: '127.0.0.1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });
});

// ─── Suite 2: token set (auth required) ──────────────────────────────────────

describe('middleware — auth enabled (MC_API_TOKEN = test-secret)', () => {
  const TOKEN = 'test-secret-xyz';
  let middleware: NextMiddleware;

  // Use a Tailscale IP for auth tests — passes IP allowlist but does NOT
  // hit the localhost bypass (middleware skips auth for 127.0.0.1/::1).
  const TAILSCALE_IP = '100.100.1.1';

  beforeAll(async () => {
    process.env.MC_API_TOKEN = TOKEN;
    delete process.env.DEMO_MODE;
    vi.resetModules();
    ({ middleware } = await import('@/middleware'));
  });

  afterAll(() => {
    delete process.env.MC_API_TOKEN;
    vi.resetModules();
  });

  // TC-NEG-004: missing auth header
  it('returns 401 for /api/* with no Authorization header (TC-NEG-004)', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: TAILSCALE_IP });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(401);
  });

  // TC-NEG-003: invalid token
  it('returns 401 for invalid Bearer token (TC-NEG-003)', () => {
    const req = makeReq('http://localhost/api/tasks', {
      xForwardedFor: TAILSCALE_IP,
      authorization: 'Bearer wrong-token',
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(401);
  });

  it('returns 401 for malformed auth header (not Bearer)', () => {
    const req = makeReq('http://localhost/api/tasks', {
      xForwardedFor: TAILSCALE_IP,
      authorization: `Basic ${TOKEN}`,
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(401);
  });

  it('allows /api/* with correct Bearer token', () => {
    const req = makeReq('http://localhost/api/tasks', {
      xForwardedFor: TAILSCALE_IP,
      authorization: `Bearer ${TOKEN}`,
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(401);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  // Localhost bypasses auth (agent callbacks from same container)
  it('allows localhost without auth when MC_API_TOKEN is set', () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '127.0.0.1' });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(401);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  // TC-SEC-003: valid token + blocked IP → 403 wins
  it('IP block wins over valid token (TC-SEC-003)', () => {
    const req = makeReq('http://localhost/api/tasks', {
      xForwardedFor: '8.8.8.8',
      authorization: `Bearer ${TOKEN}`,
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(403);
  });

  // TC-SEC-004: invalid token + valid IP → 401 (auth checked after IP)
  it('returns 401 for invalid token from allowed IP (TC-SEC-004)', () => {
    const req = makeReq('http://localhost/api/tasks', {
      xForwardedFor: TAILSCALE_IP,
      authorization: 'Bearer bad',
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(401);
  });

  // Same-origin browser requests bypass token check
  it('allows same-origin request (Origin matches host)', () => {
    const req = makeReq('http://localhost:4000/api/tasks', {
      xForwardedFor: TAILSCALE_IP,
      origin: 'http://localhost:4000',
      host: 'localhost:4000',
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(401);
  });

  it('allows same-origin request (Referer matches host)', () => {
    const req = makeReq('http://localhost:4000/api/tasks', {
      xForwardedFor: TAILSCALE_IP,
      referer: 'http://localhost:4000/tasks',
      host: 'localhost:4000',
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(401);
  });

  it('blocks request where Referer is a different host', () => {
    const req = makeReq('http://localhost:4000/api/tasks', {
      xForwardedFor: TAILSCALE_IP,
      referer: 'http://evil.com/page',
      host: 'localhost:4000',
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(401);
  });

  // SSE endpoint: token via query param
  it('allows /api/events/stream with token as query param', () => {
    const req = makeReq(`http://localhost/api/events/stream?token=${TOKEN}`, {
      xForwardedFor: TAILSCALE_IP,
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(401);
  });

  it('blocks /api/events/stream with wrong query token', () => {
    const req = makeReq('http://localhost/api/events/stream?token=wrong', {
      xForwardedFor: TAILSCALE_IP,
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(401);
  });

  // TC-SEC-005: No stack traces / framework info in error responses
  it('401 response body is minimal JSON — no stack traces', async () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: TAILSCALE_IP });
    const res = middleware(req, {} as never) as NextResponse;
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(JSON.stringify(body)).not.toContain('at ');
  });

  it('403 response body does not leak framework info', async () => {
    const req = makeReq('http://localhost/api/tasks', { xForwardedFor: '8.8.8.8' });
    const res = middleware(req, {} as never) as NextResponse;
    const text = await res.text();
    expect(text).not.toContain('Next.js');
    expect(text).not.toContain('stack');
  });
});

// ─── Suite 3: demo mode ───────────────────────────────────────────────────────

describe('middleware — demo mode (DEMO_MODE=true)', () => {
  let middleware: NextMiddleware;

  beforeAll(async () => {
    delete process.env.MC_API_TOKEN;
    process.env.DEMO_MODE = 'true';
    vi.resetModules();
    ({ middleware } = await import('@/middleware'));
  });

  afterAll(() => {
    delete process.env.DEMO_MODE;
    vi.resetModules();
  });

  it('blocks POST /api/* with 403 in demo mode', () => {
    const req = makeReq('http://localhost/api/tasks', {
      method: 'POST',
      xForwardedFor: '127.0.0.1',
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(403);
  });

  it('blocks PATCH /api/* in demo mode', () => {
    const req = makeReq('http://localhost/api/tasks/123', {
      method: 'PATCH',
      xForwardedFor: '127.0.0.1',
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).toBe(403);
  });

  it('allows GET /api/* in demo mode', () => {
    const req = makeReq('http://localhost/api/tasks', {
      method: 'GET',
      xForwardedFor: '127.0.0.1',
    });
    const res = middleware(req, {} as never);
    expect(status(res as NextResponse)).not.toBe(403);
  });

  it('adds X-Demo-Mode header on UI routes', () => {
    const req = makeReq('http://localhost/', {
      method: 'GET',
      xForwardedFor: '127.0.0.1',
    });
    const res = middleware(req, {} as never) as NextResponse;
    expect(res.headers.get('X-Demo-Mode')).toBe('true');
  });
});
