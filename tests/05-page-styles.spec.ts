// PAGES.STYLE.1 — regression net for per-page styles.
//
// What this file proves, and what it deliberately does not:
//
// The harness runs against the real Supabase project and has no seeding hook
// (all SQL is run by hand in the web editor), so a spec cannot conjure a
// profile that HAS two pages carrying two different styles, log in, and switch
// between them. Driving the switcher end to end therefore stays a manual check
// (see the morning checklist).
//
// What is deterministic without a database is the thing the ruling actually
// claims: ONE resolver, keyed to the active page, feeds everything. These specs
// import the real modules and pin that rule directly — the same predicate-level
// approach TEST.1c took for the 18+ gate, and for the same reason.
//
// The load-bearing spec is the last one: it runs the REAL pipeline
// (getThemeWithDefaults → withEffectivePageStyle → resolveButtonSurface) and
// shows one theme resolving to two different button surfaces depending only on
// which page is active. That is "each page renders its own style" stated at the
// only layer a spec can reach without seeded data.

import { test, expect } from '@playwright/test';
import { getThemeWithDefaults } from '../src/lib/theme-defaults';
import {
  resolveEffectivePageStyle,
  withEffectivePageStyle,
  resolveButtonSurface,
  isFullBleedTheme,
} from '../src/lib/surface';

// A profile whose two pages disagree: Page 1 hero, Page 2 full-bleed.
const TWO_STYLES = {
  pageStyle: 'hero',
  pages: { page1: { style: 'hero' }, page2: { style: 'full_bleed' } },
  buttons: { variant: 'filled' },
};

// ─── 1. The resolver ────────────────────────────────────────────────────────

test.describe('per-page style — the one resolver', () => {
  test('two pages, two styles: each page resolves its own', () => {
    expect(resolveEffectivePageStyle(TWO_STYLES, 'page1')).toBe('hero');
    expect(resolveEffectivePageStyle(TWO_STYLES, 'page2')).toBe('full_bleed');
  });

  test('all four combos resolve independently', () => {
    const combo = (p1: string, p2: string) => ({
      pages: { page1: { style: p1 }, page2: { style: p2 } },
    });
    for (const [p1, p2] of [
      ['hero', 'hero'],
      ['hero', 'full_bleed'],
      ['full_bleed', 'hero'],
      ['full_bleed', 'full_bleed'],
    ] as const) {
      expect(resolveEffectivePageStyle(combo(p1, p2), 'page1')).toBe(p1);
      expect(resolveEffectivePageStyle(combo(p1, p2), 'page2')).toBe(p2);
    }
  });

  // The zero-migration claim: a row saved before PAGES.STYLE.1 has no `pages`
  // style at all, so both pages must land on the profile-level value — which is
  // exactly what that row did yesterday.
  test('no per-page value falls back to the profile default (the migration)', () => {
    const legacy = { pageStyle: 'full_bleed' };
    expect(resolveEffectivePageStyle(legacy, 'page1')).toBe('full_bleed');
    expect(resolveEffectivePageStyle(legacy, 'page2')).toBe('full_bleed');

    // A page with its own style overrides the default; its sibling still falls back.
    const mixed = { pageStyle: 'full_bleed', pages: { page2: { style: 'hero' } } };
    expect(resolveEffectivePageStyle(mixed, 'page1')).toBe('full_bleed');
    expect(resolveEffectivePageStyle(mixed, 'page2')).toBe('hero');
  });

  test('absent everything is hero, and junk never throws', () => {
    expect(resolveEffectivePageStyle({}, 'page1')).toBe('hero');
    expect(resolveEffectivePageStyle(null, 'page1')).toBe('hero');
    expect(resolveEffectivePageStyle(undefined, 'page2')).toBe('hero');
    expect(resolveEffectivePageStyle('nonsense', 'page1')).toBe('hero');
    // An unknown stored value is not a style — fall back rather than trust it.
    expect(resolveEffectivePageStyle({ pages: { page1: { style: 'bogus' } } }, 'page1')).toBe('hero');
  });

  // A page's own style must survive a sibling's label/heroInherit living next
  // to it — the switcher merges into this map.
  test('a page style reads through alongside its label and heroInherit', () => {
    const withLabels = {
      pageStyle: 'hero',
      pages: {
        enabled: true,
        page1: { label: 'Links', style: 'full_bleed' },
        page2: { label: 'Shop', heroInherit: true, style: 'hero' },
      },
    };
    expect(resolveEffectivePageStyle(withLabels, 'page1')).toBe('full_bleed');
    expect(resolveEffectivePageStyle(withLabels, 'page2')).toBe('hero');
  });
});

// ─── 2. The swap — the resolver actually drives what renders ────────────────

test.describe('per-page style — the swap feeds the render', () => {
  // THE spec. resolveButtonSurface never learns about pages; it reads
  // theme.pageStyle. Swapping its input is what makes the whole app follow the
  // active page, so this asserts one theme producing two surfaces.
  test('one theme, two pages: the button surface follows the ACTIVE page', () => {
    const base = getThemeWithDefaults(TWO_STYLES);

    const page1Theme = withEffectivePageStyle(base, TWO_STYLES, 'page1');
    const page2Theme = withEffectivePageStyle(base, TWO_STYLES, 'page2');

    // Page 1 is hero: a solid fill is renderable and survives.
    expect(isFullBleedTheme(page1Theme)).toBe(false);
    expect(resolveButtonSurface(page1Theme).variant).toBe('filled');

    // Page 2 is full-bleed: FS.SURFACE 3b coerces the solid to glass. Same
    // stored theme, same buttons — only the active page differs.
    expect(isFullBleedTheme(page2Theme)).toBe(true);
    expect(resolveButtonSurface(page2Theme).variant).toBe('glass');
  });

  // Guards the trap this design was built around: getThemeWithDefaults drops
  // the `pages` key, so the resolver MUST be fed the RAW theme_json. Resolving
  // from a normalized theme would silently always return the profile default —
  // per-page styles would appear to work in the editor and do nothing live.
  test('the normalized theme has no pages — the resolver needs the raw json', () => {
    const normalized = getThemeWithDefaults(TWO_STYLES) as Record<string, unknown>;
    expect(normalized.pages).toBeUndefined();
    // Resolving from the normalized theme loses Page 2's style...
    expect(resolveEffectivePageStyle(normalized, 'page2')).toBe('hero');
    // ...which is why every call site passes the raw json, and gets it right.
    expect(resolveEffectivePageStyle(TWO_STYLES, 'page2')).toBe('full_bleed');
  });

  // The write-path guard. withEffectivePageStyle returns a RENDER-ONLY theme:
  // persisting one would burn a resolved value into the profile-level default
  // and flip the other page. It must not mutate the theme it was handed.
  test('the swap is a copy — the caller\'s theme is untouched', () => {
    const base = getThemeWithDefaults(TWO_STYLES);
    const before = base.pageStyle;
    const swapped = withEffectivePageStyle(base, TWO_STYLES, 'page2');

    expect(swapped).not.toBe(base);
    expect(swapped.pageStyle).toBe('full_bleed');
    expect(base.pageStyle).toBe(before); // the write vehicle still holds the default
  });
});
