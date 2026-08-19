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
//   • WRITE   ← every row on screen (insert if new, update otherwise).
//
// TL.SOC.4 corrected the WRITE rule. It used to cover only rows carrying a
// URL, so a freshly picked platform with no link yet was never inserted at
// all: no row existed, nothing could render, and the toast called it
// "skipped". That broke the promise onboarding makes — pick your platforms
// now, add the links later — because only rows onboarding itself had written
// survived. A URL-less row is a real saved state (TL.SOC.3 renders it as a
// "needs a link" placeholder in the editor and hides it from visitors), so
// the save has to be able to create one.
//
// order_index comes from each row's position in the FULL list, so every row
// keeps the slot the user sees it in.

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
  /** Indexes into the full row list that must be inserted/updated — all of them. */
  writeIndexes: number[];
  /** Ids of pre-existing rows the user explicitly removed. Nothing else. */
  deleteIds: string[];
  /**
   * Rows written with no URL yet. They ARE saved; this is how many of them
   * still need a link, which is what the save toast reports. It is not a
   * count of anything skipped — nothing is skipped any more.
   */
  needsLink: number;
}

export function planSocialSave(
  rows: readonly SocialSaveRow[],
  existingIds: readonly string[],
): SocialSavePlan {
  // Every row still on screen that already exists in the database is KEPT —
  // whether or not it carries a URL. Anything the user dragged out of the
  // list is gone from `rows`, and that absence is the only delete signal.
  const kept = new Set(rows.filter((r) => !isNewRowId(r.id)).map((r) => r.id));

  return {
    writeIndexes: rows.map((_, i) => i),
    deleteIds: existingIds.filter((id) => !kept.has(id)),
    needsLink: rows.filter((r) => (r.url ?? '').trim().length === 0).length,
  };
}
