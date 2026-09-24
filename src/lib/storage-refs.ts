import { supabase } from '@/integrations/supabase/client';

/**
 * TL.STOR.8.3 — reference-aware storage cleanup (TL.SNAP.REF.1).
 *
 * A `products` / `page-assets` object may be pointed at by more than the row
 * the user just deleted: `profile_snapshots.payload` captures block_items'
 * `image_url` and `theme_json.background.image_url`, so restoring an older
 * snapshot brings those URLs back. The ruling: an object is deleted only when
 * NOTHING references it — no live row and no snapshot. `removePublicObject`
 * asks `isReferenced` before it removes anything, and deleting a snapshot
 * releases the objects only that snapshot was holding.
 *
 * `avatars` is deliberately absent: avatars are outside snapshot scope, and the
 * one avatars caller (EditableProfileView) does its own reference check.
 */

export type RefBucket = 'products' | 'page-assets';

const REF_BUCKETS: readonly RefBucket[] = ['products', 'page-assets'];

/** Any http(s) URL that addresses an object in a ref-tracked public bucket.
 *  Extracted as a substring so a URL embedded in a larger string (a CSS
 *  `url("…")`, say) is still found — and found WITHOUT its wrapper. */
const PUBLIC_URL_RE = /https?:\/\/[^\s"'()<>\\]+\/object\/public\/(?:products|page-assets)\/[^\s"'()<>\\]+/g;

/**
 * The bucket + object path behind a public URL, or null when the URL does not
 * point into `products` / `page-assets` (an external image, an avatar, junk).
 * Same parsing as removePublicObject: the `/object/public/<bucket>/` marker,
 * query string dropped, path URL-decoded.
 */
export function publicObjectRef(
  url: string | null | undefined,
): { bucket: RefBucket; path: string } | null {
  if (!url) return null;
  for (const bucket of REF_BUCKETS) {
    const marker = `/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) continue;
    const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
    return path ? { bucket, path } : null;
  }
  return null;
}

/**
 * Every `products` / `page-assets` public URL anywhere inside a JSON value —
 * a snapshot payload (items' `image_url`, `theme_json.background.image_url`),
 * a bare `theme_json`, anything. Deduped, first-seen order. Pure.
 */
export function collectPublicUrls(json: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const m of v.match(PUBLIC_URL_RE) ?? []) found.add(m);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(json);
  return [...found];
}

/**
 * True when anything still points at `url`:
 *   • a block_items row whose image_url is it (minus `excludeItemId`);
 *   • a pages row whose theme_json.background.image_url is it;
 *   • a profile_snapshots row (owner-only under RLS, minus `excludeSnapshotId`)
 *     whose payload contains it — fetched and tested client-side, since
 *     snapshots are capped per page and the set stays small.
 * The live-row reads run under the caller's RLS, which can only widen what
 * they see beyond the owner's pages — more "referenced", never less.
 *
 * Fails SAFE: any query error answers true. Never delete on doubt.
 */
export async function isReferenced(
  url: string,
  opts: { excludeSnapshotId?: string; excludeItemId?: string } = {},
): Promise<boolean> {
  try {
    let items = supabase.from('block_items').select('id').eq('image_url', url).limit(1);
    if (opts.excludeItemId) items = items.neq('id', opts.excludeItemId);

    const pages = supabase
      .from('pages')
      .select('id')
      .eq('theme_json->background->>image_url', url)
      .limit(1);

    let snaps = supabase.from('profile_snapshots').select('id, payload');
    if (opts.excludeSnapshotId) snaps = snaps.neq('id', opts.excludeSnapshotId);

    const [i, p, s] = await Promise.all([items, pages, snaps]);
    if (i.error || p.error || s.error) return true;
    if ((i.data ?? []).length || (p.data ?? []).length) return true;
    return (s.data ?? []).some((row) => JSON.stringify(row.payload ?? null).includes(url));
  } catch {
    return true;
  }
}
