// TL.STOR.8.2 — replacing an item's image in FeaturedMediaEditor and
// ProductCardsEditor deletes the object it supersedes.
//
// Both editors already removed a DELETED item's object (TL.STOR.5-era). The
// REPLACE case leaked: "Change photo" uploaded a fresh `products/<uid>/<uuid>`
// object, the row moved to it, and the old object stayed in the bucket forever.
// The fix is the EventsEditor pattern: after the block_items UPDATE commits,
// diff the FETCHED row's image_url (existingItems, never the draft) against
// what was just written and removePublicObject() the loser — best-effort, never
// blocking the save.
//
// THE TRAP THIS SPEC IS BUILT AROUND (TL.STOR.4, on the record): a storage
// delete with no policy behind it returns data:[] with error:null, and a
// deleted object's public URL keeps serving from the CDN for ~an hour. Absence
// is therefore proved by list() only — never by an error, never by HTTP.
//
// FIXTURES — two strategies, because the two blocks sit differently on the
// canonical account (the spec-45 precedent):
//   • PRODUCT CARDS is canonical and singleton per mode (TL.BLOCK.1), so a
//     second block cannot be inserted. The spec BORROWS the account's own
//     block: it adds ONE temporary item, replaces that item's image, and in
//     the finally deletes the item and puts back what the editor's Save
//     rewrites on the way (blocks.title gets the config JSON; every kept item
//     is re-written with the editor's defaults, e.g. currency null → 'USD').
//     Title and the item columns the editor writes are snapshotted before and
//     restored after, verbatim.
//   • FEATURED MEDIA is not in the default tree, so a block is CREATED on the
//     editing mode, used, and deleted whole with its items.
// Every object this spec uploads is named `spec70-…` and every row it inserts
// carries a `SPEC70` marker, so a run killed mid-flight is healed by the next
// one's pre-flight sweep instead of accumulating.
//
// Desktop viewport under both projects (the spec-52 convention): the Add
// Content panel and its Sections rail are the door to both editors, and the
// DPR-1 pin keeps the mobile project's rasteriser from starving the panel's
// slide transitions.
import { test, expect, allowWrites, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { PINNED_TEST_USER_ID } from './helpers/auth';

const T = translations.en;

test.use({ deviceScaleFactor: 1 });
const DESKTOP = { width: 1440, height: 1000 };

const BUCKET = 'products';
const MARKER = 'SPEC70';

// TL.ISO.2 write opt-in — this spec REALLY writes: it uploads to and deletes
// from the products bucket, inserts/updates/deletes block_items, borrows (and
// restores) the product block's title, and creates/deletes a featured_media
// block. list() is a POST to storage/v1/object/list/products and the guard
// treats POST as mutating, so the read is declared too.
const WRITE_PREFIXES = [
  'rest/v1/blocks',
  'rest/v1/block_items',
  'storage/v1/object/products',
  'storage/v1/object/list/products',
];

/** Run a supabase query with the app's own client (RLS as the signed-in user).
 *  Re-imported per call: every navigation wipes anything cached on window. */
const sb = <R,>(page: Page, fn: string, arg?: unknown): Promise<R> => page.evaluate(
  async ({ body, a }) => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
  },
  { body: fn, a: arg ?? null },
);

/** Every object under the account's own products folder, by bare file name. */
const listNames = (page: Page): Promise<string[]> => sb<string[]>(
  page,
  `const { data, error } = await sb.storage.from('${BUCKET}').list(arg, { limit: 1000 });
   if (error) throw error;
   return data.map((o) => o.name);`,
  PINNED_TEST_USER_ID,
);

/** The object name behind a public products URL, relative to the uid folder —
 *  the same key list() reports. Fails loudly on a URL from anywhere else. */
function nameOf(url: string | null, label: string): string {
  const marker = `/object/public/${BUCKET}/${PINNED_TEST_USER_ID}/`;
  const idx = (url || '').indexOf(marker);
  expect(idx, `${label} is not an object in the pinned account's products folder: ${url}`)
    .toBeGreaterThan(-1);
  return decodeURIComponent((url as string).slice(idx + marker.length).split('?')[0]);
}

/** A 400×400 flat-fill PNG minted in the page, as a Playwright file payload. */
async function mintPng(page: Page, fill: string, name: string) {
  const dataUrl = await page.evaluate((color) => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 400;
    const x = c.getContext('2d')!;
    x.fillStyle = color;
    x.fillRect(0, 0, 400, 400);
    return c.toDataURL('image/png');
  }, fill);
  return { name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

/** Upload a minted PNG to products/<uid>/spec70-<uuid>.png with the app's own
 *  client (RLS as the battery) and return its public URL + object name. */
async function uploadSeed(page: Page, fill: string): Promise<{ url: string; name: string }> {
  const png = await mintPng(page, fill, 'seed.png');
  const name = `spec70-${crypto.randomUUID()}.png`;
  const url = await sb<string>(
    page,
    `const bytes = Uint8Array.from(atob(arg.b64), (ch) => ch.charCodeAt(0));
     const path = arg.uid + '/' + arg.name;
     const { error } = await sb.storage.from('${BUCKET}')
       .upload(path, new Blob([bytes], { type: 'image/png' }), { contentType: 'image/png' });
     if (error) throw new Error('seed upload: ' + error.message);
     return sb.storage.from('${BUCKET}').getPublicUrl(path).data.publicUrl;`,
    { b64: png.buffer.toString('base64'), uid: PINNED_TEST_USER_ID, name },
  );
  return { url, name };
}

/** Remove objects by bare name; a no-op for names that are already gone. */
const removeObjects = (page: Page, names: string[]) => sb<void>(
  page,
  `if (!arg.names.length) return;
   const { error } = await sb.storage.from('${BUCKET}')
     .remove(arg.names.map((n) => arg.uid + '/' + n));
   if (error) throw new Error('remove: ' + error.message);`,
  { names, uid: PINNED_TEST_USER_ID },
);

/** The mode the dashboard edits: page1 of the account's one page. */
const editingModeId = (page: Page): Promise<string> => sb<string>(
  page,
  `const { data: pg, error } = await sb.from('pages').select('id').eq('user_id', arg).maybeSingle();
   if (error) throw error;
   if (!pg) throw new Error('no pages row for the pinned account');
   const { data: modes } = await sb.from('modes').select('id,type').eq('page_id', pg.id);
   const m = (modes || []).find((x) => x.type === 'page1') || (modes || [])[0];
   if (!m) throw new Error('no mode on the pinned account\\'s page');
   return m.id;`,
  PINNED_TEST_USER_ID,
);

/** Put the account back from any state a killed run can leave it in: every
 *  SPEC70-labelled item, every SPEC70-titled featured_media block, every
 *  spec70-* object. Runs as the pre-flight AND inside each finally. */
async function sweep(page: Page, modeId: string): Promise<void> {
  await sb<void>(
    page,
    `const { data: blocks } = await sb.from('blocks').select('id,type,title').eq('mode_id', arg.modeId);
     const ids = (blocks || []).map((b) => b.id);
     if (ids.length) {
       // PW-SCOPED-READS ok: ids are this mode's own blocks (the .eq('mode_id') read above); .in() is that scope.
       const { data: items } = await sb.from('block_items').select('id,label').in('block_id', ids);
       const junk = (items || []).filter((i) => (i.label || '').startsWith(arg.marker)).map((i) => i.id);
       if (junk.length) {
         const { error } = await sb.from('block_items').delete().in('id', junk);
         if (error) throw new Error('sweep items: ' + error.message);
       }
     }
     for (const b of (blocks || [])) {
       if (b.type === 'featured_media' && (b.title || '').startsWith(arg.marker)) {
         await sb.from('block_items').delete().eq('block_id', b.id);
         const { error } = await sb.from('blocks').delete().eq('id', b.id);
         if (error) throw new Error('sweep block: ' + error.message);
       }
     }`,
    { modeId, marker: MARKER },
  );
  const leftovers = (await listNames(page)).filter((n) => n.startsWith('spec70-'));
  await removeObjects(page, leftovers);
}

const readItemImage = (page: Page, itemId: string): Promise<string | null> => sb<string | null>(
  page,
  `const { data, error } = await sb.from('block_items').select('image_url').eq('id', arg).maybeSingle();
   if (error) throw error;
   return data ? data.image_url : null;`,
  itemId,
);

/** Mount the editor and open the Add Content panel, where the Sections rail
 *  lives (TL.SECT.2c). Fresh mount every time: the editors read block_items
 *  on open, and `existingItems` must hold the row this spec just seeded. */
async function openRailRow(page: Page, blockType: 'product_cards' | 'featured_media'): Promise<void> {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Edit Profile|Editar perfil/i }).first().click();
  await expect(page.getByTestId('sections-group-toggle')).toBeVisible();
  const row = page.locator(`[data-testid="section-row"][data-section-type="${blockType}"]`);
  await expect(row, `no ${blockType} row on the Sections rail`).toHaveCount(1);
  await row.locator('button').first().click();
}

/** The slide-in panel's own Save (the editor footer), not anything on the canvas. */
const panelSave = (page: Page) =>
  page.locator('.fixed.top-16').getByRole('button', { name: T['blockEditor.save'], exact: true });

/** THE CLEANUP PROOF: the superseded object must leave list(), and the row must
 *  now point at exactly one new object that IS in list(). */
async function assertReplaced(page: Page, itemId: string, oldName: string, before: string[]): Promise<string> {
  await expect.poll(
    async () => (await listNames(page)).includes(oldName),
    {
      timeout: 20_000,
      message:
        `the superseded object ${oldName} must be GONE from list(). If it is still here, ` +
        'the DELETE silently no-opped — the STOR.4 trap: a storage delete with no policy ' +
        'behind it returns data:[] with error:null.',
    },
  ).toBe(false);

  const newName = nameOf(await readItemImage(page, itemId), 'row.image_url after Save');
  expect(newName, 'the row must have moved off the seeded object').not.toBe(oldName);

  const after = await listNames(page);
  expect(after, 'the replacement object is missing from the bucket').toContain(newName);
  const appeared = after.filter((n) => !before.includes(n));
  expect(appeared, 'exactly one new object may appear: the replacement').toEqual([newName]);
  return newName;
}

test.describe('replacing an item image removes the superseded object (TL.STOR.8.2)', () => {
  test.beforeEach(async ({ page }) => {
    await allowWrites(page, WRITE_PREFIXES);
    await page.setViewportSize(DESKTOP);
  });

  test('ProductCardsEditor — Change photo + Save deletes the old object', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const modeId = await editingModeId(page);
    await sweep(page, modeId);

    // Borrow the account's own product block. Snapshot what the editor's Save
    // rewrites — the title (config JSON goes in) and every kept item's
    // editor-owned columns — so the finally can hand them back verbatim.
    type ItemSnap = Record<string, unknown> & { id: string };
    const block = await sb<{ id: string; title: string | null; items: ItemSnap[] }>(
      page,
      `const { data: blocks } = await sb.from('blocks')
         .select('id,title').eq('mode_id', arg).eq('type', 'product_cards');
       const b = (blocks || [])[0];
       if (!b) throw new Error('no product_cards block on the editing mode — reseed the account');
       const { data: items, error } = await sb.from('block_items')
         .select('id,label,url,image_url,subtitle,badge,is_adult,order_index,price,compare_at_price,currency,cta_label')
         .eq('block_id', b.id);
       if (error) throw error;
       return { id: b.id, title: b.title, items: items || [] };`,
      modeId,
    );

    const seed = await uploadSeed(page, '#c0392b');
    const before = await listNames(page);
    expect(before, 'seed object missing after upload').toContain(seed.name);

    const itemId = await sb<string>(
      page,
      `const { data, error } = await sb.from('block_items')
         .insert({ block_id: arg.blockId, label: arg.label, url: 'https://example.com/spec70',
                   image_url: arg.url, order_index: 99 })
         .select('id').single();
       if (error) throw new Error('seed item: ' + error.message);
       return data.id;`,
      { blockId: block.id, label: `${MARKER}-PRODUCT`, url: seed.url },
    );

    let newName: string | null = null;
    try {
      await openRailRow(page, 'product_cards');

      // Select the seeded tile, then hand the "Change photo" input a new file.
      const tile = page.locator(`.fixed.top-16 img[src="${seed.url}"]`);
      await expect(tile).toBeVisible();
      await tile.click();
      const changeBtn = page.getByRole('button', { name: T['productCardsEditor.changePhoto'], exact: true });
      await expect(changeBtn).toBeVisible();
      await changeBtn.locator('xpath=..').locator('input[type="file"]')
        .setInputFiles(await mintPng(page, '#2980b9', 'replacement.png'));

      await panelSave(page).click();
      await expect(page.getByText(T['productCardsEditor.saved'], { exact: true }))
        .toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'tests/screenshots/70-product_cards-after-replace.png' });

      newName = await assertReplaced(page, itemId, seed.name, before);
    } finally {
      // Item out, title and the canonical items' columns back, objects gone.
      await sb<void>(
        page,
        `await sb.from('block_items').delete().eq('id', arg.itemId);
         const { error } = await sb.from('blocks').update({ title: arg.title }).eq('id', arg.blockId);
         if (error) throw new Error('title restore: ' + error.message);
         for (const it of arg.items) {
           const { id, ...cols } = it;
           const { error: e } = await sb.from('block_items').update(cols).eq('id', id);
           if (e) throw new Error('item restore: ' + e.message);
         }`,
        { itemId, blockId: block.id, title: block.title, items: block.items },
      );
      await removeObjects(page, [seed.name, ...(newName ? [newName] : [])]);
      await sweep(page, modeId);
      const names = await listNames(page);
      expect(names.filter((n) => n.startsWith('spec70-')), 'spec70 objects left in the bucket').toEqual([]);
    }
  });

  test('FeaturedMediaEditor — Change + Save deletes the old object', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const modeId = await editingModeId(page);
    await sweep(page, modeId);

    const seed = await uploadSeed(page, '#8e44ad');
    const before = await listNames(page);
    expect(before, 'seed object missing after upload').toContain(seed.name);

    // featured_media is not canonical, so a fresh block is safe under the
    // singleton index; it is deleted whole in the finally.
    const { blockId, itemId } = await sb<{ blockId: string; itemId: string }>(
      page,
      `const { data: b, error } = await sb.from('blocks')
         .insert({ mode_id: arg.modeId, type: 'featured_media', order_index: 98, is_enabled: true,
                   title: arg.marker + ' Featured' })
         .select('id').single();
       if (error) throw new Error('block insert: ' + error.message);
       const { data: it, error: e2 } = await sb.from('block_items')
         .insert({ block_id: b.id, label: arg.marker + '-MEDIA', url: 'https://example.com/spec70',
                   image_url: arg.url, order_index: 0 })
         .select('id').single();
       if (e2) throw new Error('item insert: ' + e2.message);
       return { blockId: b.id, itemId: it.id };`,
      { modeId, marker: MARKER, url: seed.url },
    );

    let newName: string | null = null;
    try {
      await openRailRow(page, 'featured_media');

      // Expand the seeded item's card (its chevron), then feed its hidden input.
      const card = page.locator(`.fixed.top-16 img[src="${seed.url}"]`)
        .locator('xpath=ancestor::div[contains(@class,"rounded-lg") and contains(@class,"border")][1]');
      await expect(card).toBeVisible();
      await card.locator('button:has(svg.lucide-chevron-down)').click();
      await card.locator('input[type="file"]')
        .setInputFiles(await mintPng(page, '#27ae60', 'replacement.png'));

      await panelSave(page).click();
      await expect(page.getByText(T['featuredMediaEditor.saved'], { exact: true }))
        .toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'tests/screenshots/70-featured_media-after-replace.png' });

      newName = await assertReplaced(page, itemId, seed.name, before);
    } finally {
      await sb<void>(
        page,
        `await sb.from('block_items').delete().eq('block_id', arg);
         const { error } = await sb.from('blocks').delete().eq('id', arg);
         if (error) throw new Error('block delete: ' + error.message);`,
        blockId,
      );
      await removeObjects(page, [seed.name, ...(newName ? [newName] : [])]);
      await sweep(page, modeId);
      const names = await listNames(page);
      expect(names.filter((n) => n.startsWith('spec70-')), 'spec70 objects left in the bucket').toEqual([]);
    }
  });
});
