/**
 * TL.HANDLE.2 — alternatives to offer when a wanted handle is taken.
 *
 * Pure: it only proposes candidates that pass validateHandle (format +
 * reserved, src/lib/handle-rules.ts). Availability is the caller's job — ask
 * for every candidate in ONE query (`pages.select('handle').in('handle', …)`)
 * and drop the ones that come back. Written UI-free so onboarding
 * (StepYourProfile) can adopt it as-is.
 *
 * Order: base1, base2, base-links, base-oficial, base-official, then base3,
 * base4, … until `count` valid candidates exist. The base is the lowercased
 * draft with trailing digits (and any hyphen they leave) stripped, so "titi7"
 * never yields "titi71". A long base is cut so base + suffix fits the 30-char
 * limit — cutting the whole candidate instead would drop the suffix and turn
 * every candidate into the same string.
 */

import { validateHandle } from './handle-rules';

const MAX_LEN = 30;
// Stop counting eventually: a base no suffix can rescue must not spin forever.
const MAX_N = 999;

const withSuffix = (base: string, suffix: string): string =>
  `${base.slice(0, MAX_LEN - suffix.length).replace(/-+$/, '')}${suffix}`;

export function suggestHandles(base: string, count = 3): string[] {
  const stem = base.trim().toLowerCase().replace(/\d+$/, '').replace(/-+$/, '');
  const out: string[] = [];
  const seen = new Set<string>();
  const offer = (suffix: string) => {
    const candidate = withSuffix(stem, suffix);
    if (seen.has(candidate)) return;
    seen.add(candidate);
    if (validateHandle(candidate) === null) out.push(candidate);
  };

  for (const suffix of ['1', '2', '-links', '-oficial', '-official']) {
    if (out.length >= count) return out;
    offer(suffix);
  }
  for (let n = 3; out.length < count && n <= MAX_N; n++) offer(String(n));
  return out.slice(0, count);
}
