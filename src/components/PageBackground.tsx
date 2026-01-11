import React from "react";

type ThemeJson = {
  background?: {
    type?: "solid" | "gradient" | "image";
    solid_color?: string;        // e.g. "#111827"
    gradient_css?: string;       // e.g. "linear-gradient(...)"
    image_url?: string;          // public URL
    overlay_color?: string;      // e.g. "#000000"
    overlay_opacity?: number;    // 0..0.8
  };
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgbString(hex: string): string {
  // Returns "r g b" for use with CSS variables
  // Supports #RGB and #RRGGBB
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return `${r} ${g} ${b}`;
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `${r} ${g} ${b}`;
  }
  // fallback to black
  return `0 0 0`;
}

/**
 * PageBackground
 * - full-screen background (image/solid/gradient)
 * - configurable overlay tint
 * - bottom haze gradient to increase contrast behind buttons/text (Linktree-style)
 */
export function PageBackground({
  theme,
  children,
}: {
  theme?: ThemeJson | null;
  children: React.ReactNode;
}) {
  const bg = theme?.background ?? {};
  const bgType = bg.type ?? (bg.image_url ? "image" : "solid");

  const overlayHex = bg.overlay_color ?? "#000000";
  const overlayOpacity = clamp(bg.overlay_opacity ?? 0.35, 0, 0.8);
  const overlayRgb = hexToRgbString(overlayHex);

  // Background style (image/solid/gradient)
  const backgroundStyle: React.CSSProperties = (() => {
    if (bgType === "image" && bg.image_url) {
      return {
        backgroundImage: `url("${bg.image_url}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }
    if (bgType === "gradient" && bg.gradient_css) {
      return { backgroundImage: bg.gradient_css };
    }
    // solid
    return { backgroundColor: bg.solid_color ?? "#0b0f19" };
  })();

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden"
      style={
        {
          ...backgroundStyle,
          // CSS variables for overlays
          "--overlay-rgb": overlayRgb,
          "--overlay-opacity": overlayOpacity,
        } as React.CSSProperties
      }
    >
      {/* Global overlay tint (configurable color + opacity) */}
      <div className="pointer-events-none absolute inset-0 bg-[rgb(var(--overlay-rgb))] opacity-[var(--overlay-opacity)]" />

      {/* Bottom haze gradient overlay (Linktree-style readability) */}
      {/* You can tune the to-* opacity to match your preferred look */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/60" />

      {/* Optional subtle top vignette (helps header text readability) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black/20" />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
