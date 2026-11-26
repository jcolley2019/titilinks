// IMG.FIT.1 — paste a picture onto whatever editor is open (Ctrl+V / Cmd+V).
//
// One small hook for every editor that takes a picture: it listens for paste on
// the document while `enabled`, and hands the FIRST image file on the clipboard
// to `onImage`. The caller routes that file through the same prepare-and-upload
// path as a picked file. It knows nothing about what the picture is for.
//
// Text paste behaves exactly as without it: the hook only ever acts — and only
// then cancels the browser's default — when it takes an image. When the paste
// lands in a text field and the clipboard ALSO carries text (an office app
// copies a rendering of the text as an image beside it), the text wins and the
// hook stays out of the way.
import { useEffect, useRef } from 'react';

const isTextTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(el.type);
  }
  return false;
};

/** The first image file on a clipboard, or null. */
export function pastedImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const f of Array.from(data.files ?? [])) {
    if (f.type.startsWith('image/')) return f;
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

export function usePastedImage(enabled: boolean, onImage: (file: File) => void): void {
  // Latest callback without re-subscribing on every render.
  const handler = useRef(onImage);
  useEffect(() => { handler.current = onImage; });

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = pastedImageFile(e.clipboardData);
      if (!file) return;
      const hasText = Array.from(e.clipboardData?.types ?? []).includes('text/plain');
      if (hasText && isTextTarget(e.target)) return;
      e.preventDefault();
      handler.current(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enabled]);
}
