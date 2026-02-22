import { expect, test } from '@playwright/test';

type WorkspaceStats = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  taskCounts: {
    pending_dispatch: number;
    planning: number;
    inbox: number;
    assigned: number;
    in_progress: number;
    testing: number;
    review: number;
    done: number;
    total: number;
  };
  agentCount: number;
};

type ActivatePayload = {
  workspace: string;
  agent_id: string;
  source: string;
  external_request_id: string;
};

const workspaceFixture: WorkspaceStats = {
  id: 'ws-apollo',
  name: 'Apollo',
  slug: 'apollo',
  icon: 'apollo',
  taskCounts: {
    pending_dispatch: 0,
    planning: 1,
    inbox: 2,
    assigned: 0,
    in_progress: 1,
    testing: 0,
    review: 0,
    done: 0,
    total: 4,
  },
  agentCount: 2,
};

test.describe('activate workspace flow', () => {
  test('sends expected activation payload from workspace card', async ({ page }) => {
    let payload: ActivatePayload | null = null;

    await page.route('**/api/workspaces?stats=true', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([workspaceFixture]),
      });
    });

    await page.route(`**/api/workspaces/${workspaceFixture.slug}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(workspaceFixture),
      });
    });

    await page.route('**/api/agents?workspace_id=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/tasks?workspace_id=*', async (route) => {
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

    await page.route('**/api/workspaces/activate', async (route) => {
      payload = route.request().postDataJSON() as ActivatePayload;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, task_id: 'task-123' }),
      });
    });

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    const card = page
      .locator('h3', { hasText: workspaceFixture.name })
      .locator('xpath=ancestor::div[contains(@class,"group")][1]');
    const activateButton = card.locator('button[title="Activate workspace"]');

    await expect(activateButton).toHaveText('Activate');
    await activateButton.click();

    await expect
      .poll(() => payload, { message: 'Activation payload should be sent' })
      .not.toBeNull();

    const activationPayload = payload as ActivatePayload;
    expect(activationPayload).toMatchObject({
      workspace: 'apollo',
      agent_id: 'apollo',
      source: 'mission-control',
    });
    expect(activationPayload.external_request_id).toBeTruthy();
    expect(activationPayload.external_request_id.length).toBeGreaterThan(10);

    await expect(activateButton).toHaveText('Activate');
  });

  test('shows Activating state while request is in flight', async ({ page }) => {
    let releaseRequest!: () => void;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });

    await page.route('**/api/workspaces?stats=true', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([workspaceFixture]),
      });
    });

    await page.route('**/api/agents?workspace_id=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/tasks?workspace_id=*', async (route) => {
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

    await page.route('**/api/workspaces/activate', async (route) => {
      await requestGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    const card = page
      .locator('h3', { hasText: workspaceFixture.name })
      .locator('xpath=ancestor::div[contains(@class,"group")][1]');
    const activateButton = card.locator('button[title="Activate workspace"]');

    await activateButton.click();
    await expect(activateButton).toHaveText('Activating...');

    releaseRequest();
    await expect(activateButton).toHaveText('Activate');
  });
});
