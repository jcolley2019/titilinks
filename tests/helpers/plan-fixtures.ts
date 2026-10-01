// TL.PLAN.ENFORCE.2/3 — the plan-enforcement fixtures on the battery, shared by
// spec 82 (the visitor gate) and spec 83 (the editor's lock). Factored out of
// spec 82 unchanged; the only new parameter is the spec's TAG, so each spec
// seeds and sweeps its OWN rows and neither can delete the other's.
//
// The canonical battery tree (TL.ISO.4) has no carousel and no page 2, so a
// spec ADDS them in beforeAll and REMOVES them in afterAll, through a Node
// client signed in as the pinned battery id — spec 81's restore door:
//   • a carousel on page 1 (title marker "<tag>":true), two cards whose
//     style_json carries a paintable animation;
//   • page 2: a page2 mode only when the page has none, and on it a links block
//     (marker) holding one card. An existing page2 mode is reused — only the
//     spec's card is added to its links block.
// Every fixture item URL sits under https://fixture.titilinks.test/<tag>/. The
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

import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '../fixtures';
import { TEST_EMAIL, TEST_PASSWORD, TEST_HANDLE, PINNED_TEST_USER_ID } from './auth';

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
export async function batteryClient(): Promise<SupabaseClient> {
  const sb = createClient(viteEnv('VITE_SUPABASE_URL'), viteEnv('VITE_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) throw new Error(`plan fixtures: sign-in failed: ${error.message}`);
  if (data.user?.id !== PINNED_TEST_USER_ID) {
    throw new Error(`plan fixtures: signed in as ${data.user?.id}, not the battery ${PINNED_TEST_USER_ID}. Nothing written.`);
  }
  return sb;
}

async function batteryModes(sb: SupabaseClient) {
  const { data: pg, error } = await sb.from('pages').select('id, handle').eq('user_id', PINNED_TEST_USER_ID).single();
  if (error || !pg) throw new Error(`plan fixtures: battery page read failed: ${error?.message}`);
  if (pg.handle !== TEST_HANDLE) {
    throw new Error(`plan fixtures: the battery is on '${pg.handle}', not '${TEST_HANDLE}'. Run node scripts/reset-test-account.mjs.`);
  }
  const { data: modes, error: mErr } = await sb.from('modes').select('id, type').eq('page_id', pg.id);
  if (mErr) throw new Error(`plan fixtures: modes read failed: ${mErr.message}`);
  return {
    pageId: pg.id as string,
    page1: modes?.find((m) => m.type === 'page1')?.id as string | undefined,
    page2: modes?.find((m) => m.type === 'page2')?.id as string | undefined,
  };
}

/** One spec's fixture set. `tag` ('s82', 's83') names its rows, URLs and labels. */
export function planFixtures(tag: string) {
  const T = tag.toUpperCase();
  const FIX = `https://fixture.titilinks.test/${tag}/`;
  const MARK = `"${tag}":true`;
  const CAROUSEL_TITLE = `${T} carousel`;
  const CARD_1 = `${FIX}card-1`;
  const PAGE2_LABEL = `${T} page two`;
  const SWITCH = { page1: `${T} One`, page2: `${T} Two` };
  const CUSTOM_FONT = `${T} Font`;

  /** Delete every one of this tag's rows on the battery page — and the page2 mode when its blocks were all it held. */
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
    if (!page1) throw new Error(`${tag} fixtures: the battery page has no page1 mode.`);

    // A carousel on page 1. Safe under blocks_mode_type_singleton_uidx only while none exists.
    const { data: carousels } = await sb.from('blocks').select('id').eq('mode_id', page1).eq('type', 'carousel');
    if (carousels?.length) {
      throw new Error(`${tag} fixtures: battery page 1 already holds a carousel that is not this spec's — `
        + 'the owning spec\'s next sweep (45, 82, 83) or node scripts/reset-test-account.mjs clears it.');
    }
    const { data: car, error: cErr } = await sb.from('blocks')
      .insert({ mode_id: page1, type: 'carousel', is_enabled: true, order_index: 90,
        title: JSON.stringify({ [tag]: true, section_title: CAROUSEL_TITLE, autoScroll: false }) })
      .select('id').single();
    if (cErr || !car) throw new Error(`${tag} fixtures: carousel insert failed: ${cErr?.message}`);
    const { error: ciErr } = await sb.from('block_items').insert([1, 2].map((i) => ({
      block_id: car.id, label: `${T} card ${i}`, url: `${FIX}card-${i}`, order_index: i - 1,
      style_json: { animation: 'glow' },
    })));
    if (ciErr) throw new Error(`${tag} fixtures: carousel items insert failed: ${ciErr.message}`);

    // Page 2: reuse the mode if the page has one, create it otherwise.
    let modeId = page2;
    if (!modeId) {
      const { data: mode, error: mErr } = await sb.from('modes').insert({ page_id: pageId, type: 'page2' }).select('id').single();
      if (mErr || !mode) throw new Error(`${tag} fixtures: page2 mode insert failed: ${mErr?.message}`);
      modeId = mode.id as string;
    }
    const { data: p2links } = await sb.from('blocks').select('id').eq('mode_id', modeId).eq('type', 'links');
    let linksId = p2links?.[0]?.id as string | undefined;
    if (!linksId) {
      const { data: lb, error: lErr } = await sb.from('blocks')
        .insert({ mode_id: modeId, type: 'links', is_enabled: true, order_index: 0, title: JSON.stringify({ [tag]: true }) })
        .select('id').single();
      if (lErr || !lb) throw new Error(`${tag} fixtures: page2 links insert failed: ${lErr?.message}`);
      linksId = lb.id as string;
    }
    const { error: liErr } = await sb.from('block_items')
      .insert({ block_id: linksId, label: PAGE2_LABEL, url: `${FIX}page-2`, order_index: 99 });
    if (liErr) throw new Error(`${tag} fixtures: page2 item insert failed: ${liErr.message}`);
  }

  /**
   * Wire-patch the battery's page row: a two-page switcher, a page-level
   * animation, a custom page font. Matches the public page's read (by handle)
   * and the editor's (by owner); rows read without theme_json pass untouched.
   */
  async function patchPageRow(page: Page) {
    await page.route(
      (url) => url.pathname.endsWith('/rest/v1/pages')
        && (url.searchParams.get('handle') === `eq.${TEST_HANDLE}`
          || url.searchParams.get('user_id') === `eq.${PINNED_TEST_USER_ID}`),
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        const res = await route.fetch();
        const body = await res.json();
        const patch = (row: { theme_json?: Record<string, any> | null }) => {
          if (!row || typeof row !== 'object' || !('theme_json' in row)) return row;
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

  return { FIX, MARK, CAROUSEL_TITLE, CARD_1, PAGE2_LABEL, SWITCH, CUSTOM_FONT, sweep, addFixtures, patchPageRow };
}

/** beforeAll/afterAll body: run `fn` with a battery client, always signing it out. */
export async function withBatteryClient(fn: (sb: SupabaseClient) => Promise<void>): Promise<void> {
  const sb = await batteryClient();
  try {
    await fn(sb);
  } finally {
    await sb.auth.signOut();
  }
}
