---
name: titilinks-design
description: Use this skill to generate well-branded interfaces and assets for TitiLinks, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference

- **Brand:** TitiLinks — dark-luxury link-in-bio for creators (Linktree / Link.me competitor).
- **Canvas:** warm black `#0e0c09` / `hsl(30 15% 6%)`. Never pure black.
- **Accent:** antique gold `#C9A55C` / `hsl(43 65% 55%)`.
- **Fonts:** Playfair Display (display / italic accents) + DM Sans (body / buttons). Both on Google Fonts.
- **Voice:** creator-first, second person, Title Case on buttons, sentence case on subtitles, no emoji in chrome.
- **Signature move:** gold italic Playfair word inside an otherwise neutral headline; soft gold glow (`0 0 60px -15px rgba(201,165,92,0.35)`) on the primary CTA.

## Files in this system

- `README.md` — product context, content fundamentals, visual foundations (read this first)
- `ICONOGRAPHY.md` — icon approach (Lucide)
- `colors_and_type.css` — all CSS variables + utility classes — import directly in any artifact
- `assets/reference/` — reference screenshots (current TitiLinks + Link.me benchmarks)
- `preview/` — design-system preview cards (registered in the Design System tab)
- `ui_kits/profile/` — the public profile UI kit, including the **3 LinkButton variants** that are the primary deliverable of this system

## When prototyping, start with

```html
<link rel="stylesheet" href="colors_and_type.css" />
<body class="bg-warm-black">
  <!-- your content, defaults to Playfair for h1-h3, DM Sans for body, gold accent -->
</body>
```
