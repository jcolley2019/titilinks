import { supabase } from '@/integrations/supabase/client';

/**
 * Public buckets whose objects are addressed by a `getPublicUrl` string stored
 * in a DB column. Private buckets are deliberately absent — nothing here should
 * be used to reach one.
 */
export type PublicBucket = 'products' | 'page-assets' | 'avatars';

/**
 * Best-effort delete of the storage object behind a public URL.
 *
 * The row that holds the URL is the ONLY pointer to the object — upload paths
 * name files `${userId}/${randomUUID()}.${ext}` with no block segment, so once
 * the row is gone the file cannot be found by prefix, only by full sweep. Call
 * this while the URL is still in hand.
 *
 * Fire-and-forget by design, mirroring the fonts cleanup in useUserFonts: a
 * stale file in a public bucket is untidy, but a failed delete must never fail
 * the user's action. Nothing awaits this and nothing surfaces its errors.
 *
 * Silently does nothing when there is no URL, or when the URL does not point at
 * `bucket` — an externally hosted image the user pasted, or an asset living in
 * a different bucket, must not be touched.
 */
export function removePublicObject(
  bucket: PublicBucket,
  url: string | null | undefined,
): void {
  if (!url) return;

  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;

  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  if (!path) return;

  supabase.storage.from(bucket).remove([path]).catch(() => {});
}
