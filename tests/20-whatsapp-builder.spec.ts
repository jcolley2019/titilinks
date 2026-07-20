// WA.1 — WhatsApp link builder.
//
// wa.me deep links need an exact international number and a URL-encoded prefill;
// LinksEditor swaps the raw URL field for a three-field builder whenever the
// item is a WhatsApp link. As with 08-content-i18n, the harness has no Supabase
// seeding hook, so a spec cannot mount the editor over a seeded WhatsApp block.
// What IS deterministic is the ruling itself — and the editor keys its field
// swap off the SAME predicate (isWhatsAppUrl) and composes with the SAME
// function (composeWhatsAppUrl) this spec pins. So proving the pure core proves
// the behavior: the builder appears exactly for WhatsApp items, composes the
// exact bytes a visitor's WhatsApp receives, and round-trips the seeded presets.

import { test, expect } from '@playwright/test';
import {
  isWhatsAppUrl,
  composeWhatsAppUrl,
  parseWhatsAppUrl,
  WHATSAPP_COUNTRIES,
  WA_DEFAULT_ISO_ES,
  WA_DEFAULT_ISO_EN,
} from '../src/lib/whatsapp';

// A preset-seeded link (tpl-presets.ts): a Spanish prefill, no number.
const SEEDED = 'https://wa.me/?text=Hola%2C%20me%20gustar%C3%ADa%20reservar%20una%20cita';
const SPANISH_MSG = 'Hola, me gustaría reservar una cita';

test.describe('WhatsApp link builder (WA.1)', () => {
  // (1) THE SWAP PREDICATE — the builder replaces the URL field exactly when
  // this is true; every other link keeps the plain URL/phone/email field.
  test('the builder shows for WhatsApp items and never for other links', () => {
    expect(isWhatsAppUrl('https://wa.me/573001234567')).toBe(true);
    expect(isWhatsAppUrl('https://wa.me/')).toBe(true);
    expect(isWhatsAppUrl(SEEDED)).toBe(true);
    expect(isWhatsAppUrl('https://whatsapp.com/channel/x')).toBe(true);
    expect(isWhatsAppUrl('wa.me/573001234567')).toBe(true); // scheme added by platformFromUrl
    // Non-WhatsApp → plain URL field stays.
    expect(isWhatsAppUrl('https://instagram.com/maya')).toBe(false);
    expect(isWhatsAppUrl('https://example.com')).toBe(false);
    expect(isWhatsAppUrl('hello@example.com')).toBe(false);
    expect(isWhatsAppUrl('')).toBe(false);
  });

  // (2) COMPOSE — exact international format + exact URL-encoding of a Spanish
  // message with an accent (í) and a comma. This is the byte the visitor's
  // WhatsApp receives, so it must equal encodeURIComponent exactly.
  test('composing writes an exactly-encoded wa.me URL', () => {
    // Colombia +57, spaced number, Spanish prefill → digits joined, message encoded.
    expect(composeWhatsAppUrl('57', '300 123 4567', SPANISH_MSG)).toBe(
      'https://wa.me/573001234567?text=Hola%2C%20me%20gustar%C3%ADa%20reservar%20una%20cita',
    );
    // No message → no ?text.
    expect(composeWhatsAppUrl('57', '3001234567', '')).toBe('https://wa.me/573001234567');
    // No number → bare host (+ optional text). This is the exact preset shape.
    expect(composeWhatsAppUrl('57', '', SPANISH_MSG)).toBe(SEEDED);
    expect(composeWhatsAppUrl('57', '', '')).toBe('https://wa.me/');
    // Encoding is exactly encodeURIComponent's (comma, accent, inverted ?).
    expect(composeWhatsAppUrl('1', '555-1234', 'Hola, ¿cómo estás?')).toBe(
      'https://wa.me/15551234?text=' + encodeURIComponent('Hola, ¿cómo estás?'),
    );
  });

  // (3) ROUND-TRIP — a seeded preset (no number, Spanish prefill) parses back to
  // an empty phone + the decoded message; a composed number splits its dial code
  // off by longest prefix; parse → compose is an identity.
  test('parses seeded + composed wa.me URLs back into the three fields', () => {
    const seeded = parseWhatsAppUrl(SEEDED, WA_DEFAULT_ISO_ES);
    expect(seeded.number).toBe(''); // missing number → empty field
    expect(seeded.message).toBe(SPANISH_MSG); // decoded, accent + comma intact
    expect(seeded.iso).toBe(WA_DEFAULT_ISO_ES); // falls back to the default country

    const bare = parseWhatsAppUrl('https://wa.me/', WA_DEFAULT_ISO_EN);
    expect(bare).toMatchObject({ number: '', message: '', iso: WA_DEFAULT_ISO_EN });

    const co = parseWhatsAppUrl('https://wa.me/573001234567', WA_DEFAULT_ISO_EN);
    expect(co).toMatchObject({ iso: 'CO', dial: '57', number: '3001234567' });

    // A 3-digit code (+593) is never shadowed by a 2-digit one.
    const ec = parseWhatsAppUrl('https://wa.me/593987654321', WA_DEFAULT_ISO_ES);
    expect(ec).toMatchObject({ iso: 'EC', dial: '593', number: '987654321' });

    const p = parseWhatsAppUrl(
      'https://wa.me/573001234567?text=' + encodeURIComponent(SPANISH_MSG),
      WA_DEFAULT_ISO_ES,
    );
    expect(composeWhatsAppUrl(p.dial, p.number, p.message)).toBe(
      'https://wa.me/573001234567?text=Hola%2C%20me%20gustar%C3%ADa%20reservar%20una%20cita',
    );
  });

  // (4) The language-appropriate default country resolves in the curated list.
  test('curated country list carries the language defaults', () => {
    expect(WHATSAPP_COUNTRIES.find((c) => c.iso === WA_DEFAULT_ISO_ES)?.dial).toBe('57');
    expect(WHATSAPP_COUNTRIES.find((c) => c.iso === WA_DEFAULT_ISO_EN)?.dial).toBe('1');
    expect(WHATSAPP_COUNTRIES.length).toBeGreaterThanOrEqual(20);
  });
});
