// MEDIA.PHOTO.2 — every creator image goes through ONE prepare step before
// Storage (src/lib/prepare-image.ts): decode with EXIF orientation baked in →
// WebP ≤ 4096 px → upload with a 1-year cache header. The unified 40 MB input
// gate replaces the per-site byte caps (2 MB link thumbs, 5 MB elsewhere).
//
//   1. GALLERY — tests/fixtures/exif-rotated.jpg (1600×1200, Orientation=6, a
//      GPS IFD; built by scripts/make-exif-fixture.mjs) goes through the Gallery
//      editor's Save. The stored object is image/webp, carries no EXIF/XMP RIFF
//      chunk and none of the fixture's GPS rationals, decodes 1200×1600 (the
//      orientation was APPLIED, not copied), and the visitor's tile renders it.
//   2. LINK THUMBNAIL — a ~3 MB PNG (over the old 2 MB cap) uploads through
//      ThumbnailUpload and renders.
//   3. GIF — passes through byte-identical (animation would die in a re-encode).
//
// Desktop only (the Gallery door is spec 41's "+" tile, pinned to the 'full'
// layout; ThumbnailUpload's door is the Links row of the section list), battery
// account. Writes are declared per test; every object and row this spec creates
// is removed in a finally, spec 67 / 70 style (storage absence is proved by
// list(), never by an HTTP fetch of the public URL — CDN serves deleted objects
// for an hour).
import { readFileSync } from 'node:fs';
import { test, expect, allowWrites, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { PINNED_TEST_USER_ID, TEST_HANDLE } from './helpers/auth';

const T = translations.en;

test.use({ deviceScaleFactor: 1, viewport: { width: 1440, height: 1000 } });
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop',
    'MEDIA.PHOTO.2: desktop only — the doors (gallery "+" tile, section-list rows) are desktop-laid-out');
});

const FIXTURE = readFileSync('tests/fixtures/exif-rotated.jpg');
const OBJECT = '/storage/v1/object/public/';

const panelOf = (page: Page) => page.locator('[class*="z-[120]"]');
const panelTiles = (page: Page) => panelOf(page).locator(`img[alt="${T['galleryEditor.photoAlt']}"]`);

/** Run a supabase query with the app's own client (RLS as the signed-in user). */
const sb = <R,>(page: Page, fn: string, arg?: unknown): Promise<R> => page.evaluate(
  async ({ body, a }) => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as never)['supabase'], a);
  },
  { body: fn, a: arg ?? null },
);

interface Row { id: string; image_url: string; order_index: number }
const galleryItems = (page: Page, blockId: string) => sb<Row[]>(page, `
  const { data } = await sb.from('block_items').select('id,image_url,order_index').eq('block_id', arg);
  return (data || []).sort((a, b) => a.order_index - b.order_index);`, blockId);

/** Spec 41's door: pin the account's gallery to 'full' (the only layout with a
 *  "+" tile), remembering the title to restore. */
const pinFullLayout = async (page: Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  const blocks = await sb<Array<{ id: string; title: string | null; srcs: string[] }>>(page, `
    // PW-SCOPED-READS ok: discovery - the DOM discriminator below picks the block.
    const { data: rows } = await sb.from('blocks').select('id,title,type');
    const out = [];
    for (const b of (rows || []).filter(x => x.type === 'gallery')) {
      const { data } = await sb.from('block_items').select('image_url,order_index').eq('block_id', b.id);
      out.push({ id: b.id, title: b.title, srcs: (data || []).sort((x, y) => x.order_index - y.order_index).map(r => r.image_url) });
    }
    return out;`);
  let target: { id: string; title: string | null } | null = null;
  for (const b of blocks) {
    if (b.srcs.length && await page.locator(`img[src="${b.srcs[0]}"]`).count()) { target = b; break; }
  }
  if (!target) throw new Error('no gallery block is rendered in the editor');
  const { id, title } = target;
  await sb(page, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`,
    { id, t: JSON.stringify({ layout: 'full', autoScroll: true, speed: 'slow' }) });
  return {
    blockId: id,
    restore: async (p: Page) => {
      await sb(p, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`, { id, t: title });
    },
  };
};

const openGalleryPanel = async (page: Page) => {
  await page.goto('/dashboard/editor');
  const plus = page.locator('button:visible').filter({ hasText: /^\+$/ }).first();
  await plus.waitFor({ timeout: 25_000 });
  await plus.scrollIntoViewIfNeeded();
  await plus.click();
  await expect(panelTiles(page).first()).toBeVisible({ timeout: 15_000 });
};

/** TL.GAL.1b harness note: a sonner toast parks over the panel footer and
 *  swallows the next click. Park the pointer away and let it clear first. */
const doSave = async (page: Page) => {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  await panelOf(page).getByRole('button', { name: T['blockEditor.save'], exact: true }).click();
  await expect(panelOf(page).getByRole('button', { name: T['blockEditor.saving'] })).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1200);
};

/** Delete gallery rows this spec created (and their objects). */
const sweepGallery = (page: Page, blockId: string, keep: string[]) => sb<number>(page, `
  const { data } = await sb.from('block_items').select('id,image_url').eq('block_id', arg.blockId);
  const extra = (data || []).filter(r => !arg.keep.includes(r.id));
  for (const row of extra) {
    await sb.from('block_items').delete().eq('id', row.id);
    const path = (row.image_url || '').split('/products/')[1];
    if (path) await sb.storage.from('products').remove([decodeURIComponent(path)]);
  }
  return extra.length;`, { blockId, keep });

/** Fetch a stored object inside the page and report what it really is. */
type Stored = {
  status: number;
  contentType: string;
  cacheControl: string;
  size: number;
  width: number;
  height: number;
  riffChunks: string[];
  hasExifAscii: boolean;
  hasGpsLat: boolean;
};
const inspectStored = (page: Page, url: string, gpsLatHex: string): Promise<Stored> => page.evaluate(
  async ({ u, lat }) => {
    const r = await fetch(u, { cache: 'no-store' });
    const buf = new Uint8Array(await r.arrayBuffer());
    // RIFF chunk walk (WebP): 'RIFF' size 'WEBP' then (fourcc, size, payload)*.
    const fourcc = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    const chunks: string[] = [];
    if (fourcc(0) === 'RIFF' && fourcc(8) === 'WEBP') {
      let o = 12;
      while (o + 8 <= buf.length) {
        const id = fourcc(o);
        const sz = buf[o + 4] | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24);
        chunks.push(id);
        o += 8 + sz + (sz & 1);
      }
    }
    const asHex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    let width = 0; let height = 0;
    try {
      const bmp = await createImageBitmap(new Blob([buf], { type: r.headers.get('content-type') || '' }));
      width = bmp.width; height = bmp.height; bmp.close();
    } catch { /* reported as 0×0 */ }
    return {
      status: r.status,
      contentType: r.headers.get('content-type') || '',
      cacheControl: r.headers.get('cache-control') || '',
      size: buf.length,
      width, height,
      riffChunks: chunks,
      hasExifAscii: asHex.includes(ascii('Exif')),
      hasGpsLat: asHex.includes(lat),
    };
  },
  { u: url, lat: gpsLatHex },
);

/** The fixture's GPSLatitude rationals (37/1, 46/1, 30/1, little-endian) — the
 *  "GPS marker" that must NOT survive into the stored master. */
const GPS_LAT_HEX = Buffer.from([37, 0, 0, 0, 1, 0, 0, 0, 46, 0, 0, 0, 1, 0, 0, 0, 30, 0, 0, 0, 1, 0, 0, 0]).toString('hex');

/** The object name behind a public URL, relative to the bucket. */
const objectPath = (url: string, bucket: string): string => {
  const marker = `${OBJECT}${bucket}/`;
  const idx = url.indexOf(marker);
  expect(idx, `${url} is a ${bucket} object`).toBeGreaterThan(-1);
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
};

const listNames = (page: Page, bucket: string): Promise<string[]> => sb<string[]>(
  page,
  `const { data, error } = await sb.storage.from('${bucket}').list(arg, { limit: 1000 });
   if (error) throw error;
   return data.map((o) => o.name);`,
  PINNED_TEST_USER_ID,
);

/**
 * Open ONE link's detail panel (spec 21's door): tapping a card in the edit
 * preview bubbles to onItemEdit, which opens LinksEditor straight into that
 * item (directItemId). The section-list door only opens the LIST view, which
 * mounts no ThumbnailUpload — the hidden file input lives in the detail form.
 */
const openLinksPanel = async (page: Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  const frame = page.getByTestId('device-frame');
  await expect(frame).toBeVisible();
  // The first link card of the battery's Featured Links block, whatever it says.
  const card = frame.locator('a[href^="https://fixture.titilinks.test"]').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(page.getByTestId('link-detail-save')).toBeVisible({ timeout: 15_000 });
  await expect(panelOf(page).locator('input[type="file"]').first()).toBeAttached({ timeout: 15_000 });
};

/**
 * Upload one file through ThumbnailUpload (it uploads on pick) and return the
 * stored object's public URL from the POST the app made. Nothing is saved to a
 * row: the caller Cancels the panel.
 */
const uploadThumb = async (page: Page, file: { name: string; mimeType: string; buffer: Buffer }) => {
  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/storage/v1/object/page-assets/'),
    { timeout: 60_000 },
  );
  await panelOf(page).locator('input[type="file"]').first().setInputFiles(file);
  const res = await posted;
  expect(res.status(), 'the storage POST succeeded').toBeLessThan(300);
  await expect(page.getByText(T['thumbnailUpload.uploaded'], { exact: true })).toBeVisible({ timeout: 15_000 });
  const url = res.url().replace('/storage/v1/object/page-assets/', `${OBJECT}page-assets/`);
  return url;
};

const sweepPageAssets = (page: Page, paths: string[]) => sb<void>(page, `
  if (arg.length) await sb.storage.from('page-assets').remove(arg);`, paths);

test.describe('MEDIA.PHOTO.2 — one prepare step before every image upload', () => {
  test('1. an EXIF-rotated, GPS-tagged JPEG lands as an upright, metadata-free WebP master', async ({ page, browser }) => {
    test.slow();
    await allowWrites(page, ['rest/v1/blocks', 'rest/v1/block_items', 'storage/v1/object/products']);

    // The fixture really carries what we claim to strip.
    expect(FIXTURE.indexOf(Buffer.from('Exif\0\0')), 'fixture has an Exif APP1').toBeGreaterThan(0);
    expect(FIXTURE.toString('hex').includes(GPS_LAT_HEX), 'fixture has the GPS latitude IFD').toBe(true);

    const { blockId, restore } = await pinFullLayout(page);
    const baseline = await galleryItems(page, blockId);
    const baselineIds = baseline.map((r) => r.id);
    const cleanup = async () => {
      const ctx = await browser.newContext({ storageState: 'tests/.auth/user.json' });
      const p = await ctx.newPage();
      try {
        await p.goto('/dashboard/editor');
        await p.waitForTimeout(2000);
        await sweepGallery(p, blockId, baselineIds);
        await restore(p);
      } finally {
        await ctx.close();
      }
    };

    try {
      await openGalleryPanel(page);
      const before = await panelTiles(page).count();
      await panelOf(page).locator('input[type="file"]').setInputFiles({
        name: 'exif-rotated.jpg', mimeType: 'image/jpeg', buffer: FIXTURE,
      });
      await expect(panelTiles(page)).toHaveCount(before + 1);
      await doSave(page);

      const after = await galleryItems(page, blockId);
      const created = after.filter((r) => !baselineIds.includes(r.id));
      expect(created, 'Save inserted exactly one row').toHaveLength(1);
      const url = created[0].image_url;
      expect(url, 'the stored master is a .webp').toMatch(/\.webp$/);

      const stored = await inspectStored(page, url, GPS_LAT_HEX);
      expect(stored.status).toBe(200);
      expect(stored.contentType).toBe('image/webp');
      expect(stored.cacheControl, 'immutable UUID name → 1-year cache (audit gap #8)').toContain('max-age=31536000');
      expect(stored.riffChunks, 'a WebP with image data').toContain('VP8 ');
      expect(stored.riffChunks, 'no EXIF chunk survives the canvas re-encode').not.toContain('EXIF');
      expect(stored.riffChunks).not.toContain('XMP ');
      expect(stored.hasExifAscii, 'no "Exif" bytes anywhere').toBe(false);
      expect(stored.hasGpsLat, 'the GPS latitude rationals are gone').toBe(false);
      // Orientation=6 means "rotate 90° CW to display": the 1600×1200 sensor
      // frame is stored upright as 1200×1600, not tagged.
      expect({ w: stored.width, h: stored.height }).toEqual({ w: 1200, h: 1600 });
      expect(stored.size, 'well under the 5 MB bucket limit').toBeLessThan(5 * 1024 * 1024);

      // The visitor renders it.
      await page.goto(`/${TEST_HANDLE}`);
      const tile = page.locator(`img[src="${url}"]`).first();
      await expect(tile).toBeAttached({ timeout: 30_000 });
      await tile.scrollIntoViewIfNeeded();
      await expect.poll(() => tile.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        timeout: 30_000, message: 'the visitor tile decoded the WebP',
      }).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  test('2. a 3 MB PNG link thumbnail (over the old 2 MB cap) uploads and renders', async ({ page }) => {
    test.slow();
    await allowWrites(page, ['storage/v1/object/page-assets', 'storage/v1/object/list/page-assets']);

    // Noise does not compress: 1000×1000 RGBA noise is a > 3 MB PNG.
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 1000; c.height = 1000;
      const x = c.getContext('2d')!;
      const img = x.createImageData(1000, 1000);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0;
      x.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    });
    const buffer = Buffer.from(png.split(',')[1], 'base64');
    expect(buffer.length, 'the fixture is really over the old 2 MB cap').toBeGreaterThan(3 * 1024 * 1024);

    const uploaded: string[] = [];
    try {
      await openLinksPanel(page);
      const url = await uploadThumb(page, { name: 'big-thumb.png', mimeType: 'image/png', buffer });
      uploaded.push(objectPath(url, 'page-assets'));
      expect(url).toMatch(/\.webp$/);

      const stored = await inspectStored(page, url, GPS_LAT_HEX);
      expect(stored.status).toBe(200);
      expect(stored.contentType).toBe('image/webp');
      expect({ w: stored.width, h: stored.height }).toEqual({ w: 1000, h: 1000 });
      expect(stored.size, 'inside the page-assets 5 MB limit').toBeLessThan(5 * 1024 * 1024);

      // The thumbnail renders in the editor straight from the stored URL.
      const shown = page.locator(`img[src="${url}"]`).first();
      await expect(shown).toBeAttached({ timeout: 15_000 });
      await expect.poll(() => shown.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
        .toBeGreaterThan(0);

      // No row writes: Cancel the panel.
      await page.getByTestId('link-detail-cancel').click();
    } finally {
      await sweepPageAssets(page, uploaded);
      const left = await listNames(page, 'page-assets');
      for (const p of uploaded) expect(left, `${p} was removed`).not.toContain(p.split('/').pop());
    }
  });

  test('3. a GIF passes through byte-identical', async ({ page }) => {
    await allowWrites(page, ['storage/v1/object/page-assets', 'storage/v1/object/list/page-assets']);
    // The 1×1 transparent GIF (43 bytes).
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

    // The library's own word first: passthrough, same bytes, same name. The
    // module is served by the Vite dev server, so a page must be loaded first.
    await page.goto('/');
    const probe = await page.evaluate(async (b64) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const mod: any = await import('/src/lib/prepare-image.ts');
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const file = new File([bytes], 'tiny.gif', { type: 'image/gif' });
      const out = await mod.prepareImage(file);
      return { passthrough: out.passthrough, size: out.file.size, name: out.file.name, type: out.file.type, same: out.file === file };
    }, gif.toString('base64'));
    expect(probe).toEqual({ passthrough: true, size: gif.length, name: 'tiny.gif', type: 'image/gif', same: true });

    const uploaded: string[] = [];
    try {
      await openLinksPanel(page);
      const url = await uploadThumb(page, { name: 'tiny.gif', mimeType: 'image/gif', buffer: gif });
      uploaded.push(objectPath(url, 'page-assets'));
      expect(url).toMatch(/\.gif$/);
      const stored = await inspectStored(page, url, GPS_LAT_HEX);
      expect(stored.status).toBe(200);
      expect(stored.contentType).toBe('image/gif');
      expect(stored.size, 'byte-identical to the pick').toBe(gif.length);
      await page.getByTestId('link-detail-cancel').click();
    } finally {
      await sweepPageAssets(page, uploaded);
    }
  });
});
