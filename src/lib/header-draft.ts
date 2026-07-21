// Shared shape for the Name & Handle hub's in-progress edits (TYPO.1e).
//
// Page-scoped counterpart to the block-scoped draftItem/draftTitle mirrors in
// Editor.tsx: those pin a draft to the block being edited, but these values
// live on the page itself (pages.display_name + theme_json.headerConfig +
// theme_json.typography), so there's no block id to key them by.
//
// Every field is optional and undefined means "no override" — the preview
// falls back to the saved value. Nothing here is persisted; the hub commits on
// Save and drops the draft on Cancel.
export interface HeaderDraft {
  displayName?: string;
  nameSize?: number;
  handleSize?: number;
  nameColor?: string;
  handleColor?: string;
  font?: string;
  textEffect?: {
    type: string;
    intensity?: number;
    width?: number;
    color?: string;
  };
  // HDR.SPACE.2 — live mirror of the hub's Spacing sliders. Same shape as the
  // persisted headerConfig.spacing; undefined keys fall back to the saved
  // values and then to the header constants.
  spacing?: {
    nameHandle?: number;
    handleIcons?: number;
    iconsContent?: number;
  };
}
