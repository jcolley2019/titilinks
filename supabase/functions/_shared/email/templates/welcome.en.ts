// EMAIL.DRIP.1 — welcome · day 0 · gate always · English.
// Sent once onboarding has finished (email_queue_due holds it until the page is
// live). Tokens: see render.ts.

import type { EmailTemplate } from "../render.ts";

export const welcomeEn: EmailTemplate = {
  subject: "Your TitiLinks page is live",
  lines: [
    "Hi {{name}},",
    "Here's your link: {{page_url}}",
    "Three things to do first:",
  ],
  bullets: [
    "Add your first links. The sample links in your editor only show you the layout, and visitors never see them.",
    "Check that your photo and your name look right.",
    "Paste your link in your Instagram and TikTok bio.",
  ],
  button: { label: "Open my page editor", href: "editor_url" },
  image: {
    file: "welcome.en.png",
    alt: "A finished TitiLinks page on a phone: a photo at the top, the creator's name and handle, social icons, and link buttons below.",
  },
  closing: ["Questions? Just reply to this email."],
};
