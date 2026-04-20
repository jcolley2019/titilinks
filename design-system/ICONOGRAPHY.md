# Iconography

## System
TitiLinks uses **[lucide-react](https://lucide.dev/)** (v0.462.0 in the codebase — bundled via shadcn/ui). All glyphs in the product chrome (dashboard sidebar, editor panels, block menus, toggles) are Lucide.

- Stroke width: `2` (Lucide default)
- Size: `16–20px` in dense UI, `24px` on prominent actions, `32px` as block "left slot" icons.
- Color: inherits `currentColor`. On dark profile chrome, icons default to `var(--fg)` (off‑white). Accent icons use `var(--gold)`.

Drop in from CDN for prototypes:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js"></script>
```

or, more commonly in our HTML artifacts, reference by inline SVG with stroke‑2, lucide's 24×24 viewBox.

## Social platform icons
The profile page shows a row of circular social buttons (Instagram, TikTok, YouTube, X, Snapchat, Facebook, Link.me). Two patterns exist in the reference set:

1. **TitiLinks current** (`assets/reference/current-titilinks.png`) — dark circles (`rgba(255,255,255,0.08)` fill, 44px) with **monochrome white line icons** inside. Quiet, cohesive with the luxury canvas. **This is the preferred treatment.**
2. **Link.me style** (see Fafa reference) — full‑color brand icons on **white circles**. Lively, social‑first. We do not adopt this; it clashes with the warm‑black canvas.

For platform marks that aren't in Lucide (TikTok, Snapchat, X's new mark), use [Simple Icons](https://simpleicons.org/) — inline SVG, always monochrome `currentColor`, then tint `var(--fg)` on the dark profile.

## Emoji
- **Not used in system UI / chrome.** No 🎉 buttons, no 🔥 headers.
- **Allowed in creator‑authored content** — bio, link titles, subtitles. The Link.me references ("7.9M followers", "Together We Are Stronger! 🚀") make this clear.
- Render with Apple Color Emoji / Noto Color Emoji — no need to bundle.

## Unicode glyphs as icons
Sparingly. We use:
- `✓` for verified badges (but prefer a Lucide `BadgeCheck` filled blue/gold)
- `→` arrow in link copy — avoid, use `lucide:ArrowRight` for consistency
- `·` middot as separator in metadata

## Logos
- **Brand wordmark** — text‑only, rendered via `BrandLogo.tsx`:
  ```html
  <span>Titi<span class="italic" style="color: var(--gold)">Links</span></span>
  ```
  Always Playfair Display for italics, foreground color for the non‑italic half. There is no separate mark/favicon in the imported codebase beyond a small `favicon.png` (a single‑letter mark we do not have source for).

- **No separate icon logo** exists. If needed for a small format, use `T` in Playfair italic on gold, in a warm‑black rounded square.

## Placeholder asset
`assets/placeholder.svg` — the shadcn default placeholder used by `<ThumbnailImage>` when a link has no image. Neutral gray SVG, safe on both modes.
