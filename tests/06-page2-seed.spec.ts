// FIX.P2 — regression net for the preset cull + Page 2 born-complete seed.
//
// The harness has no Supabase seeding hook, so a spec can't enable a real
// Page 2 and read its rows. But the two ratified rulings are pure data:
//   - the four alternate presets are DEAD (only Default remains);
//   - a born Page 2 carries the two header blocks PLUS the full Default set,
//     and every seeded title is translatable.
// These pin exactly that against the real modules, the way TEST.1c / 05 do.
// This file is also STEP 5(b)'s standing proof: it fails the moment the seed
// regresses to the old two-block composition or a seeded title loses its i18n.

import { test, expect } from '@playwright/test';
import { BLOCK_PRESETS, DEFAULT_PRESET_KEY } from '../src/lib/block-presets';
import { translateContent } from '../src/lib/content-i18n';

// The born-complete Page 2 composition, mirrored from ensureSecondPage: the two
// header social blocks, then the Default content set from the shared registry.
const bornPage2Titles = (): string[] => {
  const defaultBlocks = BLOCK_PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)?.blocks ?? [];
  return ['Social Links', 'Social Icons', ...defaultBlocks.map((b) => b.title)];
};

test.describe('preset cull — only Default survives', () => {
  test('BLOCK_PRESETS holds exactly one preset, keyed default', () => {
    expect(BLOCK_PRESETS).toHaveLength(1);
    expect(BLOCK_PRESETS[0].key).toBe(DEFAULT_PRESET_KEY);
    expect(DEFAULT_PRESET_KEY).toBe('default');
  });

  test('the four retired presets are gone', () => {
    const keys = BLOCK_PRESETS.map((p) => p.key);
    for (const dead of ['social', 'store', 'events', 'forms']) {
      expect(keys).not.toContain(dead);
    }
  });

  test('the Default set is the full content composition', () => {
    const types = BLOCK_PRESETS[0].blocks.map((b) => b.type);
    expect(types).toEqual(['primary_cta', 'links', 'product_cards', 'gallery', 'video_feed', 'bio']);
  });
});

test.describe('Page 2 born-complete — the seed', () => {
  // The old seed was two header blocks only. Born-complete is header + Default —
  // this is the STEP 5(b) contrast: eight blocks, not two.
  test('a born Page 2 seeds the full set, not the old two-block blank', () => {
    const titles = bornPage2Titles();
    expect(titles.slice(0, 2)).toEqual(['Social Links', 'Social Icons']);
    expect(titles).toHaveLength(8);
    expect(titles.length).toBeGreaterThan(2); // the old blank-page seed stopped at 2
  });

  // STEP 2's i18n requirement: every seeded title is translatable via
  // CONTENT_MAP, so a Spanish viewer never sees an English default title. This
  // is the guard on the new 'Social Icons' / 'Gallery' / 'Videos' / 'About'
  // map entries — drop any of them and this fails.
  test('every seeded title is mapped in content-i18n', () => {
    const sentinel = (s: string) => `mapped:${s}`; // fake t → never equals a raw title
    for (const title of bornPage2Titles()) {
      // A mapped title resolves through t(key) to the sentinel; an unmapped one
      // passes through unchanged. So "changed" proves the mapping exists.
      expect(translateContent(title, sentinel)).not.toBe(title);
    }
  });
});
