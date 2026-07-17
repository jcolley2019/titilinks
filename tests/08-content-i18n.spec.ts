// ES-SWEEP.1 Task 3 — regression net for the content-i18n render path.
//
// The harness has no Supabase seeding hook (all SQL is run by hand), so a spec
// cannot seed an email-subscribe block and load it in a Spanish browser
// session. What IS deterministic is the ruling itself: a page's seeded English
// content must resolve to Spanish through the ONE content layer (CONTENT_MAP →
// translateContent → the es dictionary), while CUSTOM user copy passes through
// untouched. These specs import the real modules and pin exactly that — the
// predicate approach TEST.1c / 05 / 06 / 07 use, for the same reason.
//
// What this proves: the seeded email-subscribe title 'Stay up to date' — the
// exact value EmailSubscribeBlock now routes through translateContent — renders
// in Spanish in an es session, every other onboarding seed literal resolves,
// and every CONTENT_MAP target key exists in BOTH dictionaries so a seeded
// string can never fall back to a raw key. What it does NOT drive: the mounted
// EmailSubscribeBlock render (no seeded page); that wiring is covered by tsc,
// the tc() call sites, and the I18N-PARITY guard.

import { test, expect } from '@playwright/test';
import { translateContent, CONTENT_MAP } from '../src/lib/content-i18n';
import { translations } from '../src/hooks/useLanguage';

const esT = (k: string) => translations.es[k] ?? k;
const enT = (k: string) => translations.en[k] ?? k;

// ─── 1. A Spanish session translates seeded content ─────────────────────────

test.describe('content-i18n — the seeded page renders Spanish', () => {
  // THE spec. EmailSubscribeBlock's config used to let the stored English seed
  // ('Stay up to date') win over the t() default. Now it routes through
  // translateContent, so an es session resolves it to the Spanish dictionary
  // value — not the raw English, and not a raw key.
  test('the seeded email-subscribe title renders in Spanish', () => {
    const es = translateContent('Stay up to date', esT);
    expect(es).toBe(translations.es['content.stayUpToDate']); // 'Mantente al día'
    expect(es).not.toBe('Stay up to date');                   // actually translated
    // Same content, English session stays English.
    expect(translateContent('Stay up to date', enT)).toBe('Stay up to date');
  });

  // Custom user copy is NEVER touched — only exact CONTENT_MAP matches translate.
  test('custom content passes through unchanged', () => {
    expect(translateContent('My Weekend Sale 🎉', esT)).toBe('My Weekend Sale 🎉');
    expect(translateContent('', esT)).toBe('');
    expect(translateContent(null, esT)).toBe('');
    expect(translateContent(undefined, esT)).toBe('');
  });
});

// ─── 2. The Task-3 additions resolve (badges + email config defaults) ───────

test.describe('content-i18n — onboarding seed literals resolve in Spanish', () => {
  test('every newly-mapped seed literal resolves to a real Spanish value', () => {
    for (const literal of ['NEW', 'OPEN', 'SALE', 'Email Subscribe', 'your@email.com', 'Your name']) {
      const es = translateContent(literal, esT);
      // Resolves through its mapped key, and is NOT the raw key (proves the
      // target dictionary entry exists).
      expect(es).toBe(esT(CONTENT_MAP[literal]));
      expect(es).not.toBe(CONTENT_MAP[literal]);
    }
    // Pin a couple of concrete Spanish values so a wrong translation is loud.
    expect(translateContent('SALE', esT)).toBe('OFERTA');
    expect(translateContent('your@email.com', esT)).toBe('tu@email.com');
  });
});

// ─── 3. The content layer's own parity ──────────────────────────────────────

test.describe('content-i18n — every CONTENT_MAP target is a real key', () => {
  // A CONTENT_MAP entry pointing at a key that is absent from a dictionary would
  // render the raw 'content.*' key on a page. This pins that it can't happen —
  // the content-layer complement to the I18N-PARITY guard.
  test('no CONTENT_MAP entry points at a missing dictionary key', () => {
    const missing: string[] = [];
    for (const [literal, key] of Object.entries(CONTENT_MAP)) {
      if (!(key in translations.en)) missing.push(`en:${key} (for "${literal}")`);
      if (!(key in translations.es)) missing.push(`es:${key} (for "${literal}")`);
    }
    expect(missing).toEqual([]);
  });
});
