// EMAIL.DRIP.1 — editor_tour · day 2 · gate always · English.
// Labels as the app shows them: the gold "Edit Profile" button opens the block
// menu (DashboardLayout / EditorStage); "Style" holds the Template Gallery and
// Customize Profile (fonts, background, text colors); the hero's pencil
// re-crops the current photo, its camera picks a new one (EditableProfileView).

import type { EmailTemplate } from "../render.ts";

export const editorTourEn: EmailTemplate = {
  subject: "Make your page yours",
  lines: [
    "Hi {{name}},",
    "Here's what each part of your editor does:",
  ],
  bullets: [
    "Blocks: links, products, a photo gallery, events and video feeds. Add them with the Edit Profile button at the top of your editor.",
    "Order: drag a block to move it. What's at the top gets seen first.",
    "Style: pick a template, then change your fonts, background and colors.",
    "Your photo: tap the pencil on it to re-crop it, or the camera to choose a new one.",
  ],
  button: { label: "Edit my page", href: "editor_url" },
};
