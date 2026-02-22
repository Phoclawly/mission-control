import { defineConfig, devices } from '@playwright/test';

const username = process.env.BROWSERSTACK_USERNAME;
const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;

if (!username || !accessKey) {
  throw new Error('Missing BrowserStack credentials: set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY');
}

const buildName = process.env.BROWSERSTACK_BUILD_NAME || `mission-control-e2e-${new Date().toISOString()}`;
const projectName = process.env.BROWSERSTACK_PROJECT_NAME || 'mission-control';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4000';

function wsEndpoint(capabilities: Record<string, string>) {
  const caps = {
    ...capabilities,
    'browserstack.username': username,
    'browserstack.accessKey': accessKey,
    'browserstack.projectName': projectName,
    'browserstack.buildName': buildName,
    'browserstack.sessionName': 'activate-workspace',
    'browserstack.local': 'true',
    'browserstack.debug': 'true',
    'browserstack.networkLogs': 'true',
    'client.playwrightVersion': '1.latest',
  };

  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    extraHTTPHeaders: {
      'x-forwarded-for': '100.64.1.5',
    },
  },
  projects: [
    {
      name: 'browserstack-chrome-win11',
      use: {
        ...devices['Desktop Chrome'],
        connectOptions: {
          wsEndpoint: wsEndpoint({
            browser: 'chrome',
            browser_version: 'latest',
            os: 'Windows',
            os_version: '11',
          }),
        },
      },
    },
  ],
});
