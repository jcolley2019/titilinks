import fs from 'fs';
import { test as setup } from '@playwright/test';
import { loginAsTestUser, OLD_JOEYC_USER_ID, PINNED_TEST_USER_ID } from './helpers/auth';

// Shared authenticated session consumed by the desktop/mobile projects.
// Gitignored (tests/.auth/) — the JSON holds a real Supabase JWT.
const authFile = 'tests/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // TL.ISO.1 — a stale session from an earlier mint must not survive a failed
  // identity check below, so drop it before logging in.
  if (fs.existsSync(authFile)) fs.unlinkSync(authFile);

  await loginAsTestUser(page);

  // TL.ISO.1 identity pin — verify WHO we just authed as before persisting the
  // session every spec will run under. The supabase-js session lives in
  // localStorage under sb-<project-ref>-auth-token.
  const identity = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (/^sb-.*-auth-token$/.test(key)) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? '');
          return { id: parsed?.user?.id ?? '', email: parsed?.user?.email ?? '' };
        } catch {
          return null;
        }
      }
    }
    return null;
  });

  if (!identity || !identity.id) {
    throw new Error(
      'TL.ISO.1: login succeeded but no Supabase session was found in ' +
        'localStorage — refusing to save storageState.'
    );
  }
  if (identity.id === OLD_JOEYC_USER_ID) {
    throw new Error(
      `TL.ISO.1: .env.test holds credentials for Joey's PERSONAL account ` +
        `(${identity.email}). This is the Aug 18-19 incident class — ` +
        'specs once minted 32 duplicate blocks on that live page. Point ' +
        '.env.test at the dedicated battery account. NO storageState was saved.'
    );
  }
  if (identity.id !== PINNED_TEST_USER_ID) {
    throw new Error(
      `TL.ISO.1: minted session belongs to ${identity.email} (${identity.id}), ` +
        `not the pinned battery account ${PINNED_TEST_USER_ID}. Fix .env.test. ` +
        'NO storageState was saved.'
    );
  }

  await page.context().storageState({ path: authFile });
});
