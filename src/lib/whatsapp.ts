// WA.1 — WhatsApp deep-link builder (pure core).
//
// wa.me links require an EXACT international number (dial code + national
// number, digits only) and a URL-encoded prefill message. Hand-editing that is
// a foot-gun, so LinksEditor swaps the raw URL field for a three-field builder.
// This module owns the compose/parse/detect truth so the editor UI and its spec
// share one implementation — the predicate that swaps the field in the app is
// the same predicate the test pins.
import { platformFromUrl } from './platform-from-url';

export interface CountryCode {
  /** ISO 3166-1 alpha-2 — the stable, unique option key. */
  iso: string;
  /** International dial code, digits only (no '+'). */
  dial: string;
  /** Flag emoji. */
  flag: string;
  /** Country name (wa.me is language-agnostic; one label serves EN + ES). */
  name: string;
}

// ~20 curated codes, Latin America first (the app's core audience), then a few
// broadly-useful picks. No dial code here is a prefix of another (US/CA share
// +1 but resolve to the same composed URL), so the round-trip split below is
// unambiguous.
export const WHATSAPP_COUNTRIES: CountryCode[] = [
  { iso: 'CO', dial: '57', flag: '🇨🇴', name: 'Colombia' },
  { iso: 'MX', dial: '52', flag: '🇲🇽', name: 'México' },
  { iso: 'AR', dial: '54', flag: '🇦🇷', name: 'Argentina' },
  { iso: 'CL', dial: '56', flag: '🇨🇱', name: 'Chile' },
  { iso: 'PE', dial: '51', flag: '🇵🇪', name: 'Perú' },
  { iso: 'EC', dial: '593', flag: '🇪🇨', name: 'Ecuador' },
  { iso: 'VE', dial: '58', flag: '🇻🇪', name: 'Venezuela' },
  { iso: 'BR', dial: '55', flag: '🇧🇷', name: 'Brasil' },
  { iso: 'BO', dial: '591', flag: '🇧🇴', name: 'Bolivia' },
  { iso: 'PY', dial: '595', flag: '🇵🇾', name: 'Paraguay' },
  { iso: 'UY', dial: '598', flag: '🇺🇾', name: 'Uruguay' },
  { iso: 'GT', dial: '502', flag: '🇬🇹', name: 'Guatemala' },
  { iso: 'CR', dial: '506', flag: '🇨🇷', name: 'Costa Rica' },
  { iso: 'PA', dial: '507', flag: '🇵🇦', name: 'Panamá' },
  { iso: 'SV', dial: '503', flag: '🇸🇻', name: 'El Salvador' },
  { iso: 'HN', dial: '504', flag: '🇭🇳', name: 'Honduras' },
  { iso: 'ES', dial: '34', flag: '🇪🇸', name: 'España' },
  { iso: 'US', dial: '1', flag: '🇺🇸', name: 'United States' },
  { iso: 'CA', dial: '1', flag: '🇨🇦', name: 'Canada' },
  { iso: 'GB', dial: '44', flag: '🇬🇧', name: 'United Kingdom' },
];

/** Default country: Colombia (+57) in a Spanish session, US (+1) otherwise. */
export const WA_DEFAULT_ISO_ES = 'CO';
export const WA_DEFAULT_ISO_EN = 'US';

function countryByIso(iso: string): CountryCode {
  return WHATSAPP_COUNTRIES.find((c) => c.iso === iso) ?? WHATSAPP_COUNTRIES[0];
}

/**
 * The predicate that swaps LinksEditor's raw URL field for the builder. True
 * when the item's platform resolves to WhatsApp (wa.me / whatsapp.com hosts) or
 * the URL is an explicit wa.me deep link — matching the task's exact wording.
 */
export function isWhatsAppUrl(url: string | null | undefined): boolean {
  const raw = (url || '').trim();
  if (!raw) return false;
  return platformFromUrl(raw) === 'WhatsApp' || /^https:\/\/wa\.me\//i.test(raw);
}

/**
 * Compose the canonical wa.me deep link. The dial code is prepended to the
 * national number ONLY when a number is present, so an empty number yields a
 * bare `https://wa.me/` (matching the preset-seeded links). `?text=` is omitted
 * when the message is empty; otherwise the message is URL-encoded exactly.
 */
export function composeWhatsAppUrl(dial: string, number: string, message: string): string {
  const cc = (dial || '').replace(/\D/g, '');
  const digits = (number || '').replace(/\D/g, '');
  const base = 'https://wa.me/' + (digits ? cc + digits : '');
  const text = (message || '').trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export interface ParsedWhatsApp {
  /** Resolved country (default when the dial code is absent or unknown). */
  iso: string;
  /** Dial code digits of the resolved country. */
  dial: string;
  /** National number digits (empty when the link carries no number). */
  number: string;
  /** Decoded prefill message (empty when the link carries none). */
  message: string;
}

/**
 * Parse a wa.me URL back into the three builder fields. A missing number →
 * empty phone field under `defaultIso`; the `?text=` param is decoded into the
 * message. The dial code is split off by longest known-prefix match, so a
 * composed `wa.me/573001234567` round-trips to { CO, '3001234567' }.
 */
export function parseWhatsAppUrl(url: string | null | undefined, defaultIso: string): ParsedWhatsApp {
  const fallback = countryByIso(defaultIso);
  const raw = (url || '').trim();
  let numDigits = '';
  let message = '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    numDigits = u.pathname.replace(/\D/g, '');
    const text = u.searchParams.get('text'); // URLSearchParams already decodes
    if (text) message = text;
  } catch {
    // Best-effort fallback for an unparseable string.
    const nm = raw.match(/wa\.me\/(\d*)/i);
    if (nm) numDigits = nm[1];
    const tm = raw.match(/[?&]text=([^&]*)/i);
    if (tm) {
      try {
        message = decodeURIComponent(tm[1].replace(/\+/g, ' '));
      } catch {
        message = tm[1];
      }
    }
  }

  if (!numDigits) {
    return { iso: fallback.iso, dial: fallback.dial, number: '', message };
  }
  // Longest dial-prefix wins (e.g. +593 before +58), so a 3-digit code is never
  // shadowed by a 2-digit one.
  const byLen = [...WHATSAPP_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of byLen) {
    if (numDigits.startsWith(c.dial)) {
      return { iso: c.iso, dial: c.dial, number: numDigits.slice(c.dial.length), message };
    }
  }
  // Unknown dial code: keep the whole number under the default country.
  return { iso: fallback.iso, dial: fallback.dial, number: numDigits, message };
}
