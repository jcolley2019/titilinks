import { useCallback, useRef, useState } from 'react';

/**
 * TL.EDIT.DIRTY.1 — the one "is there anything to save?" implementation every
 * editor panel shares (extracted from TL.PROD.ADD.3 / TL.LINKS.ADD.1).
 *
 * `keyOf` serialises every persisted field of `current`; the baseline is that
 * key as loaded / last saved, and `isDirty` is simply `key !== baseline`, so
 * editing a value back to its saved value goes clean again.
 *
 * The baseline starts as the key of the FIRST render's value. An editor that
 * loads asynchronously calls `markClean(loaded)` once the load lands; after a
 * successful save it calls `markClean(saved)`. Pass the value explicitly when
 * the matching setState has not rendered yet — with no argument the latest
 * RENDERED value is used.
 */
export function useDirtyBaseline<T>(current: T, keyOf: (t: T) => string) {
  const key = keyOf(current);
  const [baseline, setBaseline] = useState(key);
  const latestRef = useRef(current);
  latestRef.current = current;
  const keyOfRef = useRef(keyOf);
  keyOfRef.current = keyOf;

  const markClean = useCallback((...next: [] | [T]) => {
    setBaseline(keyOfRef.current(next.length ? (next[0] as T) : latestRef.current));
  }, []) as (next?: T) => void;

  return { isDirty: key !== baseline, markClean };
}
