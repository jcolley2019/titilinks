// EMAIL.DRIP.1 — empty_page_nudge · day 14 · gate no_links_yet · English.
// The autofill claim is LinksEditor's unfurl: pasting a URL fills the title and
// image when the site publishes them, hence "usually". Replies go to
// support@titilinks.com (REPLY_TO).

import type { EmailTemplate } from "../render.ts";

export const emptyPageNudgeEn: EmailTemplate = {
  subject: "Your page is waiting for its first link",
  lines: [
    "Hi {{name}},",
    "Adding your first link takes about a minute: paste it in, and TitiLinks usually fills in the title and picture for you.",
  ],
  button: { label: "Add my first link", href: "editor_url" },
  image: {
    file: "empty_page_nudge.en.png",
    alt: "The new-link form in the TitiLinks editor on a phone, with the box where you paste your link and the title below it.",
  },
  closing: ["Stuck? Reply to this email and a person will help."],
};
