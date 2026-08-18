// TL.SOC.1 — what a Social Platforms save writes, and what it deletes.
//
// This lived inline in SocialLinksEditor.handleSave and carried a data-loss
// bug: the delete set was derived from the URL-*filtered* list, so a row the
// user never touched — a platform with no link yet, which renders as a plain
// icon and is a legitimate saved state — was silently DELETED while the toast
// said it had been "skipped". Skipped must mean skipped.
//
// The rule, made explicit and pure so it can be pinned by a spec:
//   • DELETE  ← only pre-existing rows the user removed from the editor list.
//               Derived from the FULL row list, never from the filled subset.
//   • WRITE   ← only rows that carry a URL (insert if new, update otherwise).
//   • SKIP    ← rows with no URL: not written, not deleted, not touched.
//
// order_index comes from each row's position in the FULL list, so a written
// row keeps the slot the user sees it in rather than collapsing past the
// skipped rows sitting above it.

/** Rows carry client-side ids; unsaved ones are prefixed by the editor. */
const NEW_ROW_PREFIX = 'new-';

/** A row with no id at all has never been persisted, so it counts as new. */
export const isNewRowId = (id?: string): boolean => !id || id.startsWith(NEW_ROW_PREFIX);

// Both fields are optional because the editor's row type is inferred from a
// zod schema under `strict: false`, which degrades every key to optional.
export interface SocialSaveRow {
  id?: string;
  url?: string;
}

export interface SocialSavePlan {
  /** Indexes into the full row list that must be inserted/updated. */
  writeIndexes: number[];
  /** Ids of pre-existing rows the user explicitly removed. Nothing else. */
  deleteIds: string[];
  /** Rows with no URL — preserved untouched, and counted for the toast. */
  skipped: number;
}

export function planSocialSave(
  rows: readonly SocialSaveRow[],
  existingIds: readonly string[],
): SocialSavePlan {
  // Every row still on screen that already exists in the database is KEPT —
  // whether or not it carries a URL. Anything the user dragged out of the
  // list is gone from `rows`, and that absence is the only delete signal.
  const kept = new Set(rows.filter((r) => !isNewRowId(r.id)).map((r) => r.id));

  const writeIndexes: number[] = [];
  rows.forEach((row, i) => {
    if ((row.url ?? '').trim().length > 0) writeIndexes.push(i);
  });

  return {
    writeIndexes,
    deleteIds: existingIds.filter((id) => !kept.has(id)),
    skipped: rows.length - writeIndexes.length,
  };
}
