// MEDIA.LEAK.1 — the original-photo leak is closed at the database boundary.
//
// Background: `pages.avatar_original_url` and `theme_json.avatar_original_url_page2`
// hold the creator's raw, un-recropped uploads (EXIF/GPS intact). `pages` was
// world-readable (`"Public can view pages by handle"` USING (true)), so the
// MEDIA.PHOTO.1 client-side column list hid them from the visitor route but
// not from anyone holding the anon key. The fix, in two SQL steps:
//   step 1 (#50) — `public.pages_public`, a plain view of every `pages` column
//                  except `avatar_original_url`, with the page-2 original
//                  stripped from theme_json; SELECT only, to anon/authenticated.
//   step 3 (#51) — `pages` SELECT becomes owner-only; every non-owner reader
//                  (visitor route, middleware, handle checks) reads the view.
//
// What this spec proves, as a stranger with the anon key and no session (Node
// `fetch`, exactly the headers a visitor's browser sends — `apikey` plus
// `Authorization: Bearer <anon key>`):
//   a. GET pages_public for the battery handle → 200, one row, neither key;
//   b. GET pages for the battery handle        → 200 [] — ONLY when
//      MEDIA_LEAK_STEP3=1. Between Joey running step 1 and step 3 the public
//      policy is still live and anon still gets the row, so the battery stays
//      green across the gap; set the flag once step 3 is applied;
//   c. the view is read-only to anon: a PATCH aimed at a row that cannot exist
//      is refused for privilege (42501) — no row is matched, so even a broken
//      grant could not touch data.
//
// Writes: none reach a row. Reads are against the battery account only.
// Desktop only: pure PostgREST, the browser engine proves nothing extra.

import fs from 'fs';
import path from 'path';
import { test, expect } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

/** Same dependency-free .env reader as specs 57/58: .env.test first, then .env. */
function viteEnv(name: string): string {
  if (process.env[name]) return process.env[name]!;
  for (const file of ['.env.test', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error(`${name} not found in process.env, .env.test or .env`);
}

const BASE = () => viteEnv('VITE_SUPABASE_URL');
const KEY = () => viteEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
const anonHeaders = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, Accept: 'application/json' });
const STEP3 = process.env.MEDIA_LEAK_STEP3 === '1';

test.describe('MEDIA.LEAK.1 — originals never reach a non-owner', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'pure PostgREST — one project only');
  });

  test('a. anon reads pages_public: the row, without either original', async () => {
    const res = await fetch(
      `${BASE()}/rest/v1/pages_public?handle=eq.${TEST_HANDLE}&select=*`,
      { headers: anonHeaders() },
    );
    expect(res.status, 'pages_public exists and anon may read it (step 1 applied)').toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows) && rows.length, 'one row for the battery handle').toBe(1);
    const row = rows[0];
    expect(row.handle).toBe(TEST_HANDLE);
    expect(Object.keys(row), 'no avatar_original_url column').not.toContain('avatar_original_url');
    expect(Object.keys(row.theme_json ?? {}), 'no page-2 original in theme_json').not.toContain(
      'avatar_original_url_page2',
    );
    // What the visitor route and the handle checks need is all there.
    for (const col of ['id', 'user_id', 'handle', 'display_name', 'bio', 'avatar_url', 'theme_json']) {
      expect(Object.keys(row), `view carries ${col}`).toContain(col);
    }
  });

  test('b. anon reads pages: nothing, once step 3 is applied', async () => {
    const res = await fetch(
      `${BASE()}/rest/v1/pages?handle=eq.${TEST_HANDLE}&select=*`,
      { headers: anonHeaders() },
    );
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    if (STEP3) {
      expect(rows, 'pages is owner-only: anon gets no row').toEqual([]);
    } else {
      // Pre-step-3 the public USING (true) policy still answers. Recorded, not asserted.
      test.info().annotations.push({
        type: 'MEDIA_LEAK_STEP3 unset',
        description: `anon pages read returned ${rows.length} row(s); set MEDIA_LEAK_STEP3=1 after step 3 to assert []`,
      });
    }
  });

  test('c. anon cannot write through pages_public', async () => {
    const res = await fetch(
      `${BASE()}/rest/v1/pages_public?id=eq.00000000-0000-0000-0000-000000000000`,
      {
        method: 'PATCH',
        headers: { ...anonHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ bio: 'MEDIA.LEAK.1 probe' }),
      },
    );
    expect([401, 403], `refused for privilege, got ${res.status}`).toContain(res.status);
    const body = await res.json();
    expect(body.code, 'permission denied, not a matched-zero-rows success').toBe('42501');
  });
});
