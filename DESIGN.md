# Design

## Theme

Dark, cinematic, luxurious. A near-black warm canvas with gold as the single hero
color. Physical scene: a visitor opens a creator's link from a phone in a dim room
at night; the page should feel like a backstage pass, black velvet under brass
light. Dark is the identity, not a default. The app ships a light mode for the
editor and dashboard; the marketing landing is always dark.

## Color

Strategy: **Committed**. Gold carries the identity on near-black. One accent, used
with restraint so it reads as luxury rather than decoration.

Tokens (HSL, existing brand):

- Background / warm-black: `hsl(30 15% 6%)` (approx #0e0c09)
- Surface / card: `hsl(30 12% 10%)`
- Foreground / off-white: `hsl(40 20% 90%)`
- Muted text: `hsl(35 10% 50%)`
- **Gold (primary accent)**: `hsl(43 65% 55%)` (approx #C9A55C)
- Gold light: `hsl(43 60% 70%)`
- Gold dark: `hsl(43 70% 40%)`
- Border: `hsl(30 10% 15%)`

Rules:

- Body copy is off-white, never gold (contrast). Gold is for CTAs, key accent
  words, the phone's link buttons, and hairline dividers.
- Banned on the new landing (current slop tells): gradient-clip text,
  gradient-filled buttons, glow orbs, stacked mesh-gradient plus noise, Sparkles
  badges, floating stat chips. Gold is a solid fill or a thin glow only.

## Typography

- Display: **Playfair Display** (committed brand serif). Headings and the oversized
  hero word. Use for confident scale, not italic-drop-cap editorial affectation.
- Body: **DM Sans**. All body copy, labels, UI.
- Mono: `ui-monospace` stack. Rare; handle / URL only.
- Scale: fluid `clamp()`, at least a 1.25 ratio between steps. Hero display goes
  large (roughly `clamp(3rem, 8vw, 6rem)`). Light-on-dark text gets +0.05 to 0.1
  line-height.
- Labels: uppercase, letter-spacing 0.15em, DM Sans 600, gold (existing
  `.section-label`).

## Components

- **Phone mockup** (hero centerpiece): the existing 290x586 frame in
  `HeroSection.tsx`. Keep the frame, upgrade the screen to a real styled TitiLinks
  page, and add micro-motion (in-screen scroll / tap, soft gold glow). Echo the
  product's real `LinkButton` velvet vocabulary so the mockup matches the app.
- **CTA**: solid gold fill, near-black text, no gradient. Velvet hover
  (`translateY(-1px)`) on the existing `--ease-out`.
- **Handle claimer**: `titilinks.com/[ you ]` inline pill with a gold hairline
  border.
- The velvet link/card system (`.lb-velvet` in `index.css`) is the product's real
  component language; echo it on the landing so the marketing matches the app.

## Layout

- Mobile-first; visitors arrive from social bios on phones.
- Hero is asymmetric: copy plus handle-claimer on one side, the phone on the other.
  Avoid the centered icon-title-subtitle stack.
- Fluid spacing with `clamp()`; one dominant idea per fold.
- Container max around 1200px with generous vertical rhythm.

## Motion

- Library: framer-motion (already a dependency). Tokens: `--ease-out:
  cubic-bezier(0.16, 1, 0.3, 1)`, `--dur-fast 100ms`, `--dur-med 200ms`.
- Cinematic means slow, exponential ease-out, no bounce or elastic. Staggered hero
  entrance. The phone gets a subtle float, an in-screen scroll / tap loop, and a
  soft gold glow pulse.
- Honor `prefers-reduced-motion`: all loops freeze to a static, fully-composed
  frame.
- Never animate layout properties; use transform and opacity.
