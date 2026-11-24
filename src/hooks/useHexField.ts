import { useState, type ChangeEvent } from 'react';
import { normalizeHexColor } from '@/lib/hex-color';

/**
 * FRAGILE.COLOR.1 — a typed hex field that can only ever store a valid colour.
 *
 * While the creator is typing, the text is theirs: every change that
 * normalises to a colour is committed (normalised), and a change that does not
 * is NOT committed — the stored colour stays as it was and `invalid` is true.
 * On blur, and whenever `stored` changes while the creator is not typing
 * (picker, eyedropper, preset, reset), the field shows the stored colour.
 *
 * "Typing" starts at the first change and ends at blur; a focused field the
 * creator has not typed into simply shows the stored colour.
 */
export function useHexField(stored: string, commit: (hex: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDraft(text);
    const hex = normalizeHexColor(text);
    if (hex !== null) commit(hex);
  };

  const onBlur = () => setDraft(null);

  return {
    value: editing ? draft : (stored ?? ''),
    onChange,
    onBlur,
    invalid: editing && normalizeHexColor(draft) === null,
  };
}
