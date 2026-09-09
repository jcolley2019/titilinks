import * as React from "react";

// TL.ONB.STAGE.2 — "is this a desktop-width viewport?", matching Tailwind's `lg`.
// Same shape as use-mobile.tsx, with one deliberate difference: the initial
// state READS matchMedia synchronously instead of starting undefined, because
// this hook picks which whole layout renders. Starting false would paint the
// mobile wizard for one frame on every desktop load.
const LG_BREAKPOINT = 1024;
const LG_QUERY = `(min-width: ${LG_BREAKPOINT}px)`;

export function useIsLgUp() {
  const [isLgUp, setIsLgUp] = React.useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(LG_QUERY).matches;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(LG_QUERY);
    const onChange = () => setIsLgUp(mql.matches);
    mql.addEventListener("change", onChange);
    setIsLgUp(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isLgUp;
}
