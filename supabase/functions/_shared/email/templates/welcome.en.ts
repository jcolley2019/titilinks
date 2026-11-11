// EMAIL.INFRA.1 — welcome, English.
//
// ⚠️ DRAFT COPY — placeholder that proves the pipe end to end. Three lines, no
// feature claims. DRIP.1 replaces it with the real welcome.

import type { EmailTemplate } from "../render.ts";

export const DRAFT = true;

export const welcomeEn: EmailTemplate = {
  subject: "Welcome to TitiLinks",
  lines: [
    "Thanks for signing up for TitiLinks.",
    "Your page is waiting for you whenever you are ready.",
    "If you need anything, just reply to this email.",
  ],
};
