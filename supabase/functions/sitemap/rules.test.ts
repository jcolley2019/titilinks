// Run: npx deno test supabase/functions/sitemap/rules.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isContentItem } from "./rules.ts";

const cases: { name: string; url: string | null; image_url: string | null; want: boolean }[] = [
  // Seeded placeholders (OnboardingFlow.tsx, tpl-presets.ts) — never content.
  { name: "empty url (preset / social seed)", url: "", image_url: null, want: false },
  { name: "null url, null image", url: null, image_url: null, want: false },
  { name: "whitespace url", url: "   ", image_url: null, want: false },
  { name: "'#' (email_subscribe seed)", url: "#", image_url: null, want: false },
  { name: "example.com", url: "https://example.com", image_url: null, want: false },
  { name: "example.com/blog", url: "https://example.com/blog", image_url: null, want: false },
  { name: "example.com/product-1", url: "https://example.com/product-1", image_url: null, want: false },
  { name: "sub.example.com", url: "https://sub.example.com/x", image_url: null, want: false },
  { name: "bare wa.me", url: "https://wa.me/", image_url: null, want: false },
  { name: "wa.me with text, no number", url: "https://wa.me/?text=Hola", image_url: null, want: false },
  {
    name: "wa.me preset seed",
    url: "https://wa.me/?text=Hola%2C%20quiero%20hacer%20un%20pedido",
    image_url: null,
    want: false,
  },
  { name: "bare api.whatsapp.com", url: "https://api.whatsapp.com/", image_url: null, want: false },
  { name: "empty image_url with empty url", url: "", image_url: "", want: false },
  { name: "whitespace image_url with empty url", url: "", image_url: "  ", want: false },
  { name: "unparseable url", url: "instagram.com/titi", image_url: null, want: false },
  // The editors' validateUrl only saves http(s) — mailto:/tel: are not accepted.
  { name: "mailto: (editor refuses it)", url: "mailto:titi@gmail.com", image_url: null, want: false },
  { name: "tel: (editor refuses it)", url: "tel:+573001234567", image_url: null, want: false },

  // Real content.
  { name: "instagram link", url: "https://instagram.com/titi", image_url: null, want: true },
  { name: "padded real link", url: "  https://instagram.com/titi  ", image_url: null, want: true },
  { name: "wa.me with number", url: "https://wa.me/573001234567", image_url: null, want: true },
  {
    name: "wa.me with number and text",
    url: "https://wa.me/573001234567?text=Hola",
    image_url: null,
    want: true,
  },
  { name: "not-example.com is not a placeholder", url: "https://notexample.com", image_url: null, want: true },
  {
    name: "real image, empty url",
    url: "",
    image_url: "https://ohmvlypcbrfkuudcuqub.supabase.co/storage/v1/object/public/gallery/a.jpg",
    want: true,
  },
  { name: "real image, placeholder url", url: "https://example.com", image_url: "https://cdn.x/a.jpg", want: true },
];

for (const c of cases) {
  Deno.test(`isContentItem: ${c.name} → ${c.want}`, () => {
    assertEquals(isContentItem({ url: c.url, image_url: c.image_url }), c.want);
  });
}
