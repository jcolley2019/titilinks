import { supabase } from '@/integrations/supabase/client';
import { isReferenced } from '@/lib/storage-refs';

/**
 * Public buckets whose objects are addressed by a `getPublicUrl` string stored
 * in a DB column. Private buckets are deliberately absent — nothing here should
 * be used to reach one.
 */
export type PublicBucket = 'products' | 'page-assets' | 'avatars';

/**
 * Best-effort delete of the storage object behind a public URL — but only once
 * NOTHING references it any more (TL.STOR.8.3 / TL.SNAP.REF.1).
 *
 * The row that holds the URL is not the only pointer to the object: a snapshot
 * payload may carry the same URL, and restoring that snapshot brings the row
 * back. So for `products` / `page-assets` this first awaits `isReferenced(url,
 * opts)` — live block_items, the page background, every snapshot — and removes
 * the object only when it answers false. A snapshot delete releases the objects
 * only it was holding (see snapshots.ts), so nothing is stranded for good.
 * `avatars` bypasses the check: avatars are outside snapshot scope and the one
 * caller (EditableProfileView) does its own reference check before calling.
 *
 * Call this AFTER the row write that dropped the URL has committed — the check
 * would otherwise still see that row. `opts.excludeItemId` exists for a caller
 * that cannot order it so.
 *
 * Upload paths name files `${userId}/${randomUUID()}.${ext}` with no block
 * segment, so once every pointer is gone the file cannot be found by prefix,
 * only by full sweep. Call this while the URL is still in hand.
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
  opts?: { excludeItemId?: string },
): void {
  if (!url) return;

  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;

  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  if (!path) return;

  const remove = () => supabase.storage.from(bucket).remove([path]);

  if (bucket === 'avatars') {
    remove().catch(() => {});
    return;
  }

  isReferenced(url, opts)
    .then((held) => (held ? undefined : remove()))
    .catch(() => {});
}
