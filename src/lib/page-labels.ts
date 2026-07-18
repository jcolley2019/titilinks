// ES.FIX.1 STEP 2 — the single home for the Page 1 / Page 2 fallback.
//
// Several surfaces render a page's label and fall back to a literal when the
// user has set no custom label: the two-page switcher pills (EditableProfileView)
// and the Analytics page (useAnalytics). Before this helper each site hard-coded
// the English 'Page 1' / 'Page 2', so a Spanish session saw English fallbacks.
//
// This resolves the fallback through t() using the existing 'editor.page1' /
// 'editor.page2' keys ('Page 1'/'Página 1', 'Page 2'/'Página 2'). A custom label
// the user typed is ALWAYS returned as-is — never translated.
export function pageLabel(
  customLabel: string | null | undefined,
  pageKey: 'page1' | 'page2',
  t: (key: string) => string,
): string {
  return customLabel || t(pageKey === 'page1' ? 'editor.page1' : 'editor.page2');
}
