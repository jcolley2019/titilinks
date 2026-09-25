// TL.EDIT.DIRTY.1 — every editor panel: Save only when dirty, no duplicate on
// re-save.
//
// Two defects shared by every editor under src/components/editors/ (fixed
// locally first by TL.PROD.ADD.3 and TL.LINKS.ADD.1, now through ONE hook,
// src/hooks/useDirtyBaseline.ts):
//   1. Save was always enabled, so nothing told the creator whether there was
//      anything to save, and a second press re-ran the save.
//   2. The panel STAYS OPEN after Save (ProfileDashboard swallows the editor's
//      close once), so an editor that inserts `new-…` draft rows and never
//      learns the saved ids inserts them again on the next Save.
//
// What this spec pins, against DB truth on the battery account:
//   • SocialLinksEditor, BioEditor, EventsEditor — open → Save disabled →
//     change a field → enabled → change it back → disabled → change it → Save
//     → disabled again, and exactly one row carries the change.
//   • EventsEditor (a draft-inserting editor) — add a draft, Save, change it,
//     Save again: still exactly one row, and exactly ONE insert on the wire.
//
// REAL WRITES, restored. Fixture strategy follows spec 70:
//   • social_links and bio are canonical (reset-test-account.mjs), singleton
//     per mode, so the spec BORROWS them: every column the editor's Save
//     rewrites is snapshotted first and handed back verbatim in the finally.
//   • events is not canonical (TL.EVNT.SGL), so the spec CREATES the block on
//     the page1 mode and deletes it whole — unless one already exists, in which
//     case it is borrowed and only the spec's own rows are removed.
// Every row the spec writes carries a `SPEC79` marker, so a run killed
// mid-flight is healed by the next run's pre-flight sweep.
//
// Desktop project only: the rows are real and shared, the assertions are about
// a button's state and DB rows, and a second project would only double the
// writes. The two playwright traps from the TL.GAL.1b probe apply here:
// sonner's toast lands over the panel's sticky Save and hover PAUSES it (park
// the mouse and drain toasts before the next click), and the Save button's
// accessible name flips to "Saving…" mid-cycle (a `Save`-named locator only
// resolves once the save is done — which is exactly when its state matters).
import { test, expect, allowWrites, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';

const T = translations.en;

test.use({ deviceScaleFactor: 1 });
const DESKTOP = { width: 1440, height: 1000 };

const MARKER = 'SPEC79';

// TL.ISO.2 write opt-in — the editors' own Saves plus the seed/restore writes.
const WRITE_PREFIXES = ['rest/v1/blocks', 'rest/v1/block_items'];

/** Run a supabase query with the app's own client (RLS as the signed-in user). */
const sb = <R,>(page: Page, fn: string, arg?: unknown): Promise<R> => page.evaluate(
  async ({ body, a }) => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
  },
  { body: fn, a: arg ?? null },
);

/** The mode the dashboard edits: page1 of the account's one page. */
const editingModeId = (page: Page): Promise<string> => sb<string>(
  page,
  `const { data: auth } = await sb.auth.getUser();
   const { data: pg, error } = await sb.from('pages').select('id').eq('user_id', auth.user.id).maybeSingle();
   if (error) throw error;
   if (!pg) throw new Error('no pages row for the signed-in account');
   const { data: modes } = await sb.from('modes').select('id,type').eq('page_id', pg.id);
   const m = (modes || []).find((x) => x.type === 'page1') || (modes || [])[0];
   if (!m) throw new Error('no mode on the account\\'s page');
   return m.id;`,
);

/** Put the account back from anything a killed run can leave behind: every
 *  SPEC79-labelled item on this mode, every SPEC79-titled events block. */
async function sweep(page: Page, modeId: string): Promise<void> {
  await sb<void>(
    page,
    `const { data: blocks } = await sb.from('blocks').select('id,type,title').eq('mode_id', arg.modeId);
     for (const b of (blocks || [])) {
       const { data: items } = await sb.from('block_items').select('id,label').eq('block_id', b.id);
       const junk = (items || []).filter((i) => (i.label || '').startsWith(arg.marker)).map((i) => i.id);
       if (junk.length) {
         const { error } = await sb.from('block_items').delete().in('id', junk);
         if (error) throw new Error('sweep items: ' + error.message);
       }
       if (b.type === 'events' && (b.title || '').startsWith(arg.marker)) {
         await sb.from('block_items').delete().eq('block_id', b.id);
         const { error } = await sb.from('blocks').delete().eq('id', b.id);
         if (error) throw new Error('sweep block: ' + error.message);
       }
     }`,
    { modeId, marker: MARKER },
  );
}

type ItemRow = { id: string; label: string; url: string | null; subtitle: string | null; badge: string | null;
  image_url: string | null; is_adult: boolean | null; order_index: number };

/** The one block of `type` on the mode, with its items (the columns the
 *  editors write) — or null when the mode has none. */
const readBlock = (page: Page, modeId: string, type: string) =>
  sb<{ id: string; title: string | null; items: ItemRow[] } | null>(
    page,
    `const { data: blocks, error } = await sb.from('blocks')
       .select('id,title').eq('mode_id', arg.modeId).eq('type', arg.type);
     if (error) throw error;
     const b = (blocks || [])[0];
     if (!b) return null;
     const { data: items, error: e2 } = await sb.from('block_items')
       .select('id,label,url,subtitle,badge,image_url,is_adult,order_index')
       .eq('block_id', b.id).order('order_index', { ascending: true });
     if (e2) throw e2;
     return { id: b.id, title: b.title, items: items || [] };`,
    { modeId, type },
  );

/** Hand back a borrowed block: its title, every snapshotted item's columns,
 *  and no item that was not in the snapshot. */
const restoreBlock = (page: Page, snap: { id: string; title: string | null; items: ItemRow[] }) => sb<void>(
  page,
  `const { error } = await sb.from('blocks').update({ title: arg.title }).eq('id', arg.id);
   if (error) throw new Error('title restore: ' + error.message);
   const keep = arg.items.map((i) => i.id);
   const { data: now } = await sb.from('block_items').select('id').eq('block_id', arg.id);
   const extra = (now || []).map((i) => i.id).filter((id) => !keep.includes(id));
   if (extra.length) {
     const { error: e1 } = await sb.from('block_items').delete().in('id', extra);
     if (e1) throw new Error('extra item delete: ' + e1.message);
   }
   for (const it of arg.items) {
     const { id, ...cols } = it;
     const { error: e2 } = await sb.from('block_items').update(cols).eq('id', id);
     if (e2) throw new Error('item restore: ' + e2.message);
   }`,
  snap,
);

/** The slide-in panel (the editor surface), and its footer Save. */
const panel = (page: Page) => page.locator('.fixed.top-16');
const panelSave = (page: Page) =>
  panel(page).getByRole('button', { name: T['blockEditor.save'], exact: true });

/** Click Save the way a creator does, then get the mouse and the toast out of
 *  the way so the next click is not intercepted (the TL.GAL.1b trap). */
async function clickSave(page: Page): Promise<void> {
  await panelSave(page).click();
  await page.mouse.move(5, 5);
}
async function drainToasts(page: Page): Promise<void> {
  await page.mouse.move(5, 5);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 20_000 });
}

/** Mount the editor and open the Add Content panel's Sections rail row. */
async function openRailRow(page: Page, blockType: 'bio' | 'events'): Promise<void> {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Edit Profile|Editar perfil/i }).first().click();
  await expect(page.getByTestId('sections-group-toggle')).toBeVisible();
  const row = page.locator(`[data-testid="section-row"][data-section-type="${blockType}"]`);
  await expect(row, `no ${blockType} row on the Sections rail`).toHaveCount(1);
  await row.locator('button').first().click();
}

/** SocialLinksEditor's door: the Edit Profile menu's Manage Platforms row
 *  (social blocks are deliberately absent from the Sections rail). */
async function openPlatformsPanel(page: Page): Promise<void> {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  const menuRow = page.getByRole('button', { name: /Manage Platforms/ }).filter({ visible: true }).first();
  await expect(menuRow).toBeVisible();
  await menuRow.click();
  await expect(page.getByRole('button', { name: 'Add Platform' })).toBeVisible({ timeout: 15_000 });
}

/** Count block_items INSERTS on the wire (supabase-js inserts are POSTs). */
function countItemInserts(page: Page): { n: number } {
  const c = { n: 0 };
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/rest\/v1\/block_items(\?|$)/.test(req.url())) c.n++;
  });
  return c;
}

/** The marker rows on a block, straight from the DB. */
const markerRows = (page: Page, blockId: string) => sb<Array<{ id: string; label: string; url: string }>>(
  page,
  `const { data, error } = await sb.from('block_items').select('id,label,url').eq('block_id', arg.blockId);
   if (error) throw error;
   return (data || []).filter((i) => (i.label || '').startsWith(arg.marker));`,
  { blockId, marker: MARKER },
);

test.describe('TL.EDIT.DIRTY.1 — Save only when dirty, no duplicate on re-save', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'real rows on the shared battery — one project only',
    );
    test.setTimeout(120_000);
    await allowWrites(page, WRITE_PREFIXES);
    await page.setViewportSize(DESKTOP);
  });

  test('SocialLinksEditor — dirty cycle, one row carries the change', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const modeId = await editingModeId(page);
    await sweep(page, modeId);

    const snap = await readBlock(page, modeId, 'social_links');
    if (!snap) throw new Error('no social_links block on the editing mode — reseed the battery');

    const LABEL = `${MARKER} Custom`;
    const URL_A = 'https://example.com/spec79-a';
    const URL_B = 'https://example.com/spec79-b';
    await sb<void>(
      page,
      `const { error } = await sb.from('block_items')
         .insert({ block_id: arg.blockId, label: arg.label, url: arg.url, order_index: 99 });
       if (error) throw new Error('seed row: ' + error.message);`,
      { blockId: snap.id, label: LABEL, url: URL_A },
    );

    try {
      await openPlatformsPanel(page);
      await expect(panelSave(page), 'Save must start disabled — nothing changed yet').toBeDisabled();

      const row = page.getByTestId('social-row').filter({ hasText: LABEL });
      await expect(row).toHaveCount(1);
      await row.locator('button:has(svg.lucide-chevron-down)').click();
      const url = row.getByPlaceholder('https://...');

      await url.fill(URL_B);
      await expect(panelSave(page), 'a changed URL must enable Save').toBeEnabled();
      await url.fill(URL_A);
      await expect(panelSave(page), 'changed back to the saved URL: Save goes disabled again').toBeDisabled();
      await url.fill(URL_B);
      await expect(panelSave(page)).toBeEnabled();

      await clickSave(page);
      await expect.poll(async () => (await markerRows(page, snap.id)).map((r) => r.url), { timeout: 30_000 })
        .toEqual([URL_B]);
      await expect(panelSave(page), 'just saved: nothing left to save').toBeDisabled();

      const after = await readBlock(page, modeId, 'social_links');
      expect(after!.items.length, 'Save must write the change, not add rows').toBe(snap.items.length + 1);
      await page.screenshot({ path: 'tests/screenshots/79-social-links-after-save.png' });
    } finally {
      await drainToasts(page).catch(() => {});
      await restoreBlock(page, snap);
      await sweep(page, modeId);
    }
  });

  test('BioEditor — dirty cycle, the one bio row carries the change (twice)', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const modeId = await editingModeId(page);
    await sweep(page, modeId);

    const snap = await readBlock(page, modeId, 'bio');
    if (!snap) throw new Error('no bio block on the editing mode — reseed the battery');
    if (snap.items.some((i) => (i.label || '').startsWith(MARKER))) {
      throw new Error('the bio row still carries a SPEC79 label from a killed run — reseed the battery');
    }
    const inserts = countItemInserts(page);
    const expectedRows = Math.max(snap.items.length, 1);

    try {
      await openRailRow(page, 'bio');
      const text = panel(page).locator('textarea');
      await expect(text).toBeVisible();
      const original = await text.inputValue();
      await expect(panelSave(page), 'Save must start disabled — nothing changed yet').toBeDisabled();

      await text.fill(`${MARKER} bio A`);
      await expect(panelSave(page), 'changed text must enable Save').toBeEnabled();
      await text.fill(original);
      await expect(panelSave(page), 'changed back to the saved text: Save goes disabled again').toBeDisabled();
      await text.fill(`${MARKER} bio B`);
      await expect(panelSave(page)).toBeEnabled();

      await clickSave(page);
      await expect(page.getByText(T['blockEditor.bioSaved'], { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      await expect(panelSave(page), 'just saved: nothing left to save').toBeDisabled();
      let now = await readBlock(page, modeId, 'bio');
      expect(now!.items[0]?.label, 'the bio row carries the change').toBe(`${MARKER} bio B`);
      expect(now!.items.length, 'one bio row, not a second one').toBe(expectedRows);

      // Re-save on the still-open panel: the SAME row updates, nothing inserts.
      await drainToasts(page);
      await text.fill(`${MARKER} bio C`);
      await expect(panelSave(page)).toBeEnabled();
      await clickSave(page);
      await expect.poll(async () => (await readBlock(page, modeId, 'bio'))!.items[0]?.label, { timeout: 30_000 })
        .toBe(`${MARKER} bio C`);
      await expect(panelSave(page)).toBeDisabled();
      now = await readBlock(page, modeId, 'bio');
      expect(now!.items.length, 'a re-save must not add a bio row').toBe(expectedRows);
      expect(inserts.n, 'block_items inserts across both saves').toBe(snap.items.length ? 0 : 1);
    } finally {
      await drainToasts(page).catch(() => {});
      await restoreBlock(page, snap);
      await sweep(page, modeId);
    }
  });

  /** Borrow the page1 events block, or create one (deleted whole afterwards). */
  async function acquireEvents(page: Page, modeId: string) {
    const existing = await readBlock(page, modeId, 'events');
    if (existing) return { blockId: existing.id, snap: existing, created: false };
    const blockId = await sb<string>(
      page,
      `const { data, error } = await sb.from('blocks')
         .insert({ mode_id: arg.modeId, type: 'events', order_index: 97, is_enabled: true, title: arg.marker + ' Events' })
         .select('id').single();
       if (error) throw new Error('events block insert: ' + error.message);
       return data.id;`,
      { modeId, marker: MARKER },
    );
    return { blockId, snap: null, created: true };
  }

  async function releaseEvents(page: Page, modeId: string, ev: { blockId: string; snap: { id: string; title: string | null; items: ItemRow[] } | null; created: boolean }) {
    if (ev.created) {
      await sb<void>(
        page,
        `await sb.from('block_items').delete().eq('block_id', arg);
         const { error } = await sb.from('blocks').delete().eq('id', arg);
         if (error) throw new Error('events block delete: ' + error.message);`,
        ev.blockId,
      );
    } else if (ev.snap) {
      await restoreBlock(page, ev.snap);
    }
    await sweep(page, modeId);
  }

  test('EventsEditor — dirty cycle, one row carries the change', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const modeId = await editingModeId(page);
    await sweep(page, modeId);
    const ev = await acquireEvents(page, modeId);

    const TITLE_A = `${MARKER} Event A`;
    const TITLE_B = `${MARKER} Event B`;
    await sb<void>(
      page,
      `const { error } = await sb.from('block_items')
         .insert({ block_id: arg.blockId, label: arg.label, url: '', order_index: 0 });
       if (error) throw new Error('seed event: ' + error.message);`,
      { blockId: ev.blockId, label: TITLE_A },
    );

    try {
      await openRailRow(page, 'events');
      await expect(panelSave(page), 'Save must start disabled — nothing changed yet').toBeDisabled();

      await panel(page).getByRole('button', { name: TITLE_A }).click();
      const title = panel(page).getByPlaceholder(T['eventsEditor.eventTitlePlaceholder']);
      await expect(title).toHaveValue(TITLE_A);

      await title.fill(TITLE_B);
      await expect(panelSave(page), 'a changed title must enable Save').toBeEnabled();
      await title.fill(TITLE_A);
      await expect(panelSave(page), 'changed back to the saved title: Save goes disabled again').toBeDisabled();
      await title.fill(TITLE_B);
      await expect(panelSave(page)).toBeEnabled();

      await clickSave(page);
      await expect(page.getByText(T['eventsEditor.saved'], { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      await expect(panelSave(page), 'just saved: nothing left to save').toBeDisabled();
      expect((await markerRows(page, ev.blockId)).map((r) => r.label), 'exactly one row, carrying the change')
        .toEqual([TITLE_B]);
    } finally {
      await drainToasts(page).catch(() => {});
      await releaseEvents(page, modeId, ev);
    }
  });

  test('EventsEditor — a draft saved, changed and saved again is ONE row (one insert)', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const modeId = await editingModeId(page);
    await sweep(page, modeId);
    const ev = await acquireEvents(page, modeId);
    const inserts = countItemInserts(page);

    const TITLE_1 = `${MARKER} Draft one`;
    const TITLE_2 = `${MARKER} Draft two`;

    try {
      await openRailRow(page, 'events');
      await expect(panelSave(page)).toBeDisabled();

      await panel(page).getByRole('button', { name: T['eventsEditor.addEvent'] }).click();
      // An empty "Add event" row is pruned by Save, so it is not a change.
      await expect(panelSave(page), 'an empty draft is nothing to save').toBeDisabled();
      const title = panel(page).getByPlaceholder(T['eventsEditor.eventTitlePlaceholder']);
      await title.fill(TITLE_1);
      await expect(panelSave(page)).toBeEnabled();

      await clickSave(page);
      await expect(page.getByText(T['eventsEditor.saved'], { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      await expect(panelSave(page), 'just saved: a second press is not possible').toBeDisabled();
      expect((await markerRows(page, ev.blockId)).map((r) => r.label)).toEqual([TITLE_1]);

      // Same open panel: reopen the now-saved row, change it, Save again.
      await drainToasts(page);
      await panel(page).getByRole('button', { name: TITLE_1 }).click();
      await title.fill(TITLE_2);
      await expect(panelSave(page)).toBeEnabled();
      await clickSave(page);
      await expect.poll(async () => (await markerRows(page, ev.blockId)).map((r) => r.label), { timeout: 30_000 })
        .toEqual([TITLE_2]);
      await expect(panelSave(page)).toBeDisabled();
      expect(inserts.n, 'the draft is inserted once; the re-save updates it').toBe(1);
    } finally {
      await drainToasts(page).catch(() => {});
      await releaseEvents(page, modeId, ev);
    }
  });
});
