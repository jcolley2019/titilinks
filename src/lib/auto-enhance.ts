// IMG.ENH.1 — Auto enhance: the free, in-browser replacement for the paid
// upscaler. One tap that brightens, balances and gently sharpens a photo the
// way a phone's Auto button does.
//
// Wired through src/lib/hero-enhance.ts: the hero's Auto enhance in the Edit
// Photo screen (PHOTO.POLISH.1). IMG.ENH.1 built the maths and proved it with
// pictures (scripts/auto-enhance.test.mjs and the IMG.ENH.1 contact sheets).
//
// Pure functions on RGBA arrays — no DOM, no canvas — so the whole pipeline
// runs under tsx with no browser. Analysis and application are separate on
// purpose: analyzePhoto reads a small downsample (long side about 256 px) and
// returns a handful of plain numbers; applyEnhance paints those numbers onto
// the full-size pixels. A later brick may store the numbers instead of baking
// a file, and scaleParams turns one slider (0..1) into a weaker set.
//
// Pipeline order (fixed): white balance → levels → tone (gamma, shadows,
// highlights) → vibrance → sharpen (luminance only, 3×3, with a threshold).
//
// Conservative by construction. Every adjustment has a hard cap, written as a
// named constant below with its reason, and sanitizeParams enforces the caps
// on ANY params — stored, hand-made or junk — before they touch a pixel.
// Do no harm: a well-exposed photo is left almost alone (dead bands around a
// healthy black and white point, exposure read off the bright tenth so a
// low-key photo is not brightened, warm light kept, no white balance inside
// ±2% or under one dominant hue), and a flat graphic (a handful of colours)
// comes back byte for byte.
// The tone curve is monotone at every combination of caps: a brighter input
// never ends darker than a darker one.

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

// ── Caps ─────────────────────────────────────────────────────────────────────
// Hard limits. The analysis never asks for more, and sanitizeParams clamps any
// params to them, so no stored or hand-made set can exceed them either.

/** Levels read the luminance histogram this far in from each end. Tuned inside the 0.5% cap: a quarter-percent per end keeps the two ends together well under the 1-point clipping budget. */
export const LEVELS_CLIP_SHARE = 0.0025;
/** Highest black point: a picture whose darkest tones sit above a third is pale on purpose (fog, high key), not washed out. */
export const LEVELS_MAX_BLACK = 0.35;
/** Lowest white point: a picture whose brightest tones sit under 45% is a night scene, not a slip of exposure. */
export const LEVELS_MIN_WHITE = 0.45;
/** Largest levels stretch (contrast ×3): past it the noise and banding of a very flat picture are stretched with it. */
export const LEVELS_MAX_GAIN = 3;
/** An end within this of black or white (≈ 10/255) is a healthy photo and stays put. */
export const LEVELS_DEADBAND = 0.04;
/** A raised black is a fault (haze, a washed-out scan): past the dead band the black point eases to the full move by twice the band. */
export const LEVELS_BLACK_EASE = 2 * LEVELS_DEADBAND;
/** A lowered white is often a choice (a moody photo holds no pure white): the white point eases in slowly and is only moved in full this far from white. */
export const LEVELS_WHITE_EASE = 0.4;

/** Darkest midtone correction: brighter than this is a high-key choice, not a fault. */
export const GAMMA_MIN = 0.75;
/** Brightest midtone correction: past it shadows go milky and noise shows. */
export const GAMMA_MAX = 1.35;
/** Exposure is read off the bright tenth of the picture, not the median: a low-key photo (a dark room, a bright face) keeps a bright top tenth and is left alone; an underexposed one has none. Below this the top tenth is dim. */
export const KEY_BRIGHT = 0.4;
/** Darkening needs even the darkest tenth above this: a picture with no shadows at all. */
export const KEY_DARK = 0.4;

/** Largest shadows lift: more and blacks turn grey. */
export const SHADOWS_MAX = 0.25;
/** Luminance below which a pixel counts as shadow for the lift. */
export const SHADOW_ZONE = 0.2;
/** Share of shadow pixels a picture must have for the lift. */
export const SHADOW_TRIGGER = 0.3;
/** The lift only picks up where the gamma cap stopped: lift per unit the bright tenth is still short of KEY_BRIGHT. */
export const SHADOW_RATE = 2;

/** Largest highlight recovery: more and bright skies go dull grey. */
export const HIGHLIGHTS_MAX = 0.2;
/** Luminance above which a pixel counts as highlight. */
export const HIGHLIGHT_ZONE = 0.9;
/** Share of highlight pixels a picture may have before recovery starts. */
export const HIGHLIGHT_TRIGGER = 0.2;
/** Recovery per unit of highlight share over the trigger. */
export const HIGHLIGHT_RATE = 0.8;

/** Largest white-balance shift per channel (±10%): a real cast is rarely more, and a wrong guess this size is still mild. */
export const WB_MAX_SHIFT = 0.1;
/** Casts under ±2% are left alone: a correction that small is a guess, not a fix. */
export const WB_DEADBAND = 0.02;
/** Warm light is kept up to about 8% (log units): candle-light, golden hour and tungsten moods are usually meant. Cool and green casts are corrected in full. */
export const WB_WARM_KEEP = Math.log(1.08);
/** Pixels more saturated than this are colour, not neutral, and do not vote on the cast. */
export const WB_NEUTRAL_MAX_SAT = 0.4;
/** The neutral-ish pixels must weigh at least this share of the picture, or there is nothing to balance against. */
export const WB_MIN_NEUTRAL = 0.05;
/** Saturation at which a pixel counts towards a dominant hue. */
export const WB_DOMINANT_SAT = 0.35;
/** When one 60° hue window holds this share of the picture in strong colour, it is a sunset or stage lighting, not a cast: no white balance. */
export const WB_DOMINANT_SHARE = 0.4;

/** Largest vibrance boost: more and colours turn cartoonish. */
export const VIBRANCE_MAX = 0.2;
/** Median saturation of the colourful pixels below which a picture reads as dull. */
export const VIBRANCE_TARGET = 0.3;
/** Skin hues get this share of the boost: faces go orange fast. */
export const VIBRANCE_SKIN_FACTOR = 0.5;

/** Largest sharpen amount: more and edges grow halos. */
export const SHARPEN_MAX = 0.35;
/** What Auto applies to a photo. Gentle: the analysis reads a downsample and cannot judge full-size detail. */
export const SHARPEN_AUTO = 0.2;
/** Luminance differences under this (in 0..255) are grain, not detail, and are not sharpened. */
export const SHARPEN_THRESHOLD = 4;

/** A picture whose 8 commonest colours (5 bits/channel) cover this share is a flat graphic or logo: left exactly as it is. */
export const GRAPHIC_COVERAGE = 0.9;
const GRAPHIC_TOP_COLORS = 8;

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

// ── Tone curve ───────────────────────────────────────────────────────────────

/**
 * Levels, gamma, shadows, highlights on one 0..1 value. Each stage is monotone
 * on [0,1] and maps it onto itself, so their composition is too:
 *   shadows   v + s·6.75·v(1−v)²   slope ≥ 1 − 2.25·s ≥ 0.44 at s = 0.25
 *   highlights v − h·6.75·v²(1−v)  slope ≥ 1 − 2.25·h ≥ 0.55 at h = 0.20
 * (6.75 = 27/4 puts each bump's peak at exactly s or h.)
 */
function toneValue(x: number, p: EnhanceParams): number {
  let v = (x - p.blackPoint) / (p.whitePoint - p.blackPoint);
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  if (p.gamma !== 1) v = Math.pow(v, 1 / p.gamma);
  if (p.shadows > 0) {
    const u = 1 - v;
    v += p.shadows * 6.75 * v * u * u;
  }
  if (p.highlights > 0) v -= p.highlights * 6.75 * v * v * (1 - v);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** One channel's lookup: white-balance gain, then the tone curve. */
function channelLut(gain: number, p: EnhanceParams): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = Math.min(1, (i * gain) / 255);
    lut[i] = Math.round(255 * toneValue(x, p));
  }
  return lut;
}

/** The neutral tone curve (levels + gamma + shadows + highlights) as 256 output levels. */
export function toneCurve(params: Partial<EnhanceParams> | null | undefined): Uint8Array {
  return channelLut(1, sanitizeParams(params));
}

// ── Analysis ─────────────────────────────────────────────────────────────────

function pixelCount(rgba: Uint8ClampedArray, w: number, h: number): number {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 0 || h < 0 || rgba.length < w * h * 4) {
    throw new RangeError(`auto-enhance: ${w}×${h} does not fit ${rgba.length} bytes`);
  }
  return w * h;
}

/** HSV saturation 0..1 of one pixel. */
const satOf = (max: number, min: number) => (max === 0 ? 0 : (max - min) / max);

/** Hue in sixths of the circle, [0, 6). Caller guarantees max > min. */
function hue6(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  if (max === r) {
    const h = (g - b) / d;
    return h < 0 ? h + 6 : h;
  }
  if (max === g) return (b - r) / d + 2;
  return (r - g) / d + 4;
}

/** A face-ish hue: red over green over blue, 6°..51°. */
function isSkin(r: number, g: number, b: number): boolean {
  if (!(r >= g && g >= b && r > b)) return false;
  const q = (g - b) / (r - b);
  return q >= 0.1 && q <= 0.85;
}

/** Few colours covering nearly every pixel: a logo, a flat graphic, a screenshot of one. */
function isFlatGraphic(rgba: Uint8ClampedArray, n: number): boolean {
  const counts = new Map<number, number>();
  for (let i = 0; i < n * 4; i += 4) {
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size <= GRAPHIC_TOP_COLORS) return true;
  const top = [...counts.values()].sort((a, b) => b - a).slice(0, GRAPHIC_TOP_COLORS);
  return top.reduce((s, c) => s + c, 0) >= GRAPHIC_COVERAGE * n;
}

/** Grey-world over the neutral-ish pixels, skipped when one hue dominates. */
function estimateWhiteBalance(rgba: Uint8ClampedArray, n: number): [number, number, number] {
  const hueBins = new Float64Array(12);
  let counted = 0;
  let sw = 0, sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < n * 4; i += 4) {
    if (rgba[i + 3] < 128) continue;
    counted++;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const sat = satOf(max, min);
    if (sat >= WB_DOMINANT_SAT && max >= 51) hueBins[Math.floor(hue6(r, g, b, max, min) * 2) % 12]++;
    // Too dark to read, or clipped: no vote on the cast.
    if (max < 26 || max > 250 || sat >= WB_NEUTRAL_MAX_SAT) continue;
    const t = 1 - sat / WB_NEUTRAL_MAX_SAT;
    const w = t * t;
    sw += w; sr += w * r; sg += w * g; sb += w * b;
  }
  if (counted === 0) return [1, 1, 1];
  let dominant = 0;
  for (let k = 0; k < 12; k++) dominant = Math.max(dominant, hueBins[k] + hueBins[(k + 1) % 12]);
  if (dominant >= WB_DOMINANT_SHARE * counted) return [1, 1, 1];
  if (sw < WB_MIN_NEUTRAL * counted || sr <= 0 || sg <= 0 || sb <= 0) return [1, 1, 1];
  // The correction in log units, split into temperature (blue against red;
  // positive = the picture is warm) and tint (green against magenta). Their
  // three gains multiply to 1, so the correction does not move brightness.
  const grey = (sr + sg + sb) / 3;
  const lr = Math.log(grey / sr), lg = Math.log(grey / sg), lb = Math.log(grey / sb);
  let temp = (lb - lr) / 2;
  const tint = lg - (lr + lb) / 2;
  if (temp > 0) temp = Math.max(0, temp - WB_WARM_KEEP);
  const gains: [number, number, number] = [
    Math.exp(-temp - tint / 3),
    Math.exp((2 * tint) / 3),
    Math.exp(temp - tint / 3),
  ];
  if (gains.every((g) => Math.abs(g - 1) < WB_DEADBAND)) return [1, 1, 1];
  return gains.map((g) => clamp(g, 1 - WB_MAX_SHIFT, 1 + WB_MAX_SHIFT)) as [number, number, number];
}

/**
 * Distance d of a histogram end from black (or white) → how far to move that
 * end: 0 inside the dead band, the full d from `full` on, and a smooth ramp
 * d·(d − band)/(full − band) between (continuous at both joins, increasing).
 */
function easeEnd(d: number, full: number): number {
  if (d <= LEVELS_DEADBAND) return 0;
  if (d >= full) return d;
  return (d * (d - LEVELS_DEADBAND)) / (full - LEVELS_DEADBAND);
}

/**
 * Black and white points. The black end is read from each pixel's DARKEST
 * channel and the white end from its BRIGHTEST, so a saturated colour (an
 * amber bottle's blue, a stage light's red) is not pushed into a clip that
 * its luminance alone would allow. A pixel's darkest channel is never above
 * its luminance and its brightest never below, so both ends sit at or outside
 * the luminance percentiles: the luminance cap holds.
 */
function levelsFromHistograms(
  minHist: Float64Array,
  maxHist: Float64Array,
  total: number,
): { blackPoint: number; whitePoint: number } {
  const budget = LEVELS_CLIP_SHARE * total;
  // Lowest bin with more than the budget at or below it; everything strictly
  // under the black point (at most the budget) goes to 0. One bin lower, so
  // the bin itself lands just above black rather than on it.
  let cum = 0;
  let low = 0;
  for (; low < 255; low++) {
    cum += minHist[low];
    if (cum > budget) break;
  }
  cum = 0;
  let high = 255;
  for (; high > 0; high--) {
    cum += maxHist[high];
    if (cum > budget) break;
  }
  const lowV = Math.max(0, low - 1) / 255;
  const highV = Math.min(255, high + 1) / 255;
  const blackPoint = easeEnd(lowV, LEVELS_BLACK_EASE);
  // A raised black means haze or a washed-out copy, and then the lowered white
  // is the same fault: the white moves as freely as the black does. With a
  // healthy black the white eases in slowly. `haze` (0..1) blends the two.
  const haze = lowV > 0 ? blackPoint / lowV : 0;
  const dWhite = 1 - highV;
  const whiteMove =
    (1 - haze) * easeEnd(dWhite, LEVELS_WHITE_EASE) + haze * easeEnd(dWhite, LEVELS_BLACK_EASE);
  return { blackPoint, whitePoint: 1 - whiteMove };
}

/** Value at the given share of a histogram pushed through f (f monotone). */
function quantileThrough(hist: Float64Array, total: number, q: number, f: (x: number) => number): number {
  const target = q * total;
  let cum = 0;
  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (cum >= target) return f(i / 255);
  }
  return f(1);
}

/** Share of a histogram that f maps into the test. */
function shareThrough(hist: Float64Array, total: number, f: (x: number) => number, test: (v: number) => boolean): number {
  let s = 0;
  for (let i = 0; i < 256; i++) if (hist[i] && test(f(i / 255))) s += hist[i];
  return total ? s / total : 0;
}

/**
 * Read a picture and return the Auto params. Pass a downsample (long side
 * about 256 px): the analysis is global, so more pixels buy nothing. Each
 * stage is measured on the picture as the stages before it leave it.
 */
export function analyzePhoto(rgba: Uint8ClampedArray, w: number, h: number): EnhanceParams {
  const n = pixelCount(rgba, w, h);
  if (n < 16 || isFlatGraphic(rgba, n)) return { ...IDENTITY_PARAMS };

  // 1. White balance.
  const [gainR, gainG, gainB] = estimateWhiteBalance(rgba, n);

  // 2. Levels, from the picture after white balance. `hist` is luminance (the
  // tone stages read it); the two channel histograms set the end points.
  const hist = new Float64Array(256);
  const minHist = new Float64Array(256);
  const maxHist = new Float64Array(256);
  let total = 0;
  for (let i = 0; i < n * 4; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = Math.min(255, rgba[i] * gainR);
    const g = Math.min(255, rgba[i + 1] * gainG);
    const b = Math.min(255, rgba[i + 2] * gainB);
    hist[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
    minHist[Math.round(Math.min(r, g, b))]++;
    maxHist[Math.round(Math.max(r, g, b))]++;
    total++;
  }
  if (total === 0) return { ...IDENTITY_PARAMS };
  const p: EnhanceParams = {
    ...IDENTITY_PARAMS,
    gainR,
    gainG,
    gainB,
    ...levelsFromHistograms(minHist, maxHist, total),
  };
  const through = (x: number) => toneValue(x, p);

  // 3. Gamma, read off the ends of the picture rather than its middle: a dim
  // bright tenth brightens, a bright dark tenth (no shadows at all) darkens.
  const p90 = clamp(quantileThrough(hist, total, 0.9, through), 0.02, 0.98);
  const p10 = clamp(quantileThrough(hist, total, 0.1, through), 0.02, 0.98);
  if (p90 < KEY_BRIGHT) p.gamma = Math.log(p90) / Math.log(KEY_BRIGHT);
  else if (p10 > KEY_DARK) p.gamma = Math.log(p10) / Math.log(KEY_DARK);
  p.gamma = clamp(p.gamma, GAMMA_MIN, GAMMA_MAX);

  // 4. Shadows: only where the gamma cap left a shadow-heavy picture dim.
  const p90After = quantileThrough(hist, total, 0.9, through);
  const shadowShare = shareThrough(hist, total, through, (v) => v < SHADOW_ZONE);
  if (shadowShare > SHADOW_TRIGGER && p90After < KEY_BRIGHT) {
    p.shadows = clamp((KEY_BRIGHT - p90After) * SHADOW_RATE, 0, SHADOWS_MAX);
  }
  // 5. Highlights, on the curve so far.
  const highShare = shareThrough(hist, total, through, (v) => v > HIGHLIGHT_ZONE);
  p.highlights = clamp((highShare - HIGHLIGHT_TRIGGER) * HIGHLIGHT_RATE, 0, HIGHLIGHTS_MAX);

  // 6. Vibrance: the median saturation of the colourful pixels, after the curve.
  const lr = channelLut(gainR, p), lg = channelLut(gainG, p), lb = channelLut(gainB, p);
  const satBins = new Float64Array(101);
  let colourful = 0;
  for (let i = 0; i < n * 4; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = lr[rgba[i]], g = lg[rgba[i + 1]], b = lb[rgba[i + 2]];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (max < 26) continue;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const sat = satOf(max, min);
    if (sat < 0.1) continue;
    satBins[Math.round(sat * 100)]++;
    colourful++;
  }
  if (colourful >= 0.05 * total) {
    let cum = 0;
    let k = 0;
    for (; k < 100; k++) {
      cum += satBins[k];
      if (cum >= colourful / 2) break;
    }
    p.vibrance = clamp(VIBRANCE_TARGET - k / 100, 0, VIBRANCE_MAX);
  }

  // 7. Sharpen: a fixed gentle amount for a photo.
  p.sharpen = SHARPEN_AUTO;

  return sanitizeParams(p);
}

// ── Application ──────────────────────────────────────────────────────────────

/** Push dull colours away from their own luminance; never into a new clip. */
function vibrancePass(px: Uint8ClampedArray, n: number, amount: number): void {
  for (let i = 0; i < n * 4; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (max === min) continue;
    let a = amount * (1 - satOf(max, min));
    if (isSkin(r, g, b)) a *= VIBRANCE_SKIN_FACTOR;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Keep every channel inside 1..254 so the boost alone never clips.
    if (max > L) a = Math.min(a, (254.4 - L) / (max - L) - 1);
    if (min < L) a = Math.min(a, (L - 0.6) / (L - min) - 1);
    if (!(a > 0)) continue;
    const f = 1 + a;
    px[i] = L + (r - L) * f;
    px[i + 1] = L + (g - L) * f;
    px[i + 2] = L + (b - L) * f;
  }
}

/** Unsharp mask on luminance: 3×3 binomial blur, soft threshold, no new clipping. The 1 px border is left as it is. */
function sharpenPass(px: Uint8ClampedArray, w: number, h: number, amount: number): void {
  const n = w * h;
  const Y = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) Y[p] = (54 * px[i] + 183 * px[i + 1] + 19 * px[i + 2]) >> 8;
  const t16 = SHARPEN_THRESHOLD * 16;
  const k = amount / 16;
  for (let y = 1; y < h - 1; y++) {
    let p = y * w + 1;
    for (let x = 1; x < w - 1; x++, p++) {
      const sum =
        Y[p - w - 1] + 2 * Y[p - w] + Y[p - w + 1] +
        2 * Y[p - 1] + 4 * Y[p] + 2 * Y[p + 1] +
        Y[p + w - 1] + 2 * Y[p + w] + Y[p + w + 1];
      let d16 = 16 * Y[p] - sum;
      if (d16 > t16) d16 -= t16;
      else if (d16 < -t16) d16 += t16;
      else continue;
      let delta = k * d16;
      const i = p * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (delta > 0) {
        const max = r > g ? (r > b ? r : b) : g > b ? g : b;
        delta = Math.min(delta, 254.4 - max);
        if (delta <= 0) continue;
      } else {
        const min = r < g ? (r < b ? r : b) : g < b ? g : b;
        delta = Math.max(delta, 0.6 - min);
        if (delta >= 0) continue;
      }
      px[i] = r + delta;
      px[i + 1] = g + delta;
      px[i + 2] = b + delta;
    }
  }
}

/**
 * Paint params onto a picture. Returns a NEW array (same length as the input);
 * the input is never mutated. Identity params return an exact copy. Alpha is
 * kept as it is.
 */
export function applyEnhance(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  params: Partial<EnhanceParams> | null | undefined,
): Uint8ClampedArray {
  const n = pixelCount(rgba, w, h);
  const out = new Uint8ClampedArray(rgba);
  const p = sanitizeParams(params);
  if (isIdentity(p) || n === 0) return out;

  // 1-3. White balance, levels and tone in one lookup per channel.
  const lr = channelLut(p.gainR, p), lg = channelLut(p.gainG, p), lb = channelLut(p.gainB, p);
  for (let i = 0; i < n * 4; i += 4) {
    out[i] = lr[out[i]];
    out[i + 1] = lg[out[i + 1]];
    out[i + 2] = lb[out[i + 2]];
  }
  // 4. Vibrance.
  if (p.vibrance > 0) vibrancePass(out, n, p.vibrance);
  // 5. Sharpen.
  if (p.sharpen > 0 && w >= 3 && h >= 3) sharpenPass(out, w, h, p.sharpen);
  return out;
}
