// PHOTO.POLISH.2 — the light half of Auto enhance: the params, their hard caps,
// and the three functions that only read numbers (sanitizeParams, isIdentity,
// scaleParams).
//
// Split out of src/lib/auto-enhance.ts so that a module on the public page's
// path (src/lib/hero-enhance.ts reads and writes the stored value, and needs
// sanitizeParams for it) does not pull the analysis and the pixel work into
// the entry chunk. auto-enhance.ts re-exports everything here, so it is still
// the one place to import the whole library from; only code that must stay out
// of the heavy half imports this file directly.

export interface EnhanceParams {
  /** Levels: the luminance (0..1) that becomes black. */
  blackPoint: number;
  /** Levels: the luminance (0..1) that becomes white. */
  whitePoint: number;
  /** Midtone gamma after levels: out = in^(1/gamma), so above 1 brightens. */
  gamma: number;
  /** Shadows lift: the tone curve's largest raise, reached at input 1/3. */
  shadows: number;
  /** Highlight recovery: the tone curve's largest pull-down, at input 2/3. */
  highlights: number;
  /** White-balance gains per channel, applied first. 1 = untouched. */
  gainR: number;
  gainG: number;
  gainB: number;
  /** Saturation boost for dull pixels (0 = none). */
  vibrance: number;
  /** Unsharp-mask amount on luminance (0 = none). */
  sharpen: number;
}

export const IDENTITY_PARAMS: Readonly<EnhanceParams> = Object.freeze({
  blackPoint: 0,
  whitePoint: 1,
  gamma: 1,
  shadows: 0,
  highlights: 0,
  gainR: 1,
  gainG: 1,
  gainB: 1,
  vibrance: 0,
  sharpen: 0,
});

// ── Hard caps ────────────────────────────────────────────────────────────────
// The limits sanitizeParams enforces on ANY params — stored, hand-made or junk.
// The analysis never asks for more (its own thresholds are in auto-enhance.ts).

/** Highest black point: a picture whose darkest tones sit above a third is pale on purpose (fog, high key), not washed out. */
export const LEVELS_MAX_BLACK = 0.35;
/** Lowest white point: a picture whose brightest tones sit under 45% is a night scene, not a slip of exposure. */
export const LEVELS_MIN_WHITE = 0.45;
/** Largest levels stretch (contrast ×3): past it the noise and banding of a very flat picture are stretched with it. */
export const LEVELS_MAX_GAIN = 3;

/** Darkest midtone correction: brighter than this is a high-key choice, not a fault. */
export const GAMMA_MIN = 0.75;
/** Brightest midtone correction: past it shadows go milky and noise shows. */
export const GAMMA_MAX = 1.35;

/** Largest shadows lift: more and blacks turn grey. */
export const SHADOWS_MAX = 0.25;

/** Largest highlight recovery: more and bright skies go dull grey. */
export const HIGHLIGHTS_MAX = 0.2;

/** Largest white-balance shift per channel (±10%): a real cast is rarely more, and a wrong guess this size is still mild. */
export const WB_MAX_SHIFT = 0.1;

/** Largest vibrance boost: more and colours turn cartoonish. */
export const VIBRANCE_MAX = 0.2;

/** Largest sharpen amount: more and edges grow halos. */
export const SHARPEN_MAX = 0.35;

const IDENTITY_EPS = 1e-6;
const KEYS = Object.keys(IDENTITY_PARAMS) as (keyof EnhanceParams)[];

// ── Params ───────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Any params → a complete set inside every cap. Absent or junk fields are identity. */
export function sanitizeParams(params: Partial<EnhanceParams> | null | undefined): EnhanceParams {
  const p = (params && typeof params === 'object' ? params : {}) as Partial<Record<keyof EnhanceParams, unknown>>;
  let blackPoint = clamp(num(p.blackPoint, 0), 0, LEVELS_MAX_BLACK);
  let whitePoint = clamp(num(p.whitePoint, 1), LEVELS_MIN_WHITE, 1);
  const minRange = 1 / LEVELS_MAX_GAIN;
  if (whitePoint - blackPoint < minRange) {
    // Too steep a stretch: widen around its middle. Inside the two end caps
    // this always lands inside them again (bp ≤ 0.35 and wp ≥ 0.45).
    const mid = (blackPoint + whitePoint) / 2;
    blackPoint = Math.max(0, mid - minRange / 2);
    whitePoint = blackPoint + minRange;
    if (whitePoint > 1) {
      whitePoint = 1;
      blackPoint = 1 - minRange;
    }
  }
  const gain = (v: unknown) => clamp(num(v, 1), 1 - WB_MAX_SHIFT, 1 + WB_MAX_SHIFT);
  return {
    blackPoint,
    whitePoint,
    gamma: clamp(num(p.gamma, 1), GAMMA_MIN, GAMMA_MAX),
    shadows: clamp(num(p.shadows, 0), 0, SHADOWS_MAX),
    highlights: clamp(num(p.highlights, 0), 0, HIGHLIGHTS_MAX),
    gainR: gain(p.gainR),
    gainG: gain(p.gainG),
    gainB: gain(p.gainB),
    vibrance: clamp(num(p.vibrance, 0), 0, VIBRANCE_MAX),
    sharpen: clamp(num(p.sharpen, 0), 0, SHARPEN_MAX),
  };
}

/** True when the params (after the caps) change nothing. */
export function isIdentity(params: Partial<EnhanceParams> | null | undefined): boolean {
  const p = sanitizeParams(params);
  return KEYS.every((k) => Math.abs(p[k] - IDENTITY_PARAMS[k]) < IDENTITY_EPS);
}

/** Strength 0..1, linear toward identity: 0 is identity, 1 is the params themselves. */
export function scaleParams(params: Partial<EnhanceParams> | null | undefined, strength: number): EnhanceParams {
  const s = clamp(num(strength, 0), 0, 1);
  if (s === 0) return { ...IDENTITY_PARAMS };
  const p = sanitizeParams(params);
  if (s === 1) return p;
  const out = { ...p };
  for (const k of KEYS) out[k] = IDENTITY_PARAMS[k] + (p[k] - IDENTITY_PARAMS[k]) * s;
  return out;
}
