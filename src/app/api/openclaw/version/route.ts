import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/openclaw/openclaw/releases/latest';

// Compare version strings like "2026.2.17" vs "2026.2.23"
// Returns positive if a > b, negative if a < b, 0 if equal
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getCurrentVersion(): string {
  // Primary: OpenClaw CLI (most authoritative)
  try {
    const out = execFileSync('node', ['/app/openclaw.mjs', '--version'], {
      timeout: 5000,
      encoding: 'utf-8',
    }).trim();
    if (out && /^\d+\.\d+/.test(out)) return out;
  } catch { /* fall through */ }

  // Fallback: package.json
  try {
    const pkg = JSON.parse(readFileSync('/app/package.json', 'utf-8'));
    if (pkg.version) return pkg.version;
  } catch { /* fall through */ }

  // Last resort: env var
  return process.env.OPENCLAW_VERSION || 'unknown';
}

// GET /api/openclaw/version?check=true
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const checkLatest = searchParams.get('check') === 'true';

  const currentVersion = getCurrentVersion();
  const result: Record<string, unknown> = { current: currentVersion };

  if (checkLatest) {
    try {
      const res = await fetch(GITHUB_RELEASES_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MissionControl/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const latest = (data.tag_name || data.name || '').replace(/^v/, '').trim();
        result.latest = latest;
        // Only flag update if latest is strictly newer (not just different)
        result.updateAvailable = latest !== '' &&
          currentVersion !== 'unknown' &&
          compareVersions(latest, currentVersion) > 0;
        result.releaseUrl = data.html_url;
        result.publishedAt = data.published_at;
        result.releaseNotes = data.body?.slice(0, 500);
      } else {
        result.checkError = `GitHub API returned ${res.status}`;
      }
    } catch {
      result.checkError = 'Failed to reach GitHub API';
    }
  }

  return NextResponse.json(result);
}
