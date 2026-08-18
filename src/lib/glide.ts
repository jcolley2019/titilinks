// The auto-scroll "glide" shared by every moving strip on the page — the Gallery
// filmstrip, the Carousel, and the Product Cards filmstrip. One scale and one
// formula live here so that "medium" means the same speed wherever a creator
// picks it, and so a re-tune is one number in one file rather than three.
//
// TL.GAL.4 / 4b / 4c / 6 — every tier glides 65% slower than it used to. 0.75 at
// the first gate, 0.65 at the second, 0.55 once the speed chips were actually
// saving and Joey could judge a tier he had really selected, and 0.35 hand-tuned
// against the live strip. TL.MOTION.1 brought the other two blocks onto the same
// number. Specs 43 (gallery) and 45 (carousel + products) pin it from the other
// side, with bands narrow enough to reject every earlier value.
//
// The rate is one TILE per `speedMs`, so the obvious way to slow it down would be
// to raise the three speedMs tiers. This factor does it instead, for two reasons:
// those three numbers are the stored contract with the slow/medium/fast chips,
// and the tile fraction has to keep meaning "one tile" or the wrap arithmetic in
// each loop stops reading as arithmetic. One factor across the whole formula
// scales all three tiers by the same amount, so fast > medium > slow comes
// through untouched.
export const FILMSTRIP_GLIDE_SCALE = 0.35;

/**
 * Pixels per second for one gliding strip: one tile per `speedMs`, scaled.
 *
 * `tileFrac` is the tile's share of the strip width, and must match the tile's
 * own width class or the glide stops meaning "one tile per speedMs": the gallery
 * and product filmstrips are `w-[72%]`, the carousel is `w-[78%]` big /
 * `w-[44%]` small.
 *
 * A CALLER'S NOTE, paid for twice (TL.GAL.4, then TL.MOTION.1): feed this into a
 * position you keep in a float. `el.scrollLeft` ROUNDS TO AN INTEGER on write
 * (measured: setting 0.5 reads back 1), so a loop that re-reads it every frame
 * quantises the whole glide — a step under half a pixel rounds away to nothing
 * and the strip freezes, and any step over it rounds up to a flat 1px/frame,
 * ~60px/s on every tier. That is how three different speeds ran at one wrong
 * speed. Accumulate here, write there.
 */
export function glidePxPerSec(clientWidth: number, tileFrac: number, speedMs: number): number {
  return (clientWidth * tileFrac * FILMSTRIP_GLIDE_SCALE * 1000) / speedMs;
}
