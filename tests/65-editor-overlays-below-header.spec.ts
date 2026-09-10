// TL.HDR.OVL.1 — the editor's hero overlay column drops BELOW the public header.
//
// TL.PREV.HDR.1 mounted the live page's fade-in header inside the editor's
// device frame. Its Save-Contact button lives in the top-right corner — exactly
// where EPV draws its edit-only pencil/camera column (`absolute top-3 right-3`).
// The first fix slid the header button 56px LEFT in edit mode
// (`rightInsetPx={isVisitor ? undefined : 56}`), so the creator saw add-contact
// in one place while visitors saw it in another. Joey's ruling (2026-09-09) is
// the reverse: add-contact NEVER moves — it sits exactly where the live page
// draws it, in both modes — and the edit-only overlays move DOWN below the
// 56px header strip (`top-[68px]` = 56 + the same 12px inset `top-3` gave).
//
// What this suite pins:
//   (a) edit mode: the header button's right inset is the LIVE one (px-4 = 16px
//       from the frame edge) — no 56px slide.
//   (b) the 'New photo' overlay starts at or below the header's bottom edge and
//       keeps its 12px right inset.
//   (c) the pencil still sits directly above the camera with the gap-2 8px gap.
//   (d) the camera is genuinely reachable — a real click reaches the hidden
//       file input (the header no longer sits on top of it).
//   (e) visitor mode: the overlays are gone AND the header button has not moved
//       a pixel from (a). Same position in both modes is the whole ruling.
//   (f) the mobile editor branch (no PublicHeader) draws the same column at the
//       same 68px offset and it is clickable there too.
//
// Suite-14 viewport pattern: the device frame is width-gated (lg:block), not
// project-gated, so the desktop tests force a desktop viewport and the mobile
// test forces a phone viewport. Both run under BOTH projects — zero skips.
//
// Read-only: no seeding, no writes, no allowWrites() — the spec navigates the
// real editor and measures geometry.
//
// Screenshots (tests/screenshots, gitignored): desktop-ovl1-edit.png,
// desktop-ovl1-visitor.png, mobile-ovl1-edit.png.

import { test, expect, type Locator, type Page } from './fixtures';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 430, height: 932 };

/** PublicHeader.tsx: the inner row is `h-14`. */
const HEADER_H = 56;
/** PublicHeader.tsx: the inner row is `px-4`, and NOTHING adds to it any more. */
const HEADER_RIGHT_INSET = 16;
/** EditableProfileView.tsx: the overlay column is `top-[68px] right-3`. */
const OVERLAY_TOP = 68;
const OVERLAY_RIGHT = 12;
/** EditableProfileView.tsx: the column is `flex flex-col gap-2`. */
const COLUMN_GAP = 8;
/** Sub-pixel slack for scaled/fractional layout reads. */
const EPS = 2;

/**
 * The device frame is CSS-transform scaled to fit the desktop stage, so every
 * boundingBox() comes back in scaled viewport px. Divide by this to compare
 * against the authored (frame-local) pixel values above.
 */
const frameScale = (frame: Locator) =>
  frame.evaluate((el) => {
    const host = el as HTMLElement;
    return host.getBoundingClientRect().width / host.offsetWidth;
  });

async function box(locator: Locator, what: string) {
  const b = await locator.boundingBox();
  expect(b, `${what} has a bounding box`).not.toBeNull();
  return b!;
}

/** Distance from the frame's right edge to an element's right edge, frame-local. */
const rightGap = (
  frameBox: { x: number; width: number },
  elBox: { x: number; width: number },
  scale: number,
) => (frameBox.x + frameBox.width - (elBox.x + elBox.width)) / scale;

/** elementFromPoint at a locator's centre lands on it (or one of its children). */
async function centreHitsSelf(page: Page, locator: Locator, what: string) {
  const b = await box(locator, what);
  const marker = `__ovl1_${what.replace(/\W+/g, '_')}`;
  await locator.evaluate((el, m) => el.setAttribute('data-ovl1-probe', m), marker);
  const hit = await page.evaluate(
    ({ x, y, m }) => {
      const el = document.elementFromPoint(x, y);
      return {
        self: !!el?.closest(`[data-ovl1-probe="${m}"]`),
        tag: el ? `${el.tagName.toLowerCase()} ${String((el as Element).getAttribute('class') ?? '').slice(0, 60)}` : null,
      };
    },
    { x: b.x + b.width / 2, y: b.y + b.height / 2, m: marker },
  );
  await locator.evaluate((el) => el.removeAttribute('data-ovl1-probe'));
  expect(hit.self, `${what} is the topmost element at its own centre (got ${hit.tag})`).toBe(true);
}

/** The hero pencil — image variant or, on a video hero, the edit-video variant. */
const heroPencil = (scope: Locator) =>
  scope.getByTitle('Edit current photo').or(scope.getByTitle('Edit hero video'));

const openEditor = async (page: Page, viewport: { width: number; height: number }) => {
  await page.setViewportSize(viewport);
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
};

test.describe('TL.HDR.OVL.1 — desktop device frame', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page, DESKTOP);
    await expect(page.getByTestId('device-frame')).toBeVisible();
  });

  test('(a)+(b)+(c) add-contact keeps its live inset; the overlays sit below the header', async ({ page }) => {
    const frame = page.getByTestId('device-frame');
    const header = frame.getByTestId('public-header');
    const headerBtn = header.locator('button');
    const camera = frame.getByTitle('New photo');
    const pencil = heroPencil(frame);

    await expect(camera, 'edit mode draws the camera overlay').toBeVisible();
    await expect(headerBtn, 'the header draws its add-contact button').toBeVisible();

    const scale = await frameScale(frame);
    const frameBox = await box(frame, 'device frame');
    const headerBox = await box(header, 'public header');
    const headerBtnBox = await box(headerBtn, 'add-contact button');
    const cameraBox = await box(camera, 'camera overlay');
    const pencilBox = await box(pencil, 'pencil overlay');

    // (a) The header button sits at the LIVE inset — px-4 only. The old 56px
    // edit-mode slide would read 72 here.
    const btnGap = rightGap(frameBox, headerBtnBox, scale);
    expect(
      Math.abs(btnGap - HEADER_RIGHT_INSET),
      `add-contact right inset is the live ${HEADER_RIGHT_INSET}px (got ${btnGap.toFixed(2)})`,
    ).toBeLessThanOrEqual(EPS);

    // (b) The camera starts at or below the header strip, at the authored 68px,
    // and keeps the column's 12px right inset — directly under add-contact.
    const headerBottom = (headerBox.y + headerBox.height - frameBox.y) / scale;
    const cameraTop = (cameraBox.y - frameBox.y) / scale;
    const pencilTop = (pencilBox.y - frameBox.y) / scale;
    expect(headerBottom, 'the header strip is the h-14 row').toBeCloseTo(HEADER_H, 0);
    expect(
      pencilTop,
      `the overlay column starts below the header (top ${pencilTop.toFixed(2)} vs header bottom ${headerBottom.toFixed(2)})`,
    ).toBeGreaterThanOrEqual(headerBottom - 0.5);
    expect(
      Math.abs(pencilTop - OVERLAY_TOP),
      `the overlay column starts at top-[${OVERLAY_TOP}px] (got ${pencilTop.toFixed(2)})`,
    ).toBeLessThanOrEqual(EPS);
    expect(cameraTop, 'the camera is the lower of the two overlays').toBeGreaterThan(pencilTop);

    const cameraGap = rightGap(frameBox, cameraBox, scale);
    expect(
      Math.abs(cameraGap - OVERLAY_RIGHT),
      `the camera keeps its right-3 inset (got ${cameraGap.toFixed(2)})`,
    ).toBeLessThanOrEqual(EPS);

    // (c) Pencil directly above the camera, one gap-2 apart, same right edge.
    const columnGap = (cameraBox.y - (pencilBox.y + pencilBox.height)) / scale;
    expect(
      Math.abs(columnGap - COLUMN_GAP),
      `pencil→camera gap is gap-2 (got ${columnGap.toFixed(2)})`,
    ).toBeLessThanOrEqual(EPS);
    const pencilGap = rightGap(frameBox, pencilBox, scale);
    expect(
      Math.abs(pencilGap - cameraGap),
      'the pencil and the camera share a right edge',
    ).toBeLessThanOrEqual(EPS);

    await frame.screenshot({ path: 'tests/screenshots/desktop-ovl1-edit.png' });
  });

  test('(d) the camera is reachable — a real click fires the hidden file input', async ({ page }) => {
    const frame = page.getByTestId('device-frame');
    const camera = frame.getByTitle('New photo');
    // EPV's own hero input — the accept list is unique to it.
    const fileInput = frame.locator('input[type="file"][accept*="video/quicktime"]').first();

    await expect(camera).toBeVisible();
    await expect(fileInput, 'the hero file input is mounted').toBeAttached();
    await expect(fileInput, 'the hero file input is enabled').toBeEnabled();

    // Count the input's click events and preventDefault them, so the real
    // click proves reachability without ever opening a file chooser.
    await fileInput.evaluate((el) => {
      (window as unknown as { __ovl1Clicks?: number }).__ovl1Clicks = 0;
      el.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const w = window as unknown as { __ovl1Clicks?: number };
          w.__ovl1Clicks = (w.__ovl1Clicks ?? 0) + 1;
        },
        { capture: true },
      );
    });

    // The header is z-50 over the z-[15] column; nothing may swallow this click.
    await centreHitsSelf(page, camera, 'camera');
    await camera.click({ timeout: 5_000 });

    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __ovl1Clicks?: number }).__ovl1Clicks ?? 0),
        { message: 'the camera click reached the hidden file input' },
      )
      .toBe(1);
  });

  test('(e) visitor mode drops the overlays and add-contact does not move', async ({ page }) => {
    const frame = page.getByTestId('device-frame');
    const headerBtn = frame.getByTestId('public-header').locator('button');

    const scale = await frameScale(frame);
    const editGap = rightGap(await box(frame, 'device frame'), await box(headerBtn, 'add-contact'), scale);

    await page.getByTestId('preview-mode-toggle').click();
    await expect(frame.getByTitle('New photo'), 'visitor mode has no edit overlays').toHaveCount(0);
    await expect(heroPencil(frame), 'visitor mode has no pencil either').toHaveCount(0);
    await expect(headerBtn, 'visitor mode arms add-contact').toBeEnabled();

    const visitorScale = await frameScale(frame);
    const visitorGap = rightGap(
      await box(frame, 'device frame'),
      await box(headerBtn, 'add-contact'),
      visitorScale,
    );

    // THE RULING: the creator edits with add-contact exactly where a visitor
    // sees it. Same inset in both modes, and that inset is the live px-4.
    expect(
      Math.abs(visitorGap - editGap),
      `add-contact is unmoved by the toggle (edit ${editGap.toFixed(2)} vs visitor ${visitorGap.toFixed(2)})`,
    ).toBeLessThanOrEqual(EPS);
    expect(Math.abs(visitorGap - HEADER_RIGHT_INSET)).toBeLessThanOrEqual(EPS);

    await frame.screenshot({ path: 'tests/screenshots/desktop-ovl1-visitor.png' });
  });
});

test.describe('TL.HDR.OVL.1 — mobile editor branch', () => {
  test('(f) the mobile column drops the same 68px and stays clickable', async ({ page }) => {
    await openEditor(page, PHONE);

    // Both EPV instances stay mounted (desktop `hidden lg:block`, mobile
    // `lg:hidden`); at phone width only the mobile one is visible, and the
    // mobile branch carries NO PublicHeader — the column simply drops.
    const hero = page.locator('[data-testid="hero-sticky"]:visible').first();
    const camera = page.locator('[title="New photo"]:visible').first();
    const pencil = page
      .locator('[title="Edit current photo"]:visible, [title="Edit hero video"]:visible')
      .first();

    await expect(hero, 'the mobile hero is the visible one').toBeVisible();
    await expect(camera, 'the mobile editor draws the camera overlay').toBeVisible();
    await expect(page.getByTestId('device-frame'), 'the desktop frame is width-gated away').toBeHidden();
    await expect(
      page.locator('[data-testid="public-header"]:visible'),
      'the mobile editor branch has no public header',
    ).toHaveCount(0);

    const heroBox = await box(hero, 'mobile hero');
    const pencilBox = await box(pencil, 'mobile pencil');
    const cameraBox = await box(camera, 'mobile camera');

    // The mobile branch is unscaled — viewport px ARE frame-local px.
    const topOffset = pencilBox.y - heroBox.y;
    expect(
      topOffset,
      `the column starts at least ${OVERLAY_TOP}px below the hero top (got ${topOffset.toFixed(2)})`,
    ).toBeGreaterThanOrEqual(OVERLAY_TOP - 0.5);
    expect(
      Math.abs(topOffset - OVERLAY_TOP),
      `the column starts at top-[${OVERLAY_TOP}px] (got ${topOffset.toFixed(2)})`,
    ).toBeLessThanOrEqual(EPS);
    expect(cameraBox.y, 'the camera is below the pencil').toBeGreaterThan(pencilBox.y);

    // Nothing on the mobile surface occupies that band — the camera is the
    // topmost element at its own centre.
    await centreHitsSelf(page, camera, 'camera');

    await page.screenshot({ path: 'tests/screenshots/mobile-ovl1-edit.png' });
  });
});
