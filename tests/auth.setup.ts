import fs from 'fs';
import { test as setup } from '@playwright/test';
import {
  FREE_TEST_USER_ID,
  loginAsFreeUser,
  loginAsTestUser,
  OLD_JOEYC_USER_ID,
  PINNED_TEST_USER_ID,
} from './helpers/auth';

// Shared authenticated session consumed by the desktop/mobile projects.
// Gitignored (tests/.auth/) — the JSON holds a real Supabase JWT.
const authFile = 'tests/.auth/user.json';

// TL.HARNESS.FREE.1 — the SECOND key, minted by the same setup project.
// No Playwright project consumes it as a project-level storageState: it is
// opened per-test by fixtures.withFreeUser(), which installs the same
// default-deny write guard. Gitignored for the same reason as user.json.
const freeAuthFile = 'tests/.auth/free.json';

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

// TL.HARNESS.FREE.1 — the free-plan door. Deliberately a MIRROR of the battery
// setup above rather than a shared helper: these two blocks are the only places
// a real credential is turned into a saved session, and each one must be
// readable on its own as a complete, self-contained identity check.
setup('authenticate-free', async ({ page }) => {
  // A stale session from an earlier mint must not survive a failed identity
  // check below, so drop it before logging in.
  if (fs.existsSync(freeAuthFile)) fs.unlinkSync(freeAuthFile);

  await loginAsFreeUser(page);

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
      'TL.HARNESS.FREE.1: login succeeded but no Supabase session was found in ' +
        'localStorage — refusing to save storageState.'
    );
  }
  if (identity.id === OLD_JOEYC_USER_ID) {
    throw new Error(
      `TL.HARNESS.FREE.1: TEST_FREE_USER_* holds credentials for Joey's PERSONAL ` +
        `account (${identity.email}). This is the Aug 18-19 incident class — ` +
        'specs once minted 32 duplicate blocks on that live page. Point ' +
        '.env.test at the dedicated free account. NO storageState was saved.'
    );
  }
  if (identity.id === PINNED_TEST_USER_ID) {
    throw new Error(
      `TL.HARNESS.FREE.1: TEST_FREE_USER_* holds the BATTERY credentials ` +
        `(${identity.email}). The free door would then open a Pro account and ` +
        'every free-tier floor assertion would pass or fail for the wrong ' +
        'reason. NO storageState was saved.'
    );
  }
  if (identity.id !== FREE_TEST_USER_ID) {
    throw new Error(
      `TL.HARNESS.FREE.1: minted session belongs to ${identity.email} (${identity.id}), ` +
        `not the pinned free account ${FREE_TEST_USER_ID}. Fix .env.test. ` +
        'NO storageState was saved.'
    );
  }

  await page.context().storageState({ path: freeAuthFile });
});
