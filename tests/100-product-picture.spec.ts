// IMG.FIT.2 — the shared picture fitter on product tiles.
//
// The SAME fitter IMG.FIT.1 put on link cards (src/lib/picture-fit.ts,
// PhotoCropSheet's `fit` prop, analyzePictureEdge, usePastedImage), on the
// Product Cards block: a tile's picture can be FILLED (today's cover, or a
// stored zoom/pan window over the untouched original) or FITTED (the whole
// picture on a background, the label / price / Buy block below it).
//
//   1. a product whose style_json carries none of the keys renders today's
//      <img> in all three layouts (same attributes, cover rendition);
//   2. a crop framed at 1:1 paints the predicted rectangle in grid, and the
//      same item in full covers its 3:4 tile with the picture's own aspect;
//   3. fit: the whole picture inside the picture area on fit_bg, no server
//      crop, the text block below the picture, the outer box equal to an
//      unfitted twin, in all three layouts;
//   4. a new picture always opens the sheet in Fill, logo-like or photo-like
//      (the product editor does no automatic Fit); choosing Fit on the logo
//      shows the Auto background chip, selected;
//   5. Adjust → Fill → zoom → Apply → Save writes crop + crop_aspect; a later
//      Save that changes another field still carries them; Fit sends
//      fit 'contain' and no crop;
//   6. paste: with a product selected it replaces that product's picture, with
//      none selected it adds a product; a text paste only types.
//
// Reads are patched the way spec 21 / spec 99 patch them (one product block;
// every write is answered here and the block_items mock is stateful so a saved
// row reads back). Pictures are the battery account's own stored fixtures.
// Nothing uploads: product pictures upload only on the panel's Save, and the
// Saves here keep the fixture pictures.
import { test, expect, type Page, type Route, type Locator } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { resolveGalleryGeometry } from '../src/lib/gallery-framing';
import { TEST_HANDLE, PINNED_TEST_USER_ID } from './helpers/auth';

const EN = translations.en;
const PHONE = { width: 402, height: 874 };
const DESKTOP = { width: 1440, height: 1000 };
test.use({ deviceScaleFactor: 1 });

const FIXTURES = `https://ohmvlypcbrfkuudcuqub.supabase.co/storage/v1/object/public/products/${PINNED_TEST_USER_ID}/iso4`;
const PORTRAIT = `${FIXTURES}/iso4-gallery-01.png`; // 540×960
const WIDE = `${FIXTURES}/iso4-gallery-02.png`;     // 960×540
const SQUARE = `${FIXTURES}/iso4-gallery-03.png`;   // 800×800
const BLOCK_ID = 'imgfit2-product-block';
const CROP_11 = { x: 20, y: 25, w: 50, h: 50 }; // 1:1 on a square source
const COVER_CLASS = 'absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none';
type Layout = 'grid' | 'filmstrip' | 'full';
const LAYOUTS: Layout[] = ['grid', 'filmstrip', 'full'];

type Item = Record<string, unknown> & { id: string; style_json: Record<string, unknown> | null };
const product = (id: string, order: number, label: string, image: string | null,
  style_json: Record<string, unknown> | null = null, extra: Record<string, unknown> = {}): Item => ({
  id, block_id: BLOCK_ID, label, url: `https://fixture.titilinks.test/${id}`, is_adult: false, order_index: order,
  subtitle: null, badge: null, image_url: image, size: 'medium', bg_color: null, title_color: null, style_json,
  price: 19, compare_at_price: null, currency: 'USD', cta_label: 'Buy', ...extra,
});

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');
const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** One product block over `items`; a block_items PATCH merges into its row. */
async function installReads(page: Page, items: Item[], layout: Layout = 'grid') {
  let modeId = '';
  const title = JSON.stringify({ layout, autoScroll: false, speed: 'slow', showPrice: true, showBuy: true });
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.fallback();
    return asJson(route, wantsObject(route) ? { plan: 'pro' } : [{ plan: 'pro' }]);
  });
  await page.route('**/rest/v1/modes*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    try {
      const res = await route.fetch();
      const body = await res.json();
      const arr = Array.isArray(body) ? body : [];
      modeId = (arr.find((m: { type?: string }) => m?.type === 'page1') ?? arr[0])?.id ?? '';
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    } catch { /* page already closing */ }
  });
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    return route.fallback();
  });
  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') return asJson(route, []);
    const block = { id: BLOCK_ID, mode_id: modeId, type: 'product_cards', title, is_enabled: true, order_index: 0 };
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
const tileOf = (page: Page, id: string) => page.locator(`a[href="https://fixture.titilinks.test/${id}"]`).first();
const loaded = (img: Locator) => expect.poll(async () => {
  await img.evaluate((el) => { (el as HTMLImageElement).loading = 'eager'; });
  return img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0);
}, { timeout: 30_000, message: 'the tile picture decoded' }).toBe(true);

async function openPublic(page: Page, items: Item[], layout: Layout) {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installReads(page, items, layout);
  await page.goto(`/${TEST_HANDLE}`);
  await expect(tileOf(page, items[0].id)).toBeAttached({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  // The block can re-render once more after its first paint; retry the scroll.
  await expect(async () => {
    await tileOf(page, items[0].id).scrollIntoViewIfNeeded({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

const panelOf = (page: Page) => page.locator('.fixed.top-16');
const sheetOf = (page: Page) => page.getByTestId('picture-fit-sheet');

/** Open the product panel from the Sections rail (spec 70's door). */
async function openPanel(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Edit Profile|Editar perfil/i }).first().click();
  await expect(page.getByTestId('sections-group-toggle')).toBeVisible();
  await page.locator('[data-testid="section-row"][data-section-type="product_cards"]').locator('button').first().click();
  await expect(panelOf(page).getByText(EN['productCardsEditor.addProduct'], { exact: true })).toBeVisible({ timeout: 20_000 });
}

/** Tap the panel tile showing `src` to select that product. */
const selectTile = async (page: Page, src: string) => {
  await panelOf(page).locator(`img[src="${src}"]`).first().click();
  await expect(page.getByRole('button', { name: EN['productCardsEditor.changePhoto'], exact: true })).toBeVisible();
};

const setZoom = async (page: Page, value: number) => {
  await sheetOf(page).locator('input[type=range]').evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(400);
};

/** A PNG built in the page: a flat white field with a small mark, or 4 px colour blocks. */
const makePng = (page: Page, kind: 'logo' | 'photo'): Promise<Buffer> => page.evaluate((k) => {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 400;
  const x = c.getContext('2d')!;
  if (k === 'logo') {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 400, 400);
    x.fillStyle = '#1d4ed8'; x.fillRect(160, 160, 80, 80);
  } else {
    for (let by = 0; by < 400; by += 4) for (let bx = 0; bx < 400; bx += 4) {
      x.fillStyle = `rgb(${(Math.random() * 256) | 0},${(Math.random() * 256) | 0},${(Math.random() * 256) | 0})`;
      x.fillRect(bx, by, 4, 4);
    }
  }
  return c.toDataURL('image/png');
}, kind).then((d) => Buffer.from(d.split(',')[1], 'base64'));

const savePanel = async (page: Page) => {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  const patch = page.waitForRequest((r) => r.url().includes('/rest/v1/block_items') && r.method() === 'PATCH');
  await panelOf(page).getByRole('button', { name: EN['blockEditor.save'], exact: true }).click();
  return (await patch).postDataJSON();
};

// ─────────────────────────────────────────────────────────────────────────────
test.describe('IMG.FIT.2 — the public tile', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('1. no picture keys: today\'s <img> in all three layouts', async ({ page }) => {
    for (const layout of LAYOUTS) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const items = [product('nk-a', 0, 'Plain A', SQUARE), product('nk-b', 1, 'Plain B', PORTRAIT, { animation: 'none' })];
      await openPublic(page, items, layout);
      for (const it of items) {
        const img = tileOf(page, it.id).locator('img');
        await expect(img).toHaveCount(1);
        const attrs = await img.evaluate((el) => ({
          names: el.getAttributeNames().sort(),
          cls: el.getAttribute('class'),
          style: el.getAttribute('style'),
          srcset: el.getAttribute('srcset') || '',
          parent: el.parentElement?.tagName,
        }));
        expect(attrs.names, `${layout}/${it.id}: today's attributes`).toEqual(['alt', 'class', 'loading', 'sizes', 'src', 'srcset']);
        expect(attrs.cls).toBe(COVER_CLASS);
        expect(attrs.style).toBeNull();
        expect(attrs.parent, 'the <img> sits straight in the tile').toBe('A');
        const candidates = attrs.srcset.split(',').map((s) => s.trim()).filter(Boolean);
        expect(candidates.length).toBeGreaterThan(1);
        for (const cand of candidates) expect(cand, 'a cover-cropped rendition').toContain('resize=cover');
      }
    }
  });

  test('2. a crop framed at 1:1 paints its rectangle in grid and covers the 3:4 tile in full', async ({ page }) => {
    const framed = { crop: CROP_11, crop_aspect: 1 };
    await openPublic(page, [product('cr-a', 0, 'Cropped', SQUARE, framed), product('cr-b', 1, 'Plain', WIDE)], 'grid');
    const tile = tileOf(page, 'cr-a');
    const img = tile.locator('img');
    await loaded(img);
    const box = await tile.evaluate((el) => {
      const r = el.getBoundingClientRect(); const b = el.clientLeft;
      return { x: r.x + b, y: r.y + b, width: el.clientWidth, height: el.clientHeight };
    });
    const pic = await rectOf(img);
    const geo = resolveGalleryGeometry({ crop: CROP_11 })!;
    const want = {
      x: box.x + (geo.leftPct / 100) * box.width, y: box.y + (geo.topPct / 100) * box.height,
      width: (geo.widthPct / 100) * box.width, height: (geo.heightPct / 100) * box.height,
    };
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(pic[k] - want[k]), `grid: painted ${k} ${pic[k]} vs ${want[k]}`).toBeLessThanOrEqual(1);
    }
    const srcset = (await img.getAttribute('srcset')) || '';
    expect(srcset, 'a framed picture asks for no server crop').not.toContain('resize=cover');
    expect(srcset).not.toContain('height=');

    // The same item in Full: the 1:1 window re-shaped for 3:4 covers the tile, unstretched.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openPublic(page, [product('cr-a', 0, 'Cropped', SQUARE, framed)], 'full');
    const ft = tileOf(page, 'cr-a');
    const fimg = ft.locator('img');
    await loaded(fimg);
    const fb = await ft.evaluate((el) => {
      const r = el.getBoundingClientRect(); const b = el.clientLeft;
      return { x: r.x + b, y: r.y + b, right: r.x + b + el.clientWidth, bottom: r.y + b + el.clientHeight, w: el.clientWidth, h: el.clientHeight };
    });
    expect(Math.abs(fb.w / fb.h - 3 / 4), 'the full tile is 3:4').toBeLessThan(0.02);
    const fp = await rectOf(fimg);
    expect(fp.x).toBeLessThanOrEqual(fb.x + 1);
    expect(fp.y).toBeLessThanOrEqual(fb.y + 1);
    expect(fp.right).toBeGreaterThanOrEqual(fb.right - 1);
    expect(fp.bottom).toBeGreaterThanOrEqual(fb.bottom - 1);
    const natural = await fimg.evaluate((el) => (el as HTMLImageElement).naturalWidth / (el as HTMLImageElement).naturalHeight);
    expect(Math.abs(fp.width / fp.height - natural) / natural, 'painted aspect = the picture\'s natural aspect').toBeLessThan(0.01);
  });

  test('3. fit: whole picture on fit_bg, text below, same outer box as a twin, all layouts', async ({ page }) => {
    const fit = { fit: 'contain', fit_bg: '#ff00ff' };
    for (const layout of LAYOUTS) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await openPublic(page, [
        product('ft-a', 0, 'Fitted product', WIDE, fit, { badge: 'New', compare_at_price: 29, is_adult: false }),
        product('ft-b', 1, 'Twin product', WIDE, null, { badge: 'New', compare_at_price: 29 }),
      ], layout);
      const fc = tileOf(page, 'ft-a');
      const twin = tileOf(page, 'ft-b');
      const area = fc.locator('[data-product-picture="fit"]');
      await expect(area).toHaveCount(1);
      const img = area.locator('img');
      await loaded(img);
      const a = await rectOf(area);
      const im = await img.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const i = el as HTMLImageElement;
        const s = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight);
        const w = i.naturalWidth * s; const h = i.naturalHeight * s;
        return { fit: getComputedStyle(el).objectFit, x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, right: r.x + (r.width + w) / 2, bottom: r.y + (r.height + h) / 2 };
      });
      expect(im.fit).toBe('contain');
      expect(im.x, `${layout}: whole picture, left`).toBeGreaterThanOrEqual(a.x - 0.5);
      expect(im.y, `${layout}: top`).toBeGreaterThanOrEqual(a.y - 0.5);
      expect(im.right, `${layout}: right`).toBeLessThanOrEqual(a.right + 0.5);
      expect(im.bottom, `${layout}: bottom`).toBeLessThanOrEqual(a.bottom + 0.5);
      const srcset = (await img.getAttribute('srcset')) || '';
      expect(srcset.length).toBeGreaterThan(0);
      expect(srcset, 'no server crop (it would cut a logo)').not.toContain('resize=cover');
      expect(srcset).not.toContain('height=');
      expect(await area.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 0, 255)');

      // The text block sits below the picture area, off the gradient.
      const text = fc.locator('[data-product-text]');
      const tr = await rectOf(text);
      expect(tr.y, `${layout}: the text block starts at or below the picture`).toBeGreaterThanOrEqual(a.bottom - 0.5);
      expect(await text.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
      // The badge and the sale chip stay on the picture area.
      for (const chip of [fc.getByText('New', { exact: true }), fc.getByText('-34%', { exact: true })]) {
        const c = await rectOf(chip);
        expect(c.y).toBeGreaterThanOrEqual(a.y - 0.5);
        expect(c.bottom).toBeLessThanOrEqual(a.bottom + 0.5);
      }

      // The outer box equals the unfitted twin's.
      const fb = await rectOf(fc);
      const tb = await rectOf(twin);
      expect(Math.abs(fb.width - tb.width), `${layout}: width ${fb.width} vs ${tb.width}`).toBeLessThanOrEqual(1);
      expect(Math.abs(fb.height - tb.height), `${layout}: height ${fb.height} vs ${tb.height}`).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('IMG.FIT.2 — the product panel', () => {
  test('4. a new picture always opens the sheet in Fill (no automatic Fit); Fit on a logo shows Auto', async ({ page }) => {
    test.slow();
    await installReads(page, [product('ex-1', 0, 'Existing', SQUARE)]);
    await openPanel(page);
    const plusInput = panelOf(page).locator('input[type="file"]').first();

    // A logo-like PNG: Fill, not Fit — the editor no longer reads the picture or writes Fit.
    await plusInput.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await makePng(page, 'logo') });
    await expect(sheetOf(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('fit-mode-fill')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('fit-mode-fit')).toHaveAttribute('aria-pressed', 'false');
    // Choosing Fit: the sheet read the edge colour itself, so Auto is offered and selected.
    await page.getByTestId('fit-mode-fit').click();
    await expect(page.getByTestId('fit-bg-auto')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('fit-bg-auto')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('picture-fit-cancel').click();
    await expect(sheetOf(page)).toHaveCount(0);

    await plusInput.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await makePng(page, 'photo') });
    await expect(sheetOf(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('fit-mode-fill')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('picture-fit-cancel').click();
    await expect(sheetOf(page)).toHaveCount(0);
  });

  test('5. Adjust → Fill → zoom → Apply → Save writes crop + crop_aspect; a later Save keeps them; Fit drops crop', async ({ page }) => {
    test.slow();
    const items = [product('adj-1', 0, 'Adjust me', SQUARE, { animation: 'pulse' })];
    await installReads(page, items);
    await openPanel(page);
    await selectTile(page, SQUARE);
    const adjust = page.getByTestId('product-picture-adjust');
    await expect(adjust).toBeVisible();
    await expect(adjust).toHaveText(EN['productCardsEditor.adjustPhoto']);
    await adjust.click();
    await expect(sheetOf(page)).toBeVisible();
    await expect(page.getByTestId('fit-mode-fill')).toHaveAttribute('aria-pressed', 'true');
    await setZoom(page, 2);
    await page.getByTestId('picture-fit-apply').click();
    await expect(sheetOf(page)).toHaveCount(0);
    // The panel tile paints the staged crop through the resolver.
    await expect.poll(() => panelOf(page).locator(`img[src="${SQUARE}"]`).first().getAttribute('style')).toContain('position: absolute');

    const body1 = await savePanel(page);
    expect(body1.style_json.animation, 'other keys survive').toBe('pulse');
    expect(body1.style_json.crop).toBeTruthy();
    for (const k of ['x', 'y', 'w', 'h']) expect(typeof body1.style_json.crop[k]).toBe('number');
    expect(body1.style_json.crop.w, 'zoomed in: a smaller window').toBeLessThan(75);
    expect(body1.style_json.crop_aspect).toBeCloseTo(1, 6);
    expect(body1.style_json.fit).toBeUndefined();

    // A later Save that changes only the title still carries the framing (the
    // GAL.1b trap: a field the mapper drops is lost on the next Save).
    await openPanel(page);
    await selectTile(page, SQUARE);
    await panelOf(page).getByPlaceholder(EN['productCardsEditor.productNamePlaceholder']).fill('Adjust me again');
    const body2 = await savePanel(page);
    expect(body2.label).toBe('Adjust me again');
    expect(body2.style_json.crop).toEqual(body1.style_json.crop);
    expect(body2.style_json.crop_aspect).toBeCloseTo(1, 6);

    // Fit: sends fit 'contain' and no crop.
    await openPanel(page);
    await selectTile(page, SQUARE);
    await page.getByTestId('product-picture-adjust').click();
    await expect(sheetOf(page)).toBeVisible();
    await page.getByTestId('fit-mode-fit').click();
    await page.getByTestId('picture-fit-apply').click();
    await expect(sheetOf(page)).toHaveCount(0);
    const body3 = await savePanel(page);
    expect(body3.style_json.fit).toBe('contain');
    expect(body3.style_json.crop).toBeUndefined();
    expect(body3.style_json.crop_aspect).toBeUndefined();
    expect(body3.style_json.animation).toBe('pulse');
  });

  test('6. paste: replaces the selected product\'s picture, adds one when none is selected, text just types', async ({ page, browserName }) => {
    test.slow();
    await installReads(page, [product('pa-1', 0, 'Paste target', SQUARE)]);
    await openPanel(page);
    const canBuild = await page.evaluate(() => {
      try {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }));
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        return !!ev.clipboardData && ev.clipboardData.files.length === 1;
      } catch { return false; }
    });
    test.skip(!canBuild, `${browserName} cannot build a synthetic paste event carrying a file`);
    const paste = async () => {
      const b64 = (await makePng(page, 'photo')).toString('base64');
      await page.evaluate((b) => {
        const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }, b64);
    };
    const tiles = panelOf(page).locator('.grid.grid-cols-2 > div.aspect-square');

    // None selected → a new product, exactly like the "+" pick.
    await expect(tiles).toHaveCount(1);
    await paste();
    await expect(sheetOf(page)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('picture-fit-cancel').click();
    await expect(tiles).toHaveCount(2);
    await expect(panelOf(page).locator('img[src^="data:"]')).toHaveCount(1);

    // A product selected → its picture is replaced, no new product.
    await selectTile(page, SQUARE);
    await paste();
    await expect(sheetOf(page)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('picture-fit-cancel').click();
    await expect(tiles).toHaveCount(2);
    await expect(panelOf(page).locator(`img[src="${SQUARE}"]`)).toHaveCount(0);
    await expect(panelOf(page).locator('img[src^="data:"]')).toHaveCount(2);

    // Text into the title field: the field gets the text, nothing else happens.
    const title = panelOf(page).getByPlaceholder(EN['productCardsEditor.productNamePlaceholder']);
    await title.fill('');
    await title.focus();
    if (browserName === 'chromium') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.evaluate(() => navigator.clipboard.writeText('Pasted title'));
      await page.keyboard.press('ControlOrMeta+V');
      await expect(title).toHaveValue('Pasted title');
    } else {
      const prevented = await title.evaluate((el) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', 'Pasted title');
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      });
      expect(prevented, 'a text paste is not intercepted').toBe(false);
    }
    await page.waitForTimeout(600);
    await expect(sheetOf(page)).toHaveCount(0);
    await expect(tiles).toHaveCount(2);
  });
});
