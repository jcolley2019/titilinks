// IMG.FIT.1 — the shared picture fitter on link cards.
//
// A Large/Small link card's picture can be FILLED (today's cover, or a stored
// zoom/pan window — the gallery's method: a rectangle over the untouched
// original) or FITTED (the whole picture on a background colour, title below
// it). src/lib/picture-fit.ts is the one reader/writer of the stored keys;
// LinkButton paints through it, and PhotoCropSheet frames with it.
//
//   1. a card whose style_json carries none of the keys renders today's <img>
//      (no inline style, cover rendition in the srcset);
//   2. a crop framed at 16:10 paints the rectangle resolveGalleryGeometry
//      predicts on a Large card, and the same item in a pair covers its 4:3 box
//      with the picture's own aspect (the window is re-shaped, not stretched);
//   3. fit: the whole picture inside the picture area on fit_bg, no server
//      crop, title BELOW the picture, outer box equal to a Fill twin, a mixed
//      pair equal height;
//   4. an upload of a logo-like PNG opens the sheet in Fit with Auto chosen and
//      Cancel keeps that default; a noise PNG opens it in Fill;
//   5. Adjust → Fill → zoom → Apply → Save writes crop + crop_aspect 1.6 next to
//      a pre-existing animation; switching to Fit writes fit and drops crop;
//   6. the sheet fits a 360 px phone and the 420 px panel, EN and ES;
//   7. pasting an image uploads it onto the active card; pasting text types.
//
// Reads are patched the way spec 21 patches them (one links block; block
// writes swallowed — the block_items mock is stateful so a saved row reads
// back). Pictures are the battery account's own stored gallery fixtures;
// uploads (4, 7) are real page-assets objects, swept in a finally (spec 86).
import { test, expect, allowWrites, type Page, type Route, type Locator } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { resolveGalleryGeometry } from '../src/lib/gallery-framing';
import { TEST_HANDLE, PINNED_TEST_USER_ID } from './helpers/auth';

const EN = translations.en;
const ES = translations.es;
const PHONE = { width: 402, height: 874 };
const DESKTOP = { width: 1440, height: 1000 };

const FIXTURES = `https://ohmvlypcbrfkuudcuqub.supabase.co/storage/v1/object/public/products/${PINNED_TEST_USER_ID}/iso4`;
const PORTRAIT = `${FIXTURES}/iso4-gallery-01.png`; // 540×960
const WIDE = `${FIXTURES}/iso4-gallery-02.png`;     // 960×540
const SQUARE = `${FIXTURES}/iso4-gallery-03.png`;   // 800×800
const OBJECT = '/storage/v1/object/public/';
const BLOCK_ID = 'imgfit-links-block';
const CROP_1610 = { x: 20, y: 30, w: 50, h: 31.25 }; // 16:10 on a square source

type Item = {
  id: string; block_id: string; label: string; url: string; is_adult: boolean;
  order_index: number; subtitle: string | null; badge: string | null;
  image_url: string | null; size: string; bg_color: string | null;
  title_color: string | null; style_json: Record<string, unknown> | null;
};

const item = (id: string, order: number, label: string, size: string, image: string | null,
  style_json: Record<string, unknown> | null = null): Item => ({
  id, block_id: BLOCK_ID, label, url: `https://fixture.titilinks.test/${id}`, is_adult: false,
  order_index: order, subtitle: null, badge: null, image_url: image, size,
  bg_color: null, title_color: null, style_json,
});

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');
const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Spec 21's mocks over `items`. A block_items PATCH merges into the row it names. */
async function installReads(page: Page, items: Item[]) {
  let modeId = '';
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.continue();
    return asJson(route, wantsObject(route) ? { plan: 'pro' } : [{ plan: 'pro' }]);
  });
  await page.route('**/rest/v1/modes*', async (route) => {
    try {
      const res = await route.fetch();
      const body = await res.json();
      const arr = Array.isArray(body) ? body : [];
      modeId = (arr.find((m: { type?: string }) => m?.type === 'page1') ?? arr[0])?.id ?? '';
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    } catch {
      try { await route.continue(); } catch { /* page already closing */ }
    }
  });
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    return route.continue();
  });
  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') return asJson(route, []);
    const block = { id: BLOCK_ID, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 0 };
    return asJson(route, wantsObject(route) ? block : [block]);
  });
  await page.route('**/rest/v1/block_items*', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const id = /id=eq\.([^&]+)/.exec(req.url())?.[1];
      const row = items.find((i) => i.id === decodeURIComponent(id || ''));
      if (row) Object.assign(row, req.postDataJSON());
      return asJson(route, wantsObject(route) ? (row ?? {}) : (row ? [row] : []));
    }
    if (req.method() !== 'GET') return asJson(route, []);
    return asJson(route, wantsObject(route) ? items[0] : items);
  });
}

type Box = { x: number; y: number; width: number; height: number; right: number; bottom: number };
const rectOf = (loc: Locator): Promise<Box> => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
});

const loaded = (img: Locator) => expect.poll(
  () => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0),
  { timeout: 30_000, message: 'the card picture decoded' },
).toBe(true);

const card = (page: Page, label: string) => page.locator('.lb-velvet', { hasText: label }).first();

async function openPublic(page: Page, items: Item[]) {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installReads(page, items);
  await page.goto(`/${TEST_HANDLE}`);
  await expect(card(page, items[0].label)).toBeVisible({ timeout: 30_000 });
}

const panelOf = (page: Page) => page.locator('[class*="z-[120]"]');
const sheetOf = (page: Page) => page.getByTestId('picture-fit-sheet');

/** Open the editor, then tap the card labelled `label` to open its detail panel. */
async function openDetail(page: Page, label: string) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  const frame = page.getByTestId('device-frame');
  await expect(frame).toBeVisible();
  await frame.getByText(label, { exact: true }).first().click();
  await expect(page.getByTestId('link-detail-save')).toBeVisible({ timeout: 15_000 });
}

/** Spec 41's slider driver: React listens for `input`, so set the value natively. */
const setZoom = async (page: Page, value: number) => {
  const slider = sheetOf(page).locator('input[type=range]');
  await slider.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(400);
};

/** Run a supabase query with the app's own client (RLS as the signed-in user). */
const sb = <R,>(page: Page, fn: string, arg?: unknown): Promise<R> => page.evaluate(
  async ({ body, a }) => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as never)['supabase'], a);
  },
  { body: fn, a: arg ?? null },
);
const sweepPageAssets = (page: Page, paths: string[]) => sb<void>(page, `
  if (arg.length) await sb.storage.from('page-assets').remove(arg);`, paths);
const listNames = (page: Page): Promise<string[]> => sb<string[]>(page,
  `const { data, error } = await sb.storage.from('page-assets').list(arg, { limit: 1000 });
   if (error) throw error;
   return data.map((o) => o.name);`, PINNED_TEST_USER_ID);
const objectPath = (url: string) => {
  const marker = `${OBJECT}page-assets/`;
  return decodeURIComponent(url.slice(url.indexOf(marker) + marker.length).split('?')[0]);
};

/** A PNG built in the page: a flat white field with a small mark, or noise. */
const makePng = (page: Page, kind: 'logo' | 'noise'): Promise<Buffer> => page.evaluate((k) => {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 400;
  const x = c.getContext('2d')!;
  if (k === 'logo') {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 400, 400);
    x.fillStyle = '#1d4ed8'; x.fillRect(160, 160, 80, 80);
  } else {
    // 4 px blocks, not single pixels: the detector reads a 32 px downsample,
    // and per-pixel noise averages there into a flat grey that reads as a logo
    // (27 colours). Blocks survive it as a photo would (~300 colours).
    for (let by = 0; by < 400; by += 4) for (let bx = 0; bx < 400; bx += 4) {
      x.fillStyle = `rgb(${(Math.random() * 256) | 0},${(Math.random() * 256) | 0},${(Math.random() * 256) | 0})`;
      x.fillRect(bx, by, 4, 4);
    }
  }
  return c.toDataURL('image/png');
}, kind).then((d) => Buffer.from(d.split(',')[1], 'base64'));

const waitUpload = (page: Page) => page.waitForResponse(
  (r) => r.request().method() === 'POST' && r.url().includes('/storage/v1/object/page-assets/'),
  { timeout: 60_000 },
);
const publicUrlOf = (postUrl: string) => postUrl.replace('/storage/v1/object/page-assets/', `${OBJECT}page-assets/`);

// ─────────────────────────────────────────────────────────────────────────────
test.describe('IMG.FIT.1 — the public card', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('1. no picture keys: today\'s <img> on a Large card and a pair', async ({ page }) => {
    const items = [
      item('nk-large', 0, 'Plain large', 'big', WIDE),
      item('nk-left', 1, 'Plain left', 'small', PORTRAIT),
      item('nk-right', 2, 'Plain right', 'small', SQUARE, { animation: 'none' }),
    ];
    await openPublic(page, items);
    for (const label of ['Plain large', 'Plain left', 'Plain right']) {
      const c = card(page, label);
      await expect(c).not.toHaveClass(/lb-fit/);
      const img = c.locator('.lb-cover img');
      await expect(img).toHaveCount(1);
      const attrs = await img.evaluate((el) => ({
        names: el.getAttributeNames().sort(),
        srcset: el.getAttribute('srcset') || '',
        thumb: el.parentElement?.getAttribute('class'),
        thumbStyle: el.parentElement?.getAttribute('style'),
      }));
      expect(attrs.names, `${label}: the same four attributes as today`).toEqual(['alt', 'sizes', 'src', 'srcset']);
      expect(attrs.thumb).toBe('lb-thumb lb-cover');
      expect(attrs.thumbStyle).toBeNull();
      const candidates = attrs.srcset.split(',').map((s) => s.trim()).filter(Boolean);
      expect(candidates.length).toBeGreaterThan(1);
      for (const cand of candidates) {
        expect(cand, `${label}: a cover-cropped rendition`).toContain('resize=cover');
        expect(cand).toContain('height=');
      }
    }
  });

  test('2. a crop framed at 16:10 paints its rectangle on a Large card and re-shapes in a pair', async ({ page }) => {
    const framed = { crop: CROP_1610, crop_aspect: 1.6, animation: 'none' };
    const items = [
      item('cr-large', 0, 'Cropped large', 'big', SQUARE, framed),
      item('cr-left', 1, 'Cropped left', 'small', SQUARE, framed),
      item('cr-right', 2, 'Plain right', 'small', WIDE),
    ];
    await openPublic(page, items);

    // Large: exactly the gallery geometry (same box shape as the frame).
    const big = card(page, 'Cropped large');
    const bigImg = big.locator('.lb-cover img');
    await loaded(bigImg);
    const box = await rectOf(big.locator('.lb-cover'));
    const pic = await rectOf(bigImg);
    const geo = resolveGalleryGeometry({ crop: CROP_1610 })!;
    const want = {
      x: box.x + (geo.leftPct / 100) * box.width,
      y: box.y + (geo.topPct / 100) * box.height,
      width: (geo.widthPct / 100) * box.width,
      height: (geo.heightPct / 100) * box.height,
    };
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(pic[k] - want[k]), `Large: painted ${k} ${pic[k]} vs ${want[k]}`).toBeLessThanOrEqual(1);
    }
    // All four edges: the far edges are the rectangle's too, not .lb-cover img's inset:0.
    expect(Math.abs(pic.right - (want.x + want.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(pic.bottom - (want.y + want.height))).toBeLessThanOrEqual(1);
    const srcset = (await bigImg.getAttribute('srcset')) || '';
    expect(srcset, 'a framed picture asks for no server crop').not.toContain('resize=cover');
    expect(srcset).not.toContain('height=');

    // Pair: the 16:10 window re-shaped for a 4:3 box — it covers the box, unstretched.
    const half = card(page, 'Cropped left');
    const halfImg = half.locator('.lb-cover img');
    await loaded(halfImg);
    const hb = await rectOf(half.locator('.lb-cover'));
    const hp = await rectOf(halfImg);
    expect(Math.abs(hb.width / hb.height - 4 / 3), 'the pair box is 4:3').toBeLessThan(0.02);
    expect(hp.x, 'covers the left edge').toBeLessThanOrEqual(hb.x + 1);
    expect(hp.y, 'covers the top edge').toBeLessThanOrEqual(hb.y + 1);
    expect(hp.right, 'covers the right edge').toBeGreaterThanOrEqual(hb.right - 1);
    expect(hp.bottom, 'covers the bottom edge').toBeGreaterThanOrEqual(hb.bottom - 1);
    const natural = await halfImg.evaluate((el) => (el as HTMLImageElement).naturalWidth / (el as HTMLImageElement).naturalHeight);
    expect(Math.abs(hp.width / hp.height - natural) / natural, 'painted aspect = the picture\'s natural aspect').toBeLessThan(0.01);
  });

  test('3. fit: whole picture on fit_bg, title below, same outer box, equal pair', async ({ page }) => {
    const fit = { fit: 'contain', fit_bg: '#ff00ff' };
    const items = [
      item('ft-large', 0, 'Fit card', 'big', WIDE, fit),
      item('ft-twin', 1, 'Twin card', 'big', WIDE),
      item('ft-left', 2, 'Fit left', 'small', PORTRAIT, fit),
      item('ft-right', 3, 'Fill right', 'small', SQUARE),
    ];
    await openPublic(page, items);

    const fc = card(page, 'Fit card');
    const twin = card(page, 'Twin card');
    await expect(fc).toHaveClass(/lb-fit/);
    await expect(twin).not.toHaveClass(/lb-fit/);
    const area = fc.locator('.lb-cover');
    const img = area.locator('img');
    await loaded(img);

    const a = await rectOf(area);
    const im = await img.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const i = el as HTMLImageElement;
      const s = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight);
      const w = i.naturalWidth * s; const h = i.naturalHeight * s;
      return {
        fit: getComputedStyle(el).objectFit,
        x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, right: r.x + (r.width + w) / 2, bottom: r.y + (r.height + h) / 2,
      };
    });
    expect(im.fit).toBe('contain');
    expect(im.x, 'whole picture: left').toBeGreaterThanOrEqual(a.x - 0.5);
    expect(im.y, 'whole picture: top').toBeGreaterThanOrEqual(a.y - 0.5);
    expect(im.right, 'whole picture: right').toBeLessThanOrEqual(a.right + 0.5);
    expect(im.bottom, 'whole picture: bottom').toBeLessThanOrEqual(a.bottom + 0.5);
    const srcset = (await img.getAttribute('srcset')) || '';
    expect(srcset.length).toBeGreaterThan(0);
    expect(srcset, 'no server crop (it would cut the logo)').not.toContain('resize=cover');
    expect(srcset).not.toContain('height=');
    expect(await area.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 0, 255)');

    // Title below the picture, on the card's own surface, no gradient or shadow.
    const title = fc.locator('.lb-title');
    const tr = await rectOf(title);
    expect(tr.y, 'the title starts at or below the picture area').toBeGreaterThanOrEqual(a.bottom - 0.5);
    const look = await fc.locator('.lb-text').evaluate((el) => ({
      bg: getComputedStyle(el).backgroundImage,
      shadow: getComputedStyle(el.querySelector('.lb-title')!).textShadow,
      color: getComputedStyle(el.querySelector('.lb-title')!).color,
      root: getComputedStyle(el.closest('.lb-velvet')!).color,
    }));
    expect(look.bg).toBe('none');
    expect(look.shadow).toBe('none');
    expect(look.color, 'the card\'s own text colour').toBe(look.root);

    // Same outer box as the Fill twin.
    const fb = await rectOf(fc);
    const tb = await rectOf(twin);
    expect(Math.abs(fb.width - tb.width), `Large width ${fb.width} vs ${tb.width}`).toBeLessThanOrEqual(1);
    expect(Math.abs(fb.height - tb.height), `Large height ${fb.height} vs ${tb.height}`).toBeLessThanOrEqual(1);
    // The corner badge sits where the twin's does.
    const badge = (c: Locator) => c.locator('> span.absolute').first();
    const bf = await rectOf(badge(fc));
    const bt = await rectOf(badge(twin));
    expect(Math.abs((bf.x - fb.x) - (bt.x - tb.x)) + Math.abs((bf.y - fb.y) - (bt.y - tb.y))).toBeLessThanOrEqual(1);

    // A mixed pair stays equal height.
    const left = await rectOf(card(page, 'Fit left'));
    const right = await rectOf(card(page, 'Fill right'));
    expect(Math.abs(left.height - right.height), `pair ${left.height} vs ${right.height}`).toBeLessThanOrEqual(1);
    expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('IMG.FIT.1 — the editor', () => {
  test('4. an uploaded logo opens the sheet in Fit with Auto; a noise PNG opens Fill', async ({ page }) => {
    test.slow();
    await allowWrites(page, ['storage/v1/object/page-assets', 'storage/v1/object/list/page-assets']);
    await installReads(page, [item('up-large', 0, 'Upload large', 'big', WIDE)]);
    const uploaded: string[] = [];
    try {
      await openDetail(page, 'Upload large');
      const input = panelOf(page).locator('input[type="file"]').first();

      const logo = await makePng(page, 'logo');
      const posted = waitUpload(page);
      await input.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
      const res = await posted;
      expect(res.status()).toBeLessThan(300);
      uploaded.push(objectPath(publicUrlOf(res.url())));

      await expect(sheetOf(page)).toBeVisible({ timeout: 15_000 });
      await expect(sheetOf(page).getByText(EN['pictureFit.title'], { exact: true })).toBeVisible();
      await expect(page.getByTestId('fit-mode-fit')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('fit-bg-auto')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('fit-bg-white')).toHaveAttribute('aria-pressed', 'false');
      await page.getByTestId('picture-fit-cancel').click();
      await expect(sheetOf(page)).toHaveCount(0);
      // Cancel keeps the default the upload wrote: the preview card is in Fit.
      await expect(panelOf(page).locator('.lb-velvet.lb-fit')).toHaveCount(1);

      const noise = await makePng(page, 'noise');
      const posted2 = waitUpload(page);
      await input.setInputFiles({ name: 'noise.png', mimeType: 'image/png', buffer: noise });
      const res2 = await posted2;
      uploaded.push(objectPath(publicUrlOf(res2.url())));
      await expect(sheetOf(page)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('fit-mode-fill')).toHaveAttribute('aria-pressed', 'true');
      await page.getByTestId('picture-fit-cancel').click();
      await expect(sheetOf(page)).toHaveCount(0);
      // A new picture drops the old picture's framing: no longer Fit.
      await expect(panelOf(page).locator('.lb-velvet.lb-fit')).toHaveCount(0);

      await page.getByTestId('link-detail-cancel').click();
    } finally {
      await sweepPageAssets(page, uploaded);
      const left = await listNames(page);
      for (const p of uploaded) expect(left, `${p} was removed`).not.toContain(p.split('/').pop());
    }
  });

  test('5. Adjust → Fill → zoom → Apply → Save writes crop + crop_aspect; Fit drops crop', async ({ page }) => {
    test.slow();
    const items = [item('adj-large', 0, 'Adjust large', 'big', SQUARE, { animation: 'pulse' })];
    await installReads(page, items);
    await openDetail(page, 'Adjust large');

    await page.getByTestId('link-picture-adjust').click();
    await expect(sheetOf(page)).toBeVisible();
    await expect(page.getByTestId('fit-mode-fill')).toHaveAttribute('aria-pressed', 'true');
    await setZoom(page, 2);
    await page.getByTestId('picture-fit-apply').click();
    await expect(sheetOf(page)).toHaveCount(0);
    // The preview paints the staged crop through the live card's resolver.
    await expect.poll(() => panelOf(page).locator('.lb-cover img').first().getAttribute('style')).toContain('position: absolute');

    const patch1 = page.waitForRequest((r) => r.url().includes('/rest/v1/block_items') && r.method() === 'PATCH');
    await page.getByTestId('link-detail-save').click();
    const body1 = (await patch1).postDataJSON();
    expect(body1.style_json.animation, 'the pre-existing animation survives').toBe('pulse');
    expect(body1.style_json.crop).toBeTruthy();
    for (const k of ['x', 'y', 'w', 'h']) expect(typeof body1.style_json.crop[k]).toBe('number');
    expect(body1.style_json.crop.w, 'zoomed in: a smaller window').toBeLessThan(75);
    expect(body1.style_json.crop_aspect).toBeCloseTo(1.6, 6);
    expect(body1.style_json.fit).toBeUndefined();

    // Reopen the saved row (the mock now reads it back) and switch to Fit.
    await openDetail(page, 'Adjust large');
    await page.getByTestId('link-picture-adjust').click();
    await expect(sheetOf(page)).toBeVisible();
    await expect(page.getByTestId('fit-mode-fill')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('fit-mode-fit').click();
    await expect(page.getByTestId('fit-mode-fit')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('picture-fit-apply').click();
    await expect(panelOf(page).locator('.lb-velvet.lb-fit')).toHaveCount(1);

    const patch2 = page.waitForRequest((r) => r.url().includes('/rest/v1/block_items') && r.method() === 'PATCH');
    await page.getByTestId('link-detail-save').click();
    const body2 = (await patch2).postDataJSON();
    expect(body2.style_json.fit).toBe('contain');
    expect(body2.style_json.crop).toBeUndefined();
    expect(body2.style_json.crop_aspect).toBeUndefined();
    expect(body2.style_json.animation).toBe('pulse');
  });

  for (const lang of ['en', 'es'] as const) {
    test(`6. the sheet fits the 420 px panel and a 360 px phone (${lang.toUpperCase()})`, async ({ page }) => {
      const T = lang === 'es' ? ES : EN;
      if (lang === 'es') await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
      await installReads(page, [item('w-large', 0, 'Width large', 'big', SQUARE)]);
      await openDetail(page, 'Width large');
      await page.getByTestId('link-picture-adjust').click();
      await expect(sheetOf(page)).toBeVisible();
      await expect(sheetOf(page).getByText(T['pictureFit.title'], { exact: true })).toBeVisible();
      // Fit shows the Background row; the edge colour of the stored picture is readable.
      await page.getByTestId('fit-mode-fit').click();
      await expect(page.getByTestId('fit-bg-auto')).toBeVisible();

      for (const vp of [DESKTOP, { width: 360, height: 740 }]) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(300);
        await expect(sheetOf(page)).toBeVisible();
        const card = sheetOf(page).locator('> div').first();
        const cb = await rectOf(card);
        expect(cb.width, 'the sheet is at most panel width').toBeLessThanOrEqual(420.5);
        expect(cb.right).toBeLessThanOrEqual(vp.width + 0.5);
        const overflow = await card.evaluate((el) =>
          Array.from(el.querySelectorAll('*')).filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== 'hidden' && n.tagName !== 'INPUT').length);
        expect(overflow, 'nothing scrolls sideways inside the sheet').toBe(0);
        for (const id of ['fit-mode-fill', 'fit-mode-fit', 'fit-bg-auto', 'fit-bg-white', 'fit-bg-black', 'picture-fit-cancel', 'picture-fit-apply']) {
          const el = page.getByTestId(id);
          await expect(el, `${id} @${vp.width}`).toBeVisible();
          const r = await rectOf(el);
          expect(r.x, `${id} left @${vp.width}`).toBeGreaterThanOrEqual(cb.x - 0.5);
          expect(r.right, `${id} right @${vp.width}`).toBeLessThanOrEqual(cb.right + 0.5);
          expect(r.bottom, `${id} reachable @${vp.width}`).toBeLessThanOrEqual(vp.height + 0.5);
        }
        await expect(page.getByTestId('fit-mode-fill')).toContainText(T['pictureFit.fill'].slice(0, 6));
        await expect(page.getByTestId('fit-mode-fit')).toContainText(T['pictureFit.fit'].slice(0, 6));
      }
      await page.getByTestId('picture-fit-cancel').click();
      await expect(sheetOf(page)).toHaveCount(0);
    });
  }

  test('7. paste: an image lands on the active card and opens the sheet; text just types', async ({ page, browserName }) => {
    test.slow();
    await allowWrites(page, ['storage/v1/object/page-assets', 'storage/v1/object/list/page-assets']);
    await installReads(page, [item('pa-large', 0, 'Paste large', 'big', WIDE)]);
    const uploaded: string[] = [];
    try {
      await openDetail(page, 'Paste large');
      const canBuild = await page.evaluate(() => {
        try {
          const dt = new DataTransfer();
          dt.items.add(new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }));
          const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          return !!ev.clipboardData && ev.clipboardData.files.length === 1;
        } catch { return false; }
      });
      test.skip(!canBuild, `${browserName} cannot build a synthetic paste event carrying a file`);

      const logo = await makePng(page, 'logo');
      const posted = waitUpload(page);
      await page.evaluate((b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }, logo.toString('base64'));
      const res = await posted;
      expect(res.status()).toBeLessThan(300);
      const url = publicUrlOf(res.url());
      uploaded.push(objectPath(url));
      await expect(sheetOf(page)).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('picture-fit-cancel').click();
      await expect(sheetOf(page)).toHaveCount(0);
      await expect(panelOf(page).locator(`img[src="${url}"]`).first()).toBeAttached();

      // Text into the title field: the field gets the text, nothing uploads.
      let uploads = 0;
      page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/storage/v1/object/page-assets/')) uploads++; });
      const titleInput = panelOf(page).getByPlaceholder(EN['linksEditor.myLink']);
      await titleInput.fill('');
      await titleInput.focus();
      if (browserName === 'chromium') {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.evaluate(() => navigator.clipboard.writeText('Pasted title'));
        await page.keyboard.press('ControlOrMeta+V');
        await expect(titleInput).toHaveValue('Pasted title');
      } else {
        // No real clipboard in this engine: a synthetic text paste must reach
        // the field untouched (the hook leaves its default alone).
        const prevented = await titleInput.evaluate((el) => {
          const dt = new DataTransfer();
          dt.setData('text/plain', 'Pasted title');
          const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          el.dispatchEvent(ev);
          return ev.defaultPrevented;
        });
        expect(prevented, 'a text paste is not intercepted').toBe(false);
      }
      await page.waitForTimeout(800);
      expect(uploads, 'a text paste uploads nothing').toBe(0);
      await expect(sheetOf(page)).toHaveCount(0);
      await page.getByTestId('link-detail-cancel').click();
    } finally {
      await sweepPageAssets(page, uploaded);
      const left = await listNames(page);
      for (const p of uploaded) expect(left, `${p} was removed`).not.toContain(p.split('/').pop());
    }
  });
});
