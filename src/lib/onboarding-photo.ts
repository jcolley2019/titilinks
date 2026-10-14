// TL.ONB.PHOTO.1 — the onboarding photo's "original": naming only.
//
// The editor uploads a full-resolution original beside the display crop and
// stores its URL in pages.avatar_original_url, so re-crop / enhance later work
// from full resolution. Onboarding never did (HERO-AUDIT-2026-06 §1.1/§1.8)
// until TL.ONB.PHOTO.1 gave it the same original.
//
// MEDIA.PHOTO.2 retired the byte/edge policy that used to live here
// (ORIGINAL_KEEP_BYTES_MAX 8 MB → 2400 px JPEG): every site's original now goes
// through the ONE prepare step in src/lib/prepare-image.ts (WebP ≤ 4096 px,
// EXIF/GPS stripped by construction), onboarding included. What is left is the
// object name, which still has to match the editor's byte for byte.
// scripts/onb-original.test.mjs pins it.

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
