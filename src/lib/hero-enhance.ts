/**
 * PHOTO.POLISH.1 — Auto enhance on the hero picture.
 *
 * The free, in-browser enhancement (src/lib/auto-enhance.ts) applied to the
 * hero's DISPLAY file when it is baked. The kept original is never changed, so
 * the public page, `pages_public` and hero-framing.ts know nothing about this:
 * a page simply shows the file it was given.
 *
 * ## What is stored
 *
 * One object in the hero config slot (`heroConfig` / `heroConfig_page2`), beside
 * the window: `{ strength, params }`. `strength` is above 0 up to 1; `params`
 * is what `analyzePhoto` returned for the picture. Absent means off. This file
 * is the ONLY place that names the stored key — everything else goes through
 * readHeroEnhance / writeHeroEnhance.
 *
 * The params are stored, not only the strength, so a later bake of the same
 * picture (a nudged crop, a strength change) re-uses the SAME numbers: the
 * colour does not shift because the frame moved. Turning the switch off and on
 * analyses again.
 *
 * ## Canvas work
 *
 * PHOTO.POLISH.2: the canvas work (analyzeForEnhance, enhanceCanvas) is in
 * src/lib/hero-enhance-canvas.ts, a chunk of its own, because this file is on
 * the public page's path (EditableProfileView reads the stored value) and a
 * visitor must not download the enhancement. loadHeroEnhanceCanvas below is the
 * ONE door to it: a cached dynamic import, awaited where a picture is baked or
 * previewed. Never import hero-enhance-canvas statically from app code.
 */
import { sanitizeParams, type EnhanceParams } from './auto-enhance-params';

/** The stored value: how strongly, and with which numbers. */
export interface HeroEnhance {
  /** Above 0, up to 1. */
  strength: number;
  params: EnhanceParams;
}

/** A rectangle in canvas pixels. */
export interface HeroEnhanceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const KEY = 'enhance';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const usableStrength = (s: unknown): s is number =>
  typeof s === 'number' && Number.isFinite(s) && s > 0;

/**
 * The enhancement stored in a hero config slot, or null: no slot, no key, a
 * strength that is not above 0, or params that are not an object. A strength
 * over 1 reads as 1; the params come back inside every cap (sanitizeParams).
 */
export function readHeroEnhance(slot: unknown): HeroEnhance | null {
  if (!isRecord(slot)) return null;
  const raw = slot[KEY];
  if (!isRecord(raw) || !usableStrength(raw.strength) || !isRecord(raw.params)) return null;
  return {
    strength: Math.min(1, raw.strength),
    params: sanitizeParams(raw.params as Partial<EnhanceParams>),
  };
}

/**
 * The slot with the enhancement written, or removed when `value` is null or
 * unusable. Every other key is kept; the input is never mutated.
 */
export function writeHeroEnhance(slot: unknown, value: HeroEnhance | null | undefined): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(slot) ? { ...slot } : {};
  delete next[KEY];
  if (isRecord(value) && usableStrength(value.strength) && isRecord(value.params)) {
    next[KEY] = {
      strength: Math.min(1, value.strength),
      params: sanitizeParams(value.params as Partial<EnhanceParams>),
    };
  }
  return next;
}

/** True when two stored values would bake the same picture. */
export function sameHeroEnhance(a: HeroEnhance | null | undefined, b: HeroEnhance | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (Math.abs(a.strength - b.strength) > 1e-9) return false;
  const pa = sanitizeParams(a.params);
  const pb = sanitizeParams(b.params);
  return (Object.keys(pa) as (keyof EnhanceParams)[]).every((k) => Math.abs(pa[k] - pb[k]) < 1e-9);
}

let canvasModule: Promise<typeof import('./hero-enhance-canvas')> | null = null;

/**
 * The canvas work (src/lib/hero-enhance-canvas.ts), loaded on first use and
 * kept. A failed load is not kept: the next call tries again.
 */
export function loadHeroEnhanceCanvas(): Promise<typeof import('./hero-enhance-canvas')> {
  if (!canvasModule) {
    canvasModule = import('./hero-enhance-canvas').catch((err) => {
      canvasModule = null;
      throw err;
    });
  }
  return canvasModule;
}
