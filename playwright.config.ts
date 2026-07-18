import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.test (gitignored) into process.env for the auth setup project.
// Dependency-free on purpose — no dotenv, no package.json churn; harness-only.
// Real values are never committed; .env.test.example ships placeholders.
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const envTestPath = path.resolve(rootDir, '.env.test');
if (fs.existsSync(envTestPath)) {
  for (const line of fs.readFileSync(envTestPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

// Saved authenticated session — minted once by tests/auth.setup.ts.
const authFile = 'tests/.auth/user.json';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:8080',
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // Runs first: performs the single real login and saves storageState.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14 Pro Max'], storageState: authFile },
      dependencies: ['setup'],
    },
  ],
  outputDir: 'tests/results',
});
