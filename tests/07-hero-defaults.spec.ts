// HERO.DEFAULTS.1 — regression net for the read-time hero-config resolver.
//
// The harness runs against the real Supabase project with no seeding hook (all
// SQL is run by hand), so a spec cannot conjure a legacy Page 2, log in, and
// screenshot its hero. What IS deterministic without a database is the ruling
// itself: ONE resolver fills a page's absent hero fields from the dialed-in
// default set, so a config-less hero page looks RIGHT with zero stored data and
// zero migration. These specs import the real modules and pin that directly —
// the same predicate-level approach 05-page-styles / 06-page2-seed took.
//
// The load-bearing spec is the negative proof: it mirrors the OLD reader (posY
// fell back to 50, dead center — the low-framed / letterboxed legacy look) and
// shows the same config-less page resolving to the dialed-in posY 25 instead.
// That is "hero pages heal at read time" stated at the only layer a spec can
// reach without seeded data.

import { test, expect } from '@playwright/test';
import { resolveHeroConfig, HERO_DEFAULTS } from '../src/lib/surface';

// The PRE-resolver reader, mirrored verbatim from the old hero render path:
// fit fell back to 'fill', posY to 50 (dead center). This is exactly the
// default the resolver replaces — kept here so the fix is negative-proven, not
// just asserted.
type RawTheme = {
  heroConfig?: Record<string, unknown>;
  heroConfig_page2?: Record<string, unknown>;
};
const rawRender = (themeJson: RawTheme, key: 'heroConfig' | 'heroConfig_page2') => {
  const cfg = (themeJson[key] || {}) as { fit?: string; posY?: unknown };
  return {
    fit: cfg.fit === 'fit' ? 'fit' : 'fill',
    posY: typeof cfg.posY === 'number' ? cfg.posY : 50,
  };
};

// ─── 1. The dialed-in default set ───────────────────────────────────────────

test.describe('hero defaults — the one canonical set', () => {
  // The set is derived from what the app writes, not invented: both seed sites
  // write { fit: 'fill', posY: 25 }. Pin the exact shape so a drift is loud.
  test('HERO_DEFAULTS is Fill + top-third framing', () => {
    expect(HERO_DEFAULTS).toEqual({ fit: 'fill', posY: 25 });
  });

  // The whole point: a page with NO stored hero config renders the full
  // dialed-in treatment — this is what heals legacy / pre-seed pages at read
  // time, on either slot, with no migration.
  test('no stored hero config resolves to the full dialed-in set', () => {
    expect(resolveHeroConfig({}, 'page1')).toEqual(HERO_DEFAULTS);
    expect(resolveHeroConfig({}, 'page2')).toEqual(HERO_DEFAULTS);
  });

  test('absent everything is the dialed-in default, and junk never throws', () => {
    expect(resolveHeroConfig(null, 'page1')).toEqual(HERO_DEFAULTS);
    expect(resolveHeroConfig(undefined, 'page2')).toEqual(HERO_DEFAULTS);
    expect(resolveHeroConfig('nonsense', 'page1')).toEqual(HERO_DEFAULTS);
    expect(resolveHeroConfig(42, 'page2')).toEqual(HERO_DEFAULTS);
  });
});

// ─── 2. The negative proof — raw render vs resolved ─────────────────────────

test.describe('hero defaults — the resolver actually changes the render', () => {
  // THE spec. Same config-less page, two readers: the old one frames dead
  // center (posY 50 — the legacy low / letterboxed look Joey screenshotted on
  // his pre-seed Page 2), the resolver frames the top third (posY 25). Strip
  // the stored config and the difference is the entire fix.
  test('config-less: raw render is posY 50, resolved is posY 25', () => {
    const configless = { pages: { page2: { style: 'hero' } } };

    // Pre-resolver: dead center.
    expect(rawRender(configless, 'heroConfig').posY).toBe(50);
    expect(rawRender(configless, 'heroConfig_page2').posY).toBe(50);

    // Post-resolver: the dialed-in top-third framing, from zero stored data.
    expect(resolveHeroConfig(configless, 'page1').posY).toBe(25);
    expect(resolveHeroConfig(configless, 'page2').posY).toBe(25);
    expect(resolveHeroConfig(configless, 'page1').fit).toBe('fill');
  });
});

// ─── 3. Field-by-field merge — stored wins, absent fills ────────────────────

test.describe('hero defaults — stored fields win one-by-one', () => {
  // A partial config keeps exactly what the user tuned and fills only the gaps.
  test('a partial config keeps its stored fields and fills the rest', () => {
    expect(resolveHeroConfig({ heroConfig: { posY: 60 } }, 'page1')).toEqual({ fit: 'fill', posY: 60 });
    expect(resolveHeroConfig({ heroConfig: { fit: 'fit' } }, 'page1')).toEqual({ fit: 'fit', posY: 25 });
  });

  // Opt-in fields (video / posX) are never defaulted — they pass through when
  // stored and stay absent otherwise.
  test('opt-in fields pass through untouched', () => {
    const withExtras = { heroConfig: { video: 'v.mp4', posX: 30 } };
    expect(resolveHeroConfig(withExtras, 'page1')).toEqual({
      fit: 'fill',
      posY: 25,
      video: 'v.mp4',
      posX: 30,
    });
  });

  // Readers resolve, writers persist explicit choices: a deliberately stored
  // value survives resolution — the default is ONLY for absent fields. Stored
  // posY 50 stays 50; it is not "corrected" to 25.
  test('explicit choices survive resolution', () => {
    expect(resolveHeroConfig({ heroConfig: { fit: 'fit' } }, 'page1').fit).toBe('fit');
    expect(resolveHeroConfig({ heroConfig: { posY: 50 } }, 'page1').posY).toBe(50);
  });
});

// ─── 4. Slot selection + inherit ────────────────────────────────────────────

test.describe('hero defaults — pageId selects the slot', () => {
  test('each page resolves its own slot independently', () => {
    const t = { heroConfig: { posY: 70 }, heroConfig_page2: { fit: 'fit' } };
    expect(resolveHeroConfig(t, 'page1')).toEqual({ fit: 'fill', posY: 70 });
    expect(resolveHeroConfig(t, 'page2')).toEqual({ fit: 'fit', posY: 25 });
  });

  // heroInherit makes Page 2 mirror Page 1's hero; the call site owns that and
  // passes 'page1', so an inheriting Page 2 resolves Page 1's slot, not its own.
  test('an inheriting Page 2 resolves Page 1 hero (caller passes page1)', () => {
    const t = { heroConfig: { posY: 80 }, heroConfig_page2: { posY: 10 } };
    expect(resolveHeroConfig(t, 'page1').posY).toBe(80); // what an inheriting Page 2 shows
    expect(resolveHeroConfig(t, 'page2').posY).toBe(10); // its own slot, un-inherited
  });
});
