import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:14040';

test.describe('Capabilities redesign', () => {
  test('overview stats render correctly', async ({ page }) => {
    await page.goto(`${BASE}/workspace/default/capabilities`);
    await page.waitForTimeout(2000);
    await expect(page.getByText('18').first()).toBeVisible(); // Tools
    await expect(page.getByText('37').first()).toBeVisible(); // Skills
    await expect(page.getByText('22').first()).toBeVisible(); // Integrations
  });

  test('collapsible category sections', async ({ page }) => {
    await page.goto(`${BASE}/workspace/default/capabilities`);
    await page.waitForTimeout(2000);
    await expect(page.getByText('MCP Servers').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Skills/ }).first()).toBeVisible();
    // Collapse MCP Servers
    await page.locator('button').filter({ hasText: /MCP Servers/ }).click();
    await expect(page.getByText('Context7 MCP')).not.toBeVisible();
  });

  test('New Capability modal has Status and Skill Path fields', async ({ page }) => {
    await page.goto(`${BASE}/workspace/default/capabilities`);
    await page.waitForTimeout(2000);
    await page.locator('button').filter({ hasText: /New Capability/ }).click();
    await expect(page.getByLabel('Status')).toBeVisible();
    // Change to skill category (Category select has id="capability-category")
    await page.locator('#capability-category').selectOption('skill');
    await expect(page.getByLabel(/Skill Path/i)).toBeVisible();
  });

  test('Integration edit modal pre-fills data', async ({ page }) => {
    await page.goto(`${BASE}/workspace/default/capabilities`);
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /Integrations/i }).click();
    await page.waitForTimeout(1500);
    await page.locator('button[title="Edit integration"]').first().click();
    await expect(page.getByText('Edit Integration')).toBeVisible();
    await expect(page.locator('input[name=name], input').first()).not.toBeEmpty();
  });

  test('Cron modal schedule preview', async ({ page }) => {
    await page.goto(`${BASE}/workspace/default/capabilities`);
    await page.waitForTimeout(2000);
    await page.locator('button').filter({ hasText: /^Crons$/ }).click();
    await page.waitForTimeout(1000);
    await page.locator('button').filter({ hasText: /New Cron/ }).click();
    const schedInput = page.locator('input').filter({ hasText: '' }).nth(1);
    await schedInput.fill('0 0 * * *');
    await expect(page.getByText('Daily at 0:00')).toBeVisible();
  });

  test('SkillsRegistry renders with agent chips', async ({ page }) => {
    await page.goto(`${BASE}/workspace/default/capabilities`);
    await page.waitForTimeout(3000);
    // Scroll to SkillsRegistry
    await page.evaluate(() => {
      const div = document.querySelector('.overflow-y-auto');
      if (div) div.scrollTop = 9999;
    });
    await page.waitForTimeout(1500);
    await expect(page.getByText('View .md').first()).toBeVisible();
  });

  test('SkillsRegistry View .md expands inline', async ({ page }) => {
    await page.goto(`${BASE}/workspace/default/capabilities`);
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      const div = document.querySelector('.overflow-y-auto');
      if (div) div.scrollTop = 9999;
    });
    await page.waitForTimeout(1500);
    const viewBtn = page.getByText('View .md').first();
    await viewBtn.click();
    await page.waitForTimeout(1000);
    // Should show either content block or collapse button
    await expect(page.getByText('Collapse').first()).toBeVisible();
  });

  test('Global / By Agent toggle works', async ({ page }) => {
    await page.goto(`${BASE}/workspace/default/capabilities`);
    await page.waitForTimeout(2000);
    await page.locator('button').filter({ hasText: /By Agent/ }).click();
    await page.waitForTimeout(500);
    // Agent dropdown (select) should appear with "All Agents" as the first option
    await expect(page.locator('select').filter({ hasText: 'All Agents' })).toBeVisible();
  });
});
