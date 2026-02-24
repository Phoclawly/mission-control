import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';

// GET /api/openclaw/version?check=true
// Returns current OpenClaw version, optionally checks GitHub for latest release
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const checkLatest = searchParams.get('check') === 'true';

  // Read current version from OpenClaw's package.json
  let currentVersion = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync('/app/package.json', 'utf-8'));
    currentVersion = pkg.version;
  } catch {
    // Fallback: env var (useful for development on Mac)
    currentVersion = process.env.OPENCLAW_VERSION || 'unknown';
  }

  const result: Record<string, unknown> = { current: currentVersion };

  if (checkLatest) {
    try {
      const res = await fetch(
        'https://api.github.com/repos/nicosommi/open-claw/releases/latest',
        {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MissionControl/1.0' },
          signal: AbortSignal.timeout(10000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const latest = (data.tag_name || data.name || '').replace(/^v/, '');
        result.latest = latest;
        result.updateAvailable = latest !== currentVersion && latest !== '';
        result.releaseUrl = data.html_url;
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
