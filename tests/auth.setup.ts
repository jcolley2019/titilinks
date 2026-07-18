import { test as setup } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

// Shared authenticated session consumed by the desktop/mobile projects.
// Gitignored (tests/.auth/) — the JSON holds a real Supabase JWT.
const authFile = 'tests/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await loginAsTestUser(page);
  await page.context().storageState({ path: authFile });
});
