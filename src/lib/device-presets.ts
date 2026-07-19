/**
 * DEVICE_PRESETS — the single, canonical source of truth for the editor's
 * device-truthful preview (DP.1) and any downstream consumer that must match
 * what real phones render.
 *
 * `width` / `height` are LOGICAL CSS-viewport pixels (what a page's CSS sees),
 * NOT physical pixels — that is the number the preview frame renders at and the
 * number a crop aspect must be derived from. `dpr` is the device pixel ratio
 * (physical / logical) for reference only; the preview does not upscale by it.
 *
 * Values are architect-verified for July 2026. iPhone logical sizes are exact;
 * Android logical sizes vary with the user's display-scaling setting, so those
 * carry a `note` and the editor surfaces an "approximate" caption for them.
 *
 * CROP.3a-C and any future consumer MUST import the preset (by id) from here
 * rather than re-declaring dimensions — keep this the only place the numbers live.
 */
export interface DevicePreset {
  /** Stable id — persisted in prefs and referenced by consumers. */
  id: string;
  /** Human label. Device names are intentionally NOT translated. */
  label: string;
  /** Logical CSS-viewport width in px. */
  width: number;
  /** Logical CSS-viewport height in px. */
  height: number;
  /** Device pixel ratio (physical / logical); reference only. */
  dpr: number;
  /** Present when the logical size is approximate (Android scaling varies). */
  note?: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'iphone-17-pro', label: 'iPhone 17 Pro / 17', width: 402, height: 874, dpr: 3 },
  { id: 'iphone-17-pro-max', label: 'iPhone 17 Pro Max', width: 440, height: 956, dpr: 3 },
  { id: 'iphone-16-15', label: 'iPhone 16 / 15', width: 393, height: 852, dpr: 3 },
  { id: 'galaxy-s26', label: 'Galaxy S26', width: 360, height: 780, dpr: 3, note: 'android-approx' },
  { id: 'galaxy-s26-ultra', label: 'Galaxy S26 Ultra', width: 412, height: 932, dpr: 3.5, note: 'android-approx' },
  { id: 'pixel-10', label: 'Pixel 10 / 10 Pro', width: 412, height: 915, dpr: 3, note: 'android-approx' },
  { id: 'ipad-air', label: 'iPad Air / iPad', width: 820, height: 1180, dpr: 2 },
  { id: 'ipad-pro-13', label: 'iPad Pro 13"', width: 1032, height: 1376, dpr: 2 },
];

/** Default preset — iPhone 17 Pro. Also the aspect CROP.3a-C should default to. */
export const DEFAULT_DEVICE_ID = 'iphone-17-pro';

/** Resolve an id to a preset, falling back to the default for unknown/stale ids. */
export function resolveDevicePreset(id: string | null | undefined): DevicePreset {
  return (
    DEVICE_PRESETS.find((d) => d.id === id) ??
    DEVICE_PRESETS.find((d) => d.id === DEFAULT_DEVICE_ID)!
  );
}

// Hero-container geometry — MUST mirror EditableProfileView.tsx's hero window:
//   height: 'calc(50dvh + HERO_EXTRA_PX)', maxHeight: 'calc(HERO_HEIGHT_CAP_PX + HERO_EXTRA_PX)'.
// On a REAL device dvh resolves against the device's own logical height, so the
// hero container's aspect is a pure function of the preset — reproduce it here.
const HERO_EXTRA_PX = 60;        // == EditableProfileView HERO_EXTRA (guard-pinned to 60)
const HERO_HEIGHT_CAP_PX = 500;  // hero maxHeight base, before HERO_EXTRA

/**
 * CROP.3a-C — canonical crop-frame aspect for a HERO page, derived from the
 * device preset (default: iPhone 17 Pro) using the SAME formula the hero
 * container renders at: width = the preset's logical width; height =
 * min(50% of the logical height + HERO_EXTRA, cap + HERO_EXTRA). Because the
 * crop modal frames at this exact aspect, cover-fill of the saved crop at
 * matching aspect + center is an identity — what the user framed is what
 * publishes (WYSIWYG). Deterministic on purpose: keyed to DEFAULT_DEVICE_ID,
 * NOT the live window or the previewed device, so a stored crop is stable no
 * matter where it was made; per-device render differences become tiny posY
 * pans, never a 35% re-crop. Portrait (< 1) for every phone preset.
 */
export function canonicalHeroAspect(deviceId: string = DEFAULT_DEVICE_ID): number {
  const p = resolveDevicePreset(deviceId);
  const heroHeight = Math.min(p.height * 0.5 + HERO_EXTRA_PX, HERO_HEIGHT_CAP_PX + HERO_EXTRA_PX);
  return p.width / heroHeight;
}

/**
 * CROP.3a-C — canonical crop-frame aspect for a FULL-BLEED page. The full_bleed
 * hero fills the whole viewport (100dvh), so the frame aspect is simply the
 * preset's logical width / height. Same determinism contract as
 * canonicalHeroAspect: preset-derived, never window-derived.
 */
export function canonicalFullBleedAspect(deviceId: string = DEFAULT_DEVICE_ID): number {
  const p = resolveDevicePreset(deviceId);
  return p.width / p.height;
}
