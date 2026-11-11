// EMAIL.DRIP.1 — pro_showcase · day 8 · gate still_free · English.
// Every bullet is a `features` line tied to the PlanEntitlements key that backs
// it; scripts/email-infra.test.mjs asserts each key is one Pro grants and Free
// does not, against ENTITLEMENTS itself. The price tokens are facts.ts, pinned
// to src/lib/pricing.ts. No urgency, no countdown.
//
// emailSubscribe is Pro-only too but is deliberately NOT here: the Email
// Capture block stores sign-ups in page_subscribers, and nothing in src/ reads
// that table back, so a creator cannot see or export the list yet.

import type { EmailTemplate } from "../render.ts";

export const proShowcaseEn: EmailTemplate = {
  subject: "What Pro adds to your page",
  lines: [
    "Hi {{name}},",
    "Here's what Pro adds to your page:",
  ],
  features: [
    { entitlement: "maxPages", text: "A second page your visitors can switch to." },
    { entitlement: "carousel", text: "A carousel: a swipeable row of link cards." },
    { entitlement: "linkAnimations", text: "Animations that make your buttons move, so the one that matters stands out." },
    { entitlement: "customFonts", text: "Your own fonts: upload your brand's font files and use them on your page." },
    { entitlement: "analyticsAdvanced", text: "Full analytics: your top destinations and where your visitors come from." },
  ],
  afterList: [
    "Pro is {{pro_month}} a month, or {{pro_year_total}} a year (that's {{pro_year_monthly}} a month).",
  ],
  button: { label: "See Pro", href: "upgrade_url" },
  image: {
    file: "pro_showcase.en.png",
    alt: "The Upgrade to Pro screen on a phone, with the price and the list of what Pro includes.",
  },
  closing: ["If the Free plan does everything you need, you don't have to do anything."],
};
