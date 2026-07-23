// FIX.STAGE.3 — editor device-frame transform/scroll split: geometry-parity guard.
//
// This is deliberately NOT a reproduction of the compositor bug that motivated
// FIX.STAGE.3. The grey-region symptom (full_bleed editor preview: lower region
// intermittently paints flat grey after scrolling; refresh heals) is a
// timing-dependent GPU raster state that never reproduced under Playwright —
// headless or headed, main-thread or wheel-driven (three probe variants, zero
// hits). What this suite guards instead is the GEOMETRY the fix depends on:
// the scaled `device-frame` no longer scrolls; its unscaled child
// `device-frame-scroll` owns the overflow (the DesktopStage split), and with
// that split in place a full_bleed page scrolled to the bottom still paints
// real content in its lower region with the sticky photo layer covering the
// scrollport. If a future change collapses the split (or breaks full-bleed
// sticky geometry inside it), this fails loudly.
//
// Suite-14 viewport pattern: the device frame is desktop-only (lg:block)
// chrome, so the test forces a desktop-width viewport instead of skipping —
// it runs under BOTH the desktop and mobile projects.
//
// Suite-05 route-interception pattern: theme_json.pageStyle is pinned to
// 'full_bleed' on GET reads and writes are swallowed — ZERO real mutation.

import { test, expect, type Page } from '@playwright/test';

const DESKTOP = { width: 1440, height: 1000 };

// Pin full_bleed everywhere (reads only; writes swallowed → nothing mutates).
const pinFullBleed = (page: Page) =>
  page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    try {
      const res = await route.fetch();
      const body = await res.json();
      const pin = (row: Record<string, unknown>) => ({
        ...row,
        theme_json: { ...((row.theme_json as object) || {}), pageStyle: 'full_bleed', pages: {} },
      });
      await route.fulfill({ response: res, body: JSON.stringify(Array.isArray(body) ? body.map(pin) : pin(body)) });
    } catch {
      try { await route.continue(); } catch { /* page closing */ }
    }
  });

test.describe('FIX.STAGE.3 — stage scroll geometry parity', () => {
  test('frame owns the transform, its child owns the scroll', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const frame = page.getByTestId('device-frame');
    await expect(frame).toBeVisible();

    // The split invariant: a fractional scale on the SCROLLING element is the
    // implicated compositor edge case, so the scaled frame must clip (never
    // scroll) and the scroller must carry no transform of its own.
    const split = await frame.evaluate((el) => {
      const inner = el.querySelector<HTMLElement>('[data-testid="device-frame-scroll"]');
      if (!inner) return null;
      return {
        frameOverflowY: getComputedStyle(el).overflowY,
        innerOverflowY: getComputedStyle(inner).overflowY,
        innerTransform: getComputedStyle(inner).transform,
        innerHostsContent: inner.childElementCount > 0,
      };
    });
    expect(split, 'device-frame-scroll must exist inside device-frame').not.toBeNull();
    expect(split!.frameOverflowY).toBe('hidden');
    expect(split!.innerOverflowY).toBe('auto');
    expect(split!.innerTransform).toBe('none');
    expect(split!.innerHostsContent).toBe(true);
  });

  test('full_bleed at the bottom: lower region paints content, sticky photo covers the scrollport', async ({ page }) => {
    await pinFullBleed(page);
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const frame = page.getByTestId('device-frame');
    const scroller = page.getByTestId('device-frame-scroll');
    await expect(frame).toBeVisible();

    // Bail loudly (not hollow-pass) if the account state can't exercise the
    // geometry: full_bleed needs a hero photo (sticky layer) and enough
    // content to scroll.
    const geo = await scroller.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    expect(geo.sh, 'full_bleed page must actually scroll').toBeGreaterThan(geo.ch + 200);

    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(350);

    // Content-rich lower region: a flat grey wash compresses to a tiny JPEG,
    // real content (photo + cards + footer) does not. Polled so a late-loading
    // hero image can finish painting.
    const box = (await frame.boundingBox())!;
    const clip = { x: box.x + 4, y: box.y + box.height * 0.55, width: box.width - 8, height: box.height * 0.42 };
    await expect
      .poll(async () => (await page.screenshot({ clip, type: 'jpeg', quality: 80 })).length, {
        message: 'lower region of the scrolled full_bleed frame should compress like content, not a flat wash',
      })
      .toBeGreaterThan(8192);

    // The full-bleed sticky photo layer must still cover the scrollport when
    // parked at the bottom (FS.PAGE.1 geometry, unchanged by the split).
    const cover = await scroller.evaluate((el) => {
      const host = el.getBoundingClientRect();
      let sticky: { top: number; bottom: number; height: number } | null = null;
      for (const d of Array.from(el.querySelectorAll<HTMLElement>('div'))) {
        if (getComputedStyle(d).position !== 'sticky') continue;
        const r = d.getBoundingClientRect();
        if (!sticky || r.height > sticky.height) sticky = { top: r.top, bottom: r.bottom, height: r.height };
      }
      return { host: { top: host.top, bottom: host.bottom }, sticky };
    });
    expect(cover.sticky, 'full-bleed sticky photo layer must be present').not.toBeNull();
    expect(cover.sticky!.top).toBeLessThanOrEqual(cover.host.top + 2);
    expect(cover.sticky!.bottom).toBeGreaterThanOrEqual(cover.host.bottom - 2);
  });
});
