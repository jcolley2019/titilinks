// Small-card pairing rule — the SINGLE source of truth, shared by the render
// layer (LinksBlock, which lays cards out) and the editor (LinksEditor, which
// uses it to find a Small card's partner). Keeping one implementation guarantees
// the editor's idea of "who pairs with whom" matches what actually renders.

export const VALID_SIZES = ['big', 'medium', 'small', 'button'] as const;
export type ItemSize = typeof VALID_SIZES[number];

export type SizeLike = { size?: string | null };

// A planned render row: a full-width single, an unpaired Small promoted to a
// full-width "large thumbnail", or a pair of Smalls rendered side-by-side.
export type LinkLayoutRow<T> =
  | { kind: 'single'; item: T }
  | { kind: 'lone-small'; item: T }
  | { kind: 'pair'; items: [T, T] };

// Pair CONSECUTIVE Small cards two-per-row, preserving order. A Small with no
// adjacent Small partner becomes a lone-small (rendered full-width as Big — the
// "large thumbnail" fallback). Non-Small cards always take their own full row.
export function planLinkLayout<T extends SizeLike>(
  items: T[],
  resolveSize: (raw: string | null | undefined) => ItemSize,
): LinkLayoutRow<T>[] {
  const rows: LinkLayoutRow<T>[] = [];
  let pending: T | null = null;
  for (const item of items) {
    if (resolveSize(item.size) === 'small') {
      if (pending) {
        rows.push({ kind: 'pair', items: [pending, item] });
        pending = null;
      } else {
        pending = item;
      }
    } else {
      if (pending) { rows.push({ kind: 'lone-small', item: pending }); pending = null; }
      rows.push({ kind: 'single', item });
    }
  }
  if (pending) rows.push({ kind: 'lone-small', item: pending });
  return rows;
}

// The Small partner of the item with the given id, or null if it is lone / not
// Small / not found. Uses the exact pairing rule above so the editor pairs the
// same two items the profile will.
export function findPartnerId<T extends SizeLike & { id: string }>(
  items: T[],
  id: string,
  resolveSize: (raw: string | null | undefined) => ItemSize,
): T | null {
  for (const row of planLinkLayout(items, resolveSize)) {
    if (row.kind === 'pair') {
      if (row.items[0].id === id) return row.items[1];
      if (row.items[1].id === id) return row.items[0];
    }
  }
  return null;
}
