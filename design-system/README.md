# TitiLinks Design System

> Dark‑luxury link‑in‑bio for creators. Gold on warm black — Playfair × DM Sans.

TitiLinks is a Linktree/Link.me‑style profile builder for creators. Visitors land on a creator's public page and see a stack of **blocks** (bio, social icons, featured links, gallery, shop, contact form, email capture, shouts & media). Creators drag, add, and remove blocks from an Edit Profile screen.

The visual identity is unapologetically **luxury**: warm‑black canvas (`#0e0c09`), antique‑gold accent (`#C9A55C`), Playfair Display italic for flourish, DM Sans for body, and soft gold glow for emphasis. It reads closer to a fragrance boutique than a typical creator tool — which is the point.

---

## Sources

- **Codebase** — `jcolley2019/titilinks` (Vite + React + TypeScript + Tailwind + Supabase). Key files read:
  - `src/components/LinkButton.tsx` — the link/button block being redesigned
  - `src/lib/theme-defaults.ts` — `ThemeButtons` + `BlockStyleConfig` contracts
  - `tailwind.config.ts` + `src/index.css` — color/type tokens
  - `src/components/BrandLogo.tsx` — the "Titi*Links*" wordmark
- **User uploads** — reference screenshots in `assets/reference/`:
  - `current-titilinks.png` — current TitiLinks profile (Titi / @titiacriz)
  - `linkme-*.jpeg` — four Link.me profiles we want to match in polish (Cata, Carla, Dahyn, Fafa)
  - `titi-editor-*.png`, `titi-dashboard.png`, `button-sizes-editor.png`, `video-profile.png` — editor flows

---

## Product context

There are two surfaces:

1. **Public profile** (the experience this system is centered on) — vertical mobile canvas, dark, stackable blocks. This is what fans see.
2. **Dashboard / editor** (light surfaces with a phone preview) — where the creator builds the page. Light mode, 3‑column on desktop, one‑column on mobile.

The design system ships **dark‑first** because the profile is where the brand actually lives.

---

## Content fundamentals

- **Voice is direct and creator‑first.** Second person ("your profile", "your links"), present tense, short.
- **Casing: Title Case on buttons and block titles**, sentence case for subtitles/descriptions.
- **Labels are small, uppercase, tracked** (`.label` — `letter-spacing: 0.15em`, gold). Used sparingly for section headers like "STAY UP TO DATE".
- **No exclamation marks** in UI chrome. Creators' own copy (bios, link titles) can be exuberant — the system quiets down around them.
- **Gold italic accent** is the one typographic "flourish" — Playfair italic in gold on a subheading word or phrase. Use at most one per screen.
- **Emoji**: allowed in creator content (bios, link titles — see Link.me Fafa example "💕", "🚀"). **Not used in chrome / system UI.**
- **Numbers and metrics** (follower counts, view counts) use DM Sans, no comma styling — "7.9M", "21276".

**Examples that feel on‑brand**
- "Shop My Collection" / "New arrivals every week"
- "Stay up to date"
- "Check out my website"
- "Collaborations & partnerships"

**Off‑brand (avoid)**
- "🎉 Welcome!!! Click here 👇"
- "CLICK NOW" (shouty, all caps outside of labels)
- "Amazing features you'll love" (marketing filler)

---

## Visual foundations

### Color
- Canvas is warm‑black (`#0e0c09`), never pure `#000`. Slight warmth keeps it from feeling electronic.
- Gold (`#C9A55C`) is used for: primary buttons, accent italics, focus rings, hairline dividers, section labels. Never for body copy on dark — readability drops.
- Text on dark is warm off‑white (`hsl(40 20% 90%)`); muted is warm gray (`hsl(35 10% 50%)`).
- The dashboard/editor uses a **light warm palette** (cream `hsl(30 10% 96%)` + warm charcoal) — documented as the secondary mode.

### Typography
- **Playfair Display** — headings, display numbers, italic accents. Semibold/bold only, tight tracking (`-0.02em`).
- **DM Sans** — body, buttons, labels. 400/500/600/700.
- **Label style** — DM Sans, 12px, 600, `letter-spacing: 0.15em`, uppercase, gold. The "luxury" tell.
- **Mono** — system mono, only for code or when a block's `font_style: 'mono'` is set.

### Backgrounds & texture
- **Solid warm black** is the default profile background.
- **Image backgrounds** get a `rgba(0,0,0,0.5)` overlay by default (auto‑contrast can boost to 0.35+ if the theme's `auto_contrast` flag is on — actually drops to 0.35 minimum).
- **Mesh gradients** — subtle gold radial washes used on landing/marketing pages (`mesh-gradient-hero`, `-soft`, `-rich` in `index.css`). Never on the profile page itself.
- **Noise overlay** — 3% opacity SVG fractal noise available via `.noise-overlay::before`. Used on hero surfaces to kill banding.
- **Gold glow** — `box-shadow: 0 0 60px -15px hsl(43 65% 55% / 0.3)` is the signature emphasis. Used on CTA buttons and the landing hero.
- **Shimmer orbs** — three animated radial gradients (8s alternate) on the landing page only. Not used in‑product.

### Corners
- **Pill** (`9999px`) — the default button shape in the Link.me aesthetic we're chasing.
- **Rounded** (`16px`) — cards, image blocks, the "rounded" button variant.
- **Square** (`6px`) — minimal / typographic variant, also the "square" button option.
- **Global card radius** (`var(--radius)` = `0.75rem` / 12px) — shadcn cards.

### Borders
- Hairline at `hsl(0 0% 100% / 0.06)` for card insets (top highlight, simulating brushed metal).
- Card borders at `--warm-black-4` (`hsl(30 10% 15%)`) on dark.
- Gold borders (`--gold-30`) reserved for focus/selected/outline variants.

### Shadows
- Never harsh. Defaults are soft and widespread (`0 4px 14px rgba(0,0,0,0.35)`).
- The signature emphasis is **gold glow**, not a black drop shadow, on dark.
- Cards often combine an **inner hairline highlight** (`inset 0 1px 0 rgba(255,255,255,0.06)`) with a soft outer shadow — creates the "polished" feel.

### Motion
- **Easing is `cubic-bezier(0.16, 1, 0.3, 1)`** — the "settle" curve, slightly bouncy at the end. Used for `slide-up-fade` (200ms) on block reveals.
- Hover on buttons: `-translate-y-[1px]` + `shadow-md`. Subtle lift.
- Press: `scale-[0.99]` for 100ms. Barely perceptible, just enough to feel tactile.
- `press` keyframe: `scale(1) → scale(0.98) → scale(1)` over 100ms for haptic‑feedback visuals.
- `motion-reduce` always disables both.

### Hover & press
- **Hover** — `translateY(-1px)` + upgraded shadow. Gold variants get a slightly brighter fill (light gold).
- **Press** — `scale(0.99)`. No color change. Optional haptic feedback on touch (`triggerHaptic('light')`).
- **Focus** — 2px ring in `var(--gold)` at 40% opacity (`ring-white/40` in current code → we want `ring-gold/40` in the redesign).

### Transparency & blur
- **Glass variant** — 15% fill opacity + `backdrop-filter: blur(12px) saturate(1.5)`. Used when the profile has an image background, so buttons feel like etched glass instead of flat plates.
- **Dashboard glass cards** — 50% card background + 24px blur + saturate 1.5. Desktop only.

### Layout
- **Profile canvas** — vertical, mobile‑first. Max‑width `430px` on desktop (centered with letterboxing). Top‑aligned header image, then avatar/name, then social row, then stacked blocks with **12–16px vertical gap**.
- **Block widths** — full width of the inner canvas (canvas padding `16px` → blocks are `canvas_width - 32`).
- **Block heights** — compact `48px`, normal `56px`, roomy `64px` (per `density` setting).
- Dashboard is **3 cols on ≥1024px**: left = profile preview / phone frame, center = block list, right = editor panel.

### Imagery
- Creator‑owned; we do not dictate a look. The system wraps imagery in warm black and gold, so the imagery itself sets the mood.
- Gallery thumbnails: `rounded-md` (`12px`) with a 1px `hsl(0 0% 100% / 0.08)` border.
- Avatars: circular, with optional 2px gold ring on hover.

---

## Iconography

See `ICONOGRAPHY.md` for the full rundown. Quick summary:

- The codebase uses **lucide-react** throughout (`@/components/ui/*` from shadcn, which imports Lucide). Stroke 2, outlined style.
- Social platform icons (Instagram, TikTok, X, YouTube, Snapchat, Facebook) appear on the profile in circular wells — in the current TitiLinks they're **monochrome outlined** on a dark circle, in Link.me they're **full‑color brand icons on white circles**. The redesign keeps the dark‑circle style to match the luxury canvas.
- No icon fonts. No emoji in chrome. Creators may embed emoji in their own link titles and bios.
- The brand wordmark is text‑only: `Titi` in foreground + `Links` in italic gold (`BrandLogo.tsx`).

---

## Index of this system

Root files:
- `README.md` — this file
- `ICONOGRAPHY.md` — icon approach + Lucide usage
- `SKILL.md` — Claude Code / Agent Skills entry point
- `colors_and_type.css` — all CSS vars + base type classes (import this into any artifact)

Folders:
- `assets/` — reference screenshots, placeholder.svg
- `assets/reference/` — uploaded references (Link.me profiles, editor screenshots)
- `preview/` — design‑system preview cards (swatches, specimens, tokens)
- `ui_kits/profile/` — the TitiLinks public profile UI kit (this is where the LinkButton variants live)

**Primary deliverable:** three LinkButton redesigns at `ui_kits/profile/LinkButtonVariants.jsx`, demoed in `ui_kits/profile/index.html`.

---

## Fonts

Both fonts are loaded from Google Fonts CDN — no self‑hosted `.ttf` needed. If you want to self‑host, flag the substitution:

- **Playfair Display** — Google Fonts, weights 400/500/600/700/800/900 + italics
- **DM Sans** — Google Fonts, weights 300/400/500/600/700 + italics

No substitution required — both are the production fonts per `src/index.css`.
