// EMAIL.DRIP.1 — know_what_works · day 5 · gate always · English.
// What Free shows on the Analytics page: views and clicks, 7 days with the
// 30-day figure beside each (src/pages/Analytics.tsx; the rest is Pro-gated).
// Per-short-link click counts live on the Short links page, which Free sees
// (src/pages/ShortLinks.tsx). {{free_short_links}} is facts.ts, pinned to
// ENTITLEMENTS.free.maxShortLinks.

import type { EmailTemplate } from "../render.ts";

export const knowWhatWorksEn: EmailTemplate = {
  subject: "See what your audience clicks",
  lines: [
    "Hi {{name}},",
    "Analytics, in your dashboard menu, shows how many people viewed your page and how many clicks your links got, for the last 7 and 30 days.",
    "To see where people come from, make a short link (titilinks.com/s/your-word) for each place you share, say one for Instagram and one for TikTok, each pointing to your page. Each short link shows its own click count under Short links in the menu. The Free plan includes {{free_short_links}} short links.",
    "One tip: put what you want people to do today at the top of your page.",
  ],
  button: { label: "Open my analytics", href: "analytics_url" },
};
