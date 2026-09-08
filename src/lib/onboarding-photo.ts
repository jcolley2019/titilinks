// TL.ONB.PHOTO.1 — the onboarding photo's "original" policy, as pure functions.
//
// The editor uploads the picked file UNTOUCHED beside the display crop and
// stores its URL in pages.avatar_original_url, so re-crop / enhance later work
// from full resolution. Onboarding never did (HERO-AUDIT-2026-06 §1.1/§1.8):
// it downsized to 800px before anything was saved and wrote no original at
// all. This module decides what onboarding keeps; StepYourProfile applies it,
// scripts/onb-original.test.mjs pins it.

/**
 * Large-original cap. Editor parity would be "untouched", but onboarding is
 * the one upload a brand-new user makes from a phone on whatever network they
 * have, and a 12–20 MB camera JPEG can take a minute on cellular and time out.
 * 8 MB is well above a typical phone photo (2–5 MB) so most originals ship
 * byte-for-byte; anything larger is downscaled to a 2400px long edge at JPEG
 * q0.92 — still 3× the 800px display copy, and ample for every re-crop the
 * editor offers.
 */
export const ORIGINAL_KEEP_BYTES_MAX = 8 * 1024 * 1024;
export const ORIGINAL_MAX_EDGE = 2400;
export const ORIGINAL_JPEG_QUALITY = 0.92;

export interface OriginalInput {
  bytes: number;
  width: number;
  height: number;
}

export type OriginalPlan =
  | { keepBytes: true }
  | { keepBytes: false; maxEdge: number; quality: number; width: number; height: number };

/** Keep the bytes untouched under the cap; above it, plan a 2400px downscale. */
export function planOriginal({ bytes, width, height }: OriginalInput): OriginalPlan {
  if (bytes <= ORIGINAL_KEEP_BYTES_MAX) return { keepBytes: true };
  const long = Math.max(width, height);
  const ratio = long > ORIGINAL_MAX_EDGE ? ORIGINAL_MAX_EDGE / long : 1;
  return {
    keepBytes: false,
    maxEdge: ORIGINAL_MAX_EDGE,
    quality: ORIGINAL_JPEG_QUALITY,
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * Storage object name for the original — the SAME shape the editor writes
 * (EditableProfileView origFileName: `${user.id}/${uuid}-original.${ext}`),
 * so an onboarding original is indistinguishable from an editor one.
 */
export function originalObjectName(userId: string, uuid: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1) : 'jpg';
  return `${userId}/${uuid}-original.${ext}`;
}
