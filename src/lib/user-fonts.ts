// BRAND.1 — uploaded user fonts: file validation, brand_json parsing, and
// @font-face registration.
//
// Font FILES live in the public 'fonts' storage bucket at {user_id}/{filename};
// font METADATA (family + public URL) lives in profiles.brand_json.fonts[]
// (see supabase/migrations/20260722110000_add_brand_kit.sql). This module is
// the render side: given UserFont entries, it injects @font-face rules so the
// `custom:<family>` keys from src/lib/fonts.ts resolve on any surface (public
// page, editor previews, live mirror). Upload/persistence lives in
// src/hooks/useUserFonts.ts.

import type { UserFont } from '@/lib/fonts';

export const MAX_FONT_BYTES = 10 * 1024 * 1024; // 10MB

// Extension → { MIME types browsers/OSes actually report, @font-face format }.
// MIME is validated only when the OS supplies one — Windows often reports ''
// or application/octet-stream for perfectly valid ttf/otf files, so the
// extension is the primary gate and a PRESENT specific MIME must agree.
const FONT_TYPES: Record<string, { mimes: string[]; format: string }> = {
  ttf: { mimes: ['font/ttf', 'application/x-font-ttf', 'application/font-sfnt'], format: 'truetype' },
  otf: { mimes: ['font/otf', 'application/x-font-opentype', 'application/font-sfnt'], format: 'opentype' },
  woff: { mimes: ['font/woff', 'application/font-woff'], format: 'woff' },
  woff2: { mimes: ['font/woff2', 'application/font-woff2'], format: 'woff2' },
};

const GENERIC_MIMES = ['', 'application/octet-stream'];

export type FontFileError = 'invalidType' | 'tooLarge';

function fileExt(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

/** Validate extension + MIME + size. Returns an error code (i18n'd by the
 *  caller) or null when the file is acceptable. */
export function validateFontFile(file: { name: string; type: string; size: number }): FontFileError | null {
  const spec = FONT_TYPES[fileExt(file.name)];
  if (!spec) return 'invalidType';
  if (!GENERIC_MIMES.includes(file.type) && !spec.mimes.includes(file.type)) return 'invalidType';
  if (file.size > MAX_FONT_BYTES) return 'tooLarge';
  return null;
}

/** Display family name from a font file name: extension stripped, separators
 *  spaced, quotes dropped (they would break the CSS string). */
export function fontFamilyFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  const family = base.replace(/['"]/g, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return family || 'Custom Font';
}

/** Tolerant parse of a brand_json (or its fonts array) into UserFont[] —
 *  malformed rows are dropped, never thrown on. */
export function fontsFromBrandJson(raw: unknown): UserFont[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (raw as { fonts?: unknown }).fonts
      : null;
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (f): f is UserFont =>
      !!f && typeof f === 'object' &&
      typeof (f as UserFont).family === 'string' && (f as UserFont).family.trim() !== '' &&
      typeof (f as UserFont).url === 'string' && (f as UserFont).url.trim() !== '',
  );
}

function fontFaceFormat(url: string): string {
  return FONT_TYPES[fileExt(url.split('?')[0])]?.format || 'truetype';
}

/** Register @font-face rules for the given fonts (idempotent — one <style>
 *  per family, keyed by id, so repeat calls are no-ops). No-op outside the
 *  DOM (unit tests / SSR). */
export function ensureUserFontFaces(fonts: UserFont[]): void {
  if (typeof document === 'undefined') return;
  for (const font of fonts) {
    const family = font.family.replace(/['"]/g, '');
    const id = `user-font-${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (document.getElementById(id)) continue;
    const style = document.createElement('style');
    style.id = id;
    style.textContent =
      `@font-face { font-family: '${family}'; src: url('${font.url.replace(/'/g, '%27')}') ` +
      `format('${fontFaceFormat(font.url)}'); font-display: swap; }`;
    document.head.appendChild(style);
  }
}
