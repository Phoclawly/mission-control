/**
 * health-checks.ts — Health check definitions for capabilities and integrations
 *
 * Each check spawns a process or inspects the environment,
 * measures duration, and returns a status object.
 */

import { execSync } from 'child_process';

export interface HealthCheckResult {
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  duration_ms: number;
}

export interface HealthCheckDef {
  id: string;
  targetType: 'capability' | 'integration';
  provider: string;
  name: string;
  check: () => Promise<HealthCheckResult>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function runCommand(cmd: string, timeoutMs = 10_000): { stdout: string; stderr: string } {
  const stdout = execSync(cmd, {
    timeout: timeoutMs,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { stdout: stdout.trim(), stderr: '' };
}

function timed(fn: () => { status: HealthCheckResult['status']; message: string }): HealthCheckResult {
  const start = Date.now();
  try {
    const result = fn();
    return { ...result, duration_ms: Date.now() - start };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fail', message: msg, duration_ms: Date.now() - start };
  }
}

async function timedAsync(
  fn: () => Promise<{ status: HealthCheckResult['status']; message: string }>
): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return { ...result, duration_ms: Date.now() - start };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fail', message: msg, duration_ms: Date.now() - start };
  }
}

// ─── Check definitions ──────────────────────────────────────────────────────

const onePasswordCheck: HealthCheckDef = {
  id: 'integration-1password',
  targetType: 'integration',
  provider: '1password',
  name: '1Password CLI',
  check: async () =>
    timed(() => {
      const { stdout } = runCommand('op whoami');
      return { status: 'pass', message: `Authenticated: ${stdout.split('\n')[0]}` };
    }),
};

const notionCheck: HealthCheckDef = {
  id: 'integration-notion',
  targetType: 'integration',
  provider: 'notion',
  name: 'Notion Integration',
  check: async () =>
    timed(() => {
      const { stdout } = runCommand(
        'op read "op://Openclaw/Notion - integration API/credential"'
      );
      if (stdout && stdout.length > 0) {
        return { status: 'pass', message: 'Notion credential retrieved from 1Password' };
      }
      return { status: 'fail', message: 'Credential empty' };
    }),
};

const slackCheck: HealthCheckDef = {
  id: 'integration-slack',
  targetType: 'integration',
  provider: 'slack',
  name: 'Slack Bot Token',
  check: async () =>
    timed(() => {
      const token = process.env.SLACK_BOT_TOKEN;
      if (token && token.startsWith('xoxb-')) {
        return { status: 'pass', message: 'SLACK_BOT_TOKEN present and well-formed' };
      }
      if (token) {
        return { status: 'warn', message: 'SLACK_BOT_TOKEN present but unexpected format' };
      }
      return { status: 'fail', message: 'SLACK_BOT_TOKEN not set' };
    }),
};

const googleSheetsCheck: HealthCheckDef = {
  id: 'integration-google-sheets',
  targetType: 'integration',
  provider: 'google-sheets',
  name: 'Google Sheets (gog)',
  check: async () =>
    timed(() => {
      const { stdout } = runCommand('gog auth check');
      return { status: 'pass', message: `gog auth: ${stdout}` };
    }),
};

const browserMcpCheck: HealthCheckDef = {
  id: 'capability-browsermcp',
  targetType: 'capability',
  provider: 'browsermcp',
  name: 'BrowserMCP Server',
  check: async () =>
    timed(() => {
      try {
        const { stdout } = runCommand('pgrep -f browsermcp || pgrep -f browser-mcp');
        if (stdout) {
          return { status: 'pass', message: `BrowserMCP process running (PID: ${stdout.split('\n')[0]})` };
        }
      } catch {
        // pgrep exits 1 when no match
      }
      return { status: 'fail', message: 'BrowserMCP process not found' };
    }),
};

const playwrightCheck: HealthCheckDef = {
  id: 'capability-playwright',
  targetType: 'capability',
  provider: 'playwright',
  name: 'Playwright',
  check: async () =>
    timed(() => {
      const { stdout } = runCommand('npx playwright --version');
      return { status: 'pass', message: `Playwright ${stdout}` };
    }),
};

const browserUseCheck: HealthCheckDef = {
  id: 'capability-browser-use',
  targetType: 'capability',
  provider: 'browser-use',
  name: 'browser-use',
  check: async () =>
    timedAsync(async () => {
      try {
        // Use require.resolve to check if module is available without importing
        execSync('node -e "require.resolve(\'browser-use\')"', {
          timeout: 5000,
          encoding: 'utf8',
          stdio: 'pipe',
        });
        return { status: 'pass', message: 'browser-use module importable' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Cannot find module') || msg.includes('MODULE_NOT_FOUND')) {
          return { status: 'fail', message: 'browser-use module not installed' };
        }
        return { status: 'warn', message: `browser-use found but errored: ${msg}` };
      }
    }),
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const healthChecks: HealthCheckDef[] = [
  onePasswordCheck,
  notionCheck,
  slackCheck,
  googleSheetsCheck,
  browserMcpCheck,
  playwrightCheck,
  browserUseCheck,
];

export function getCheckById(id: string): HealthCheckDef | undefined {
  return healthChecks.find((c) => c.id === id);
}

export function getChecksByProvider(provider: string): HealthCheckDef[] {
  return healthChecks.filter((c) => c.provider === provider);
}
