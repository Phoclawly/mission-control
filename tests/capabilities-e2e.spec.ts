import { expect, test } from '@playwright/test';

/**
 * capabilities-e2e.spec.ts — E2E tests for the Capabilities dashboard
 *
 * These tests cover the R1 UI features: capabilities listing, integrations,
 * cron jobs, memory browser, alerts, health checks, and detail pages.
 *
 * Uses route interception to mock API responses for deterministic testing.
 */

// ─── Fixtures ───────────────────────────────────────────────────────────────

const capabilitiesFixture = [
  {
    id: 'capability-playwright',
    name: 'Playwright',
    category: 'browser_automation',
    description: 'Browser automation and testing framework',
    provider: 'playwright',
    version: '1.42.0',
    status: 'healthy',
    last_health_check: '2026-02-24T10:00:00Z',
    health_message: 'Playwright 1.42.0',
    metadata: JSON.stringify({ docs: 'https://playwright.dev' }),
  },
  {
    id: 'capability-browsermcp',
    name: 'BrowserMCP',
    category: 'mcp_server',
    description: 'Browser automation MCP server',
    provider: 'browsermcp',
    version: null,
    status: 'healthy',
    last_health_check: '2026-02-24T10:00:00Z',
    health_message: 'Process running',
    metadata: null,
  },
  {
    id: 'capability-broken',
    name: 'BrokenTool',
    category: 'cli_tool',
    description: 'A broken capability for alert testing',
    provider: 'test',
    version: null,
    status: 'broken',
    last_health_check: '2026-02-24T09:00:00Z',
    health_message: 'Command not found',
    metadata: null,
  },
];

const integrationsFixture = [
  {
    id: 'integration-notion',
    name: 'Notion',
    type: 'mcp_plugin',
    provider: 'notion',
    status: 'connected',
    credential_source: '1password:Openclaw/Notion - integration API',
    last_validated: '2026-02-24T10:00:00Z',
    validation_message: 'Credential retrieved',
    config: JSON.stringify({ vault: 'Openclaw' }),
    metadata: JSON.stringify({ docs: 'https://developers.notion.com' }),
  },
  {
    id: 'integration-slack',
    name: 'Slack',
    type: 'mcp_plugin',
    provider: 'slack',
    status: 'connected',
    credential_source: '.env',
    last_validated: '2026-02-24T10:00:00Z',
    validation_message: 'Token present',
    config: null,
    metadata: null,
  },
  {
    id: 'integration-broken',
    name: 'BrokenIntegration',
    type: 'api_key',
    provider: 'test',
    status: 'broken',
    credential_source: '.env:MISSING_KEY',
    last_validated: '2026-02-24T09:00:00Z',
    validation_message: 'API key not set',
    config: null,
    metadata: null,
  },
];

const cronJobsFixture = [
  {
    id: 'cron-sync',
    name: 'Sync from JSON',
    schedule: '*/5 * * * *',
    command: 'node scripts/sync-from-json.js',
    agent_id: 'pho',
    status: 'active',
    last_run: '2026-02-24T10:05:00Z',
    next_run: '2026-02-24T10:10:00Z',
    metadata: JSON.stringify({ history: [{ ran_at: '2026-02-24T10:05:00Z', exit_code: 0 }] }),
  },
  {
    id: 'cron-health',
    name: 'Health Check Runner',
    schedule: '*/15 * * * *',
    command: 'node scripts/health-check-runner.js',
    agent_id: 'argus',
    status: 'active',
    last_run: '2026-02-24T10:00:00Z',
    next_run: '2026-02-24T10:15:00Z',
    metadata: JSON.stringify({ history: [{ ran_at: '2026-02-24T10:00:00Z', exit_code: 0 }] }),
  },
];

const memoryFixture = [
  {
    id: 'mem-1',
    agent_id: 'pho',
    date: '2026-02-24',
    file_path: '/memory/pho/2026-02-24.md',
    summary: 'Coordinated sprint planning and task dispatch',
    word_count: 1200,
  },
  {
    id: 'mem-2',
    agent_id: 'argus',
    date: '2026-02-24',
    file_path: '/memory/argus/2026-02-24.md',
    summary: 'Monitored health checks and resolved alerts',
    word_count: 800,
  },
];

const healthChecksFixture = [
  {
    id: 'hc-1',
    target_type: 'capability',
    target_id: 'capability-playwright',
    target_name: 'Playwright',
    status: 'pass',
    message: 'Playwright 1.42.0',
    duration_ms: 230,
    checked_at: '2026-02-24T10:00:00Z',
  },
  {
    id: 'hc-2',
    target_type: 'capability',
    target_id: 'capability-broken',
    target_name: 'BrokenTool',
    status: 'fail',
    message: 'Command not found',
    duration_ms: 50,
    checked_at: '2026-02-24T09:00:00Z',
  },
];

const overviewFixture = {
  capabilities: {
    total: 3,
    byCategory: { browser_automation: 1, mcp_server: 1, cli_tool: 1 },
    byStatus: { healthy: 2, broken: 1 },
  },
  integrations: {
    total: 3,
    byStatus: { connected: 2, broken: 1 },
  },
  agents: [],
  alerts: [
    { type: 'error', target: 'BrokenTool', message: 'Capability "BrokenTool" is broken' },
    { type: 'error', target: 'BrokenIntegration', message: 'Integration "BrokenIntegration" is broken' },
  ],
  cronSummary: { active: 2, disabled: 0, stale: 0 },
  lastFullCheck: '2026-02-24T10:00:00Z',
};

// ─── Route setup helper ─────────────────────────────────────────────────────

async function mockCapabilitiesRoutes(page: import('@playwright/test').Page) {
  await page.route('**/api/capabilities/overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(overviewFixture),
    });
  });

  await page.route('**/api/capabilities?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(capabilitiesFixture),
    });
  });

  await page.route('**/api/capabilities/capability-playwright', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(capabilitiesFixture[0]),
    });
  });

  await page.route('**/api/integrations?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(integrationsFixture),
    });
  });

  await page.route('**/api/integrations/integration-notion', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(integrationsFixture[0]),
    });
  });

  await page.route('**/api/cron-jobs**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(cronJobsFixture),
    });
  });

  await page.route('**/api/cron-jobs/cron-sync', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(cronJobsFixture[0]),
    });
  });

  await page.route('**/api/memory**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(memoryFixture),
    });
  });

  await page.route('**/api/health', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: { total: 2, pass: 1, fail: 1, warn: 0, skip: 0 },
          capabilities: healthChecksFixture,
          integrations: [],
        }),
      });
    } else {
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    }
  });

  await page.route('**/api/health/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(healthChecksFixture),
    });
  });

  // Fallback routes for other API calls that may fire
  await page.route('**/api/workspaces**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/events**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/openclaw/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: true }),
    });
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Capabilities dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockCapabilitiesRoutes(page);
  });

  test('1. Capabilities page loads and shows listing', async ({ page }) => {
    await page.goto('/capabilities');

    // Should display capability names
    await expect(page.getByText('Playwright')).toBeVisible();
    await expect(page.getByText('BrowserMCP')).toBeVisible();
  });

  test('2. Integrations tab shows integration cards', async ({ page }) => {
    await page.goto('/capabilities');

    // Click integrations tab/section
    const integrationsTab = page.getByRole('tab', { name: /integrations/i })
      .or(page.getByRole('link', { name: /integrations/i }))
      .or(page.getByText(/integrations/i).first());
    await integrationsTab.click();

    // Should see integration names
    await expect(page.getByText('Notion')).toBeVisible();
    await expect(page.getByText('Slack')).toBeVisible();
  });

  test('3. Cron jobs display with schedule info', async ({ page }) => {
    await page.goto('/capabilities');

    // Navigate to cron section
    const cronTab = page.getByRole('tab', { name: /cron/i })
      .or(page.getByRole('link', { name: /cron/i }))
      .or(page.getByText(/cron/i).first());
    await cronTab.click();

    // Should show cron job names and schedules
    await expect(page.getByText('Sync from JSON')).toBeVisible();
    await expect(page.getByText('*/5 * * * *')).toBeVisible();
  });

  test('4. Memory browser shows agent memory entries', async ({ page }) => {
    await page.goto('/capabilities');

    // Navigate to memory section
    const memoryTab = page.getByRole('tab', { name: /memory/i })
      .or(page.getByRole('link', { name: /memory/i }))
      .or(page.getByText(/memory/i).first());
    await memoryTab.click();

    // Should show memory entries
    await expect(page.getByText(/sprint planning/i)).toBeVisible();
  });

  test('5. Alerts display for broken capabilities and integrations', async ({ page }) => {
    await page.goto('/capabilities');

    // The overview has alerts for broken items
    await expect(page.getByText(/BrokenTool/)).toBeVisible();
    await expect(page.getByText(/BrokenIntegration/).or(page.getByText(/broken/i).first())).toBeVisible();
  });

  test('6. Health check results visible on capability detail', async ({ page }) => {
    await page.goto('/capabilities');

    // Click on a capability to view detail
    await page.getByText('Playwright').first().click();

    // Should show health check info
    await expect(page.getByText(/pass/i).or(page.getByText(/healthy/i)).first()).toBeVisible();
    await expect(page.getByText(/1\.42\.0/)).toBeVisible();
  });

  test('7. Capability detail page with metadata', async ({ page }) => {
    await page.goto('/capabilities');

    // Navigate to capability detail
    await page.getByText('Playwright').first().click();

    // Should show capability details
    await expect(page.getByText(/browser_automation/i).or(page.getByText(/Browser Automation/i)).first()).toBeVisible();
    await expect(page.getByText(/playwright/i).first()).toBeVisible();
  });

  test('8. Integration detail page with credential info', async ({ page }) => {
    await page.goto('/capabilities');

    // Go to integrations tab
    const integrationsTab = page.getByRole('tab', { name: /integrations/i })
      .or(page.getByRole('link', { name: /integrations/i }))
      .or(page.getByText(/integrations/i).first());
    await integrationsTab.click();

    // Click on Notion integration
    await page.getByText('Notion').first().click();

    // Should show credential source info
    await expect(page.getByText(/1password/i).or(page.getByText(/Openclaw/)).first()).toBeVisible();
    await expect(page.getByText(/mcp_plugin/i).or(page.getByText(/MCP Plugin/i)).first()).toBeVisible();
  });

  test('9. Cron job detail with execution history', async ({ page }) => {
    await page.goto('/capabilities');

    // Go to cron tab
    const cronTab = page.getByRole('tab', { name: /cron/i })
      .or(page.getByRole('link', { name: /cron/i }))
      .or(page.getByText(/cron/i).first());
    await cronTab.click();

    // Click on a cron job
    await page.getByText('Sync from JSON').first().click();

    // Should show schedule and execution info
    await expect(page.getByText('*/5 * * * *')).toBeVisible();
    await expect(page.getByText(/sync-from-json/)).toBeVisible();
  });
});
