// TL.PLAN.ENFORCE.2 — STRICT plan enforcement on visitor surfaces.
//
// Ruling: when the page owner's plan is Free, a visitor gets only Free-tier
// features, whatever is saved (src/lib/plan-gate.ts, unit-tested by
// scripts/plan-gate.test.mjs). The gate works at render only — saved rows are
// never touched, so re-upgrading restores everything.
//
// a. The FREE account (joey2019pwtestfree), visited ANONYMOUSLY and READ ONLY.
//    Onboarding seeded it an enabled email_subscribe block; its visitor gets no
//    form, no page switcher, and the "Made with TitiLinks" badge. Never signed
//    in as, never written to (TL.HARNESS.FREE.1).
// b. The battery with a carousel, a page 2, animations and a custom page font,
//    visited anonymously — first with the owner plan MOCKED free (the spec
//    29/30 pattern: the get_public_page_branding / get_public_page_plan RPCs),
//    then UNMOCKED (the battery is Pro, TL.COMP.4). Free: the carousel renders
//    as plain links, no animation class anywhere, the default font, no email
//    form, page 1 at ?page=2 and no switcher. Pro: all of it.
//
// FIXTURES (b). The canonical battery tree (TL.ISO.4) has no carousel and no
// page 2, so beforeAll ADDS them and afterAll REMOVES them, through a Node
// client signed in as the pinned battery id — spec 81's restore door:
//   • a carousel on page 1 (title marker "s82":true), two cards whose
//     style_json carries a paintable animation;
//   • page 2: a page2 mode only when the page has none, and on it a links block
//     (marker) holding one card. An existing page2 mode is reused — only this
//     spec's card is added to its links block.
// Every fixture item URL sits under https://fixture.titilinks.test/s82/. The
// sweep (pre-flight AND afterAll) deletes exactly those rows, and the page2
// mode when the spec's blocks are all that is left on it — so a run killed
// mid-flight is healed by the next one. scripts/reset-test-account.mjs heals
// it too: its tear-down deletes every block, and a page2 mode is canonical
// either way.
//
// theme_json is NEVER written. The page switcher (pages.enabled + labels), the
// page-level animation and the custom page font are PATCHED onto the page row
// on the wire (spec 52's precedent): the reseed does not restore theme_json, so
// a write stranded there would outlive every reset.
//
// b is desktop only (it writes, on a shared account); a runs on both projects.

import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect, type Page } from './fixtures';
import {
  TEST_EMAIL,
  TEST_PASSWORD,
  TEST_HANDLE,
  PINNED_TEST_USER_ID,
  FREE_TEST_HANDLE,
} from './helpers/auth';

const PHONE = { width: 390, height: 844 };
const ANONYMOUS = { cookies: [], origins: [] };

const FIX = 'https://fixture.titilinks.test/s82/';
const MARK = '"s82":true';
const CAROUSEL_TITLE = 'S82 carousel';
const CARD_1 = `${FIX}card-1`;
const PAGE2_LABEL = 'S82 page two';
const SWITCH = { page1: 'S82 One', page2: 'S82 Two' };
const CUSTOM_FONT = 'S82 Font';

/** .env holds the app's Supabase URL/key; playwright.config only loads .env.test. (Same reader as spec 81.) */
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

/** A Node client signed in as the battery — refuses to hand back any other account. */
async function batteryClient(): Promise<SupabaseClient> {
  const sb = createClient(viteEnv('VITE_SUPABASE_URL'), viteEnv('VITE_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) throw new Error(`spec 82 fixtures: sign-in failed: ${error.message}`);
  if (data.user?.id !== PINNED_TEST_USER_ID) {
    throw new Error(`spec 82 fixtures: signed in as ${data.user?.id}, not the battery ${PINNED_TEST_USER_ID}. Nothing written.`);
  }
  return sb;
}

async function batteryModes(sb: SupabaseClient) {
  const { data: pg, error } = await sb.from('pages').select('id, handle').eq('user_id', PINNED_TEST_USER_ID).single();
  if (error || !pg) throw new Error(`spec 82 fixtures: battery page read failed: ${error?.message}`);
  if (pg.handle !== TEST_HANDLE) {
    throw new Error(`spec 82 fixtures: the battery is on '${pg.handle}', not '${TEST_HANDLE}'. Run node scripts/reset-test-account.mjs.`);
  }
  const { data: modes, error: mErr } = await sb.from('modes').select('id, type').eq('page_id', pg.id);
  if (mErr) throw new Error(`spec 82 fixtures: modes read failed: ${mErr.message}`);
  return {
    pageId: pg.id as string,
    page1: modes?.find((m) => m.type === 'page1')?.id as string | undefined,
    page2: modes?.find((m) => m.type === 'page2')?.id as string | undefined,
  };
}

/** Delete every s82 row on the battery page — and the page2 mode when the spec's blocks were all it held. */
async function sweep(sb: SupabaseClient) {
  const { page1, page2 } = await batteryModes(sb);
  for (const modeId of [page1, page2]) {
    if (!modeId) continue;
    const { data: blocks, error } = await sb.from('blocks').select('id, title').eq('mode_id', modeId);
    if (error) throw new Error(`sweep: blocks read failed: ${error.message}`);
    const mine = (blocks ?? []).filter((b) => (b.title ?? '').includes(MARK));
    const foreign = (blocks ?? []).filter((b) => !(b.title ?? '').includes(MARK));
    for (const b of mine) {
      // block_items cascade with their block.
      const { error: dErr } = await sb.from('blocks').delete().eq('id', b.id);
      if (dErr) throw new Error(`sweep: fixture block delete failed: ${dErr.message}`);
    }
    for (const b of foreign) {
      const { error: iErr } = await sb.from('block_items').delete().eq('block_id', b.id).like('url', `${FIX}%`);
      if (iErr) throw new Error(`sweep: fixture item delete failed: ${iErr.message}`);
    }
    if (modeId === page2 && mine.length > 0 && foreign.length === 0) {
      const { error: mErr } = await sb.from('modes').delete().eq('id', modeId);
      if (mErr) throw new Error(`sweep: page2 mode delete failed: ${mErr.message}`);
    }
  }
}

async function addFixtures(sb: SupabaseClient) {
  await sweep(sb);
  const { pageId, page1, page2 } = await batteryModes(sb);
  if (!page1) throw new Error('spec 82 fixtures: the battery page has no page1 mode.');

  // A carousel on page 1. Safe under blocks_mode_type_singleton_uidx only while none exists.
  const { data: carousels } = await sb.from('blocks').select('id').eq('mode_id', page1).eq('type', 'carousel');
  if (carousels?.length) {
    throw new Error('spec 82 fixtures: battery page 1 already holds a carousel that is not this spec\'s — '
      + 'spec 45\'s own sweep or node scripts/reset-test-account.mjs clears it.');
  }
  const { data: car, error: cErr } = await sb.from('blocks')
    .insert({ mode_id: page1, type: 'carousel', is_enabled: true, order_index: 90,
      title: JSON.stringify({ s82: true, section_title: CAROUSEL_TITLE, autoScroll: false }) })
    .select('id').single();
  if (cErr || !car) throw new Error(`spec 82 fixtures: carousel insert failed: ${cErr?.message}`);
  const { error: ciErr } = await sb.from('block_items').insert([1, 2].map((i) => ({
    block_id: car.id, label: `S82 card ${i}`, url: `${FIX}card-${i}`, order_index: i - 1,
    style_json: { animation: 'glow' },
  })));
  if (ciErr) throw new Error(`spec 82 fixtures: carousel items insert failed: ${ciErr.message}`);

  // Page 2: reuse the mode if the page has one, create it otherwise.
  let modeId = page2;
  if (!modeId) {
    const { data: mode, error: mErr } = await sb.from('modes').insert({ page_id: pageId, type: 'page2' }).select('id').single();
    if (mErr || !mode) throw new Error(`spec 82 fixtures: page2 mode insert failed: ${mErr?.message}`);
    modeId = mode.id as string;
  }
  const { data: p2links } = await sb.from('blocks').select('id').eq('mode_id', modeId).eq('type', 'links');
  let linksId = p2links?.[0]?.id as string | undefined;
  if (!linksId) {
    const { data: lb, error: lErr } = await sb.from('blocks')
      .insert({ mode_id: modeId, type: 'links', is_enabled: true, order_index: 0, title: JSON.stringify({ s82: true }) })
      .select('id').single();
    if (lErr || !lb) throw new Error(`spec 82 fixtures: page2 links insert failed: ${lErr?.message}`);
    linksId = lb.id as string;
  }
  const { error: liErr } = await sb.from('block_items')
    .insert({ block_id: linksId, label: PAGE2_LABEL, url: `${FIX}page-2`, order_index: 99 });
  if (liErr) throw new Error(`spec 82 fixtures: page2 item insert failed: ${liErr.message}`);
}

/** Wire-patch the battery's page row: a two-page switcher, a page-level animation, a custom page font. */
async function patchPageRow(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith('/rest/v1/pages') && url.searchParams.get('handle') === `eq.${TEST_HANDLE}`,
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const res = await route.fetch();
      const body = await res.json();
      const patch = (row: { theme_json?: Record<string, any> | null }) => {
        const tj = row.theme_json ?? {};
        return {
          ...row,
          theme_json: {
            ...tj,
            pages: { ...(tj.pages ?? {}), enabled: true, page1: { label: SWITCH.page1 }, page2: { label: SWITCH.page2 } },
            buttons: { ...(tj.buttons ?? {}), animation: 'pulse' },
            typography: { ...(tj.typography ?? {}), font: `custom:${CUSTOM_FONT}` },
          },
        };
      };
      await route.fulfill({ response: res, json: Array.isArray(body) ? body.map(patch) : patch(body) });
    },
  );
}

/** The spec 29/30 pattern: the owner-plan RPCs answer 'free'. */
async function mockOwnerPlanFree(page: Page) {
  await page.route('**/rest/v1/rpc/get_public_page_branding*', (route) =>
    route.fulfill({ json: [{ plan: 'free', show_badge: true, referral_code: null }] }));
  await page.route('**/rest/v1/rpc/get_public_page_plan*', (route) => route.fulfill({ json: 'free' }));
}

async function visit(page: Page, handle: string, query = '') {
  await page.goto(`/${handle}${query}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(`@${handle}`).first()).toBeVisible({ timeout: 15_000 });
}

test.describe('TL.PLAN.ENFORCE.2 — a. the FREE account, visited anonymously', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE });

  test('no subscribe form, no page switcher, the badge shows', async ({ page }) => {
    await visit(page, FREE_TEST_HANDLE);
    await expect(page.getByRole('link', { name: /made with/i })).toBeVisible();
    // Onboarding seeded an enabled email_subscribe block; a Free owner's visitor never gets the form.
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Page|Página) [12]$/ })).toHaveCount(0);
  });
});

test.describe('TL.PLAN.ENFORCE.2 — b. the battery, owner plan free vs pro', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE });

  test.beforeAll(async () => {
    if (test.info().project.name !== 'desktop') return;
    const sb = await batteryClient();
    try {
      await addFixtures(sb);
    } finally {
      await sb.auth.signOut();
    }
  });

  // Unconditional: a run that dies anywhere must not leave the fixtures behind.
  test.afterAll(async () => {
    if (test.info().project.name !== 'desktop') return;
    const sb = await batteryClient();
    try {
      await sweep(sb);
    } finally {
      await sb.auth.signOut();
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop only — fixture rows on the shared battery');
    await patchPageRow(page);
  });

  test('free: carousel as plain links, no animation, default font, no email form, no switcher', async ({ page }) => {
    await mockOwnerPlanFree(page);
    await visit(page, TEST_HANDLE);

    const card = page.locator(`a[href="${CARD_1}"]`);
    await expect(card).toHaveCount(1);
    await expect(card, 'rendered by LinkButton — the links path').toHaveClass(/lb-velvet/);
    await expect(page.getByText(CAROUSEL_TITLE)).toHaveCount(0);
    await expect(page.locator('[class*="lb-anim-"]')).toHaveCount(0);
    await expect(page.locator(`[style*="${CUSTOM_FONT}"]`)).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: SWITCH.page2 })).toHaveCount(0);
  });

  test('free: ?page=2 serves page 1 and no switcher', async ({ page }) => {
    await mockOwnerPlanFree(page);
    await visit(page, TEST_HANDLE, '?page=2');

    await expect(page.getByText(PAGE2_LABEL)).toHaveCount(0);
    await expect(page.locator(`a[href="${CARD_1}"]`), 'page 1 content').toHaveCount(1);
    await expect(page.getByRole('button', { name: SWITCH.page1 })).toHaveCount(0);
    await expect(page.getByRole('button', { name: SWITCH.page2 })).toHaveCount(0);
  });

  test('pro (unmocked): carousel, animations, custom font, email form, switcher and page 2', async ({ page }) => {
    await visit(page, TEST_HANDLE);

    await expect(page.getByText(CAROUSEL_TITLE)).toBeVisible();
    await expect(page.locator(`a[href="${CARD_1}"]`).first()).toBeVisible();
    await expect(page.locator(`a.lb-velvet[href="${CARD_1}"]`), 'the carousel renderer, not links').toHaveCount(0);
    expect(await page.locator('[class*="lb-anim-pulse"]').count()).toBeGreaterThan(0);
    expect(await page.locator(`[style*="${CUSTOM_FONT}"]`).count()).toBeGreaterThan(0);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: SWITCH.page2 })).toBeVisible();
    await expect(page.getByText(PAGE2_LABEL)).toHaveCount(0);

    await visit(page, TEST_HANDLE, '?page=2');
    await expect(page.getByText(PAGE2_LABEL).first()).toBeVisible();
    await expect(page.locator(`a[href="${CARD_1}"]`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: SWITCH.page1 })).toBeVisible();
  });
});
