import { NextRequest, NextResponse } from 'next/server';

// ─── IP Allowlist (Tailscale-only access) ───────────────────────────────────
// Only allow requests from Tailscale subnet (100.64.0.0/10) and localhost.
// This acts as a software firewall since UFW/iptables are not available.

const TAILSCALE_SUBNET_START = ip4ToInt('100.64.0.0');
const TAILSCALE_SUBNET_END   = ip4ToInt('100.127.255.255'); // /10 = 100.64 - 100.127

function ip4ToInt(ip: string): number {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    throw new Error('Not an IPv4 address');
  }

  return octets.reduce((acc, oct) => {
    if (!/^\d+$/.test(oct)) {
      throw new Error('Invalid IPv4 octet');
    }

    const value = Number(oct);
    if (value < 0 || value > 255) {
      throw new Error('IPv4 octet out of range');
    }

    return (acc << 8) | value;
  }, 0) >>> 0;
}

function isAllowedIp(ip: string): boolean {
  if (!ip) return false;
  // Strip IPv6-mapped IPv4 prefix (::ffff:x.x.x.x)
  const cleanIp = ip.replace(/^::ffff:/, '');

  // Localhost IPv4 / IPv6 (including IPv6-mapped IPv4 localhost)
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || cleanIp === '127.0.0.1') return true;

  // Private ranges (container-to-container, Docker bridge)
  if (cleanIp.startsWith('172.') || cleanIp.startsWith('10.') || cleanIp.startsWith('192.168.')) return true;
  // Tailscale CGNAT range: 100.64.0.0/10
  try {
    const ipInt = ip4ToInt(cleanIp);
    if (ipInt >= TAILSCALE_SUBNET_START && ipInt <= TAILSCALE_SUBNET_END) return true;
  } catch {
    // Not a valid IPv4 — may be IPv6 Tailscale (fd7a:115c::/48)
    if (ip.startsWith('fd7a:115c:')) return true;
  }
  return false;
}

function getClientIp(request: NextRequest): string {
  // Prefer CF-Connecting-IP or X-Forwarded-For (proxy/Tailscale serve)
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  const xForwarded = request.headers.get('x-forwarded-for');
  if (xForwarded) return xForwarded.split(',')[0].trim();
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();
  // Fall back to NextRequest.ip (may be undefined in some environments)
  return (request as unknown as { ip?: string }).ip || '';
}

// Log warning at startup if auth is disabled
const MC_API_TOKEN = process.env.MC_API_TOKEN;
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS;
if (!MC_API_TOKEN) {
  console.warn('[SECURITY WARNING] MC_API_TOKEN not set - API authentication is DISABLED (local dev mode)');
}

/**
 * Check if a request originates from the same host (browser UI).
 * Same-origin browser requests include a Referer or Origin header
 * pointing to the MC server itself. Server-side render fetches
 * (Next.js RSC) come from the same process and have no Origin.
 */
function isSameOriginRequest(request: NextRequest): boolean {
  const host = request.headers.get('host');
  if (!host) return false;

  // Server-side fetches from Next.js (no origin/referer) — same process
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // If neither origin nor referer is set, this is likely a server-side
  // fetch or a direct curl. Require auth for these (external API calls).
  if (!origin && !referer) return false;

  // Check if Origin matches the host
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) return true;
    } catch {
      // Invalid origin header
    }
  }

  // Check if Referer matches the host
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) return true;
    } catch {
      // Invalid referer header
    }
  }

  return false;
}

// Demo mode — read-only, blocks all mutations
const DEMO_MODE = process.env.DEMO_MODE === 'true';
if (DEMO_MODE) {
  console.log('[DEMO] Running in demo mode — all write operations are blocked');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── IP Allowlist check (applies to ALL routes) ───────────────────────────
  // Block requests from non-Tailscale, non-localhost IPs.
  // MC is intended to be accessible only via Tailscale.
  const clientIp = getClientIp(request);
  if (clientIp && !isAllowedIp(clientIp)) {
    console.warn(`[SECURITY] Blocked request from non-Tailscale IP: ${clientIp} → ${pathname}`);
    return new NextResponse('Access denied. Mission Control is accessible via Tailscale only.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Only protect /api/* routes with token auth
  if (!pathname.startsWith('/api/')) {
    // Add demo mode header for UI detection
    if (DEMO_MODE) {
      const response = NextResponse.next();
      response.headers.set('X-Demo-Mode', 'true');
      return response;
    }
    return NextResponse.next();
  }

  // Demo mode: block all write operations
  if (DEMO_MODE) {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      return NextResponse.json(
        { error: 'Demo mode — this is a read-only instance. Visit github.com/crshdn/mission-control to run your own!' },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  // If MC_API_TOKEN is not set, auth is disabled (dev mode)
  if (!MC_API_TOKEN) {
    return NextResponse.next();
  }

  // Allow same-origin browser requests (UI fetching its own API)
  if (isSameOriginRequest(request)) {
    return NextResponse.next();
  }

  // Special case: /api/events/stream (SSE) - allow token as query param
  if (pathname === '/api/events/stream') {
    const queryToken = request.nextUrl.searchParams.get('token');
    if (queryToken && queryToken === MC_API_TOKEN) {
      return NextResponse.next();
    }
    // Fall through to header check below
  }

  // Check Authorization header for bearer token or basic auth
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Bearer token auth
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === MC_API_TOKEN) {
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Basic Auth (if BASIC_AUTH_USER and BASIC_AUTH_PASS are configured)
  if (authHeader.startsWith('Basic ') && BASIC_AUTH_USER && BASIC_AUTH_PASS) {
    const encoded = authHeader.substring(6);
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const [user, pass] = decoded.split(':');
    if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
      return NextResponse.next();
    }
  }

  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}

export const config = {
  // Apply IP allowlist to all routes; token auth only applies to /api/*
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
