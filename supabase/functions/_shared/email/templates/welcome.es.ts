// EMAIL.DRIP.1 — welcome · día 0 · gate always · español (neutro, de tú).
// Se envía cuando el onboarding terminó (email_queue_due lo retiene hasta que
// la página existe). Tokens: ver render.ts.

import type { EmailTemplate } from "../render.ts";

export const welcomeEs: EmailTemplate = {
  subject: "Tu página de TitiLinks ya está lista",
  lines: [
    "¡Hola, {{name}}!",
    "Este es tu link: {{page_url}}",
    "Tres cosas para empezar:",
  ],
  bullets: [
    "Agrega tus primeros links. Los de muestra que ves en el editor solo están ahí de ejemplo, y tus visitantes no los ven.",
    "Revisa que tu foto y tu nombre se vean bien.",
    "Pega tu link en la bio de Instagram y de TikTok.",
  ],
  button: { label: "Abrir mi editor", href: "editor_url" },
  closing: ["¿Tienes dudas? Responde a este correo."],
};
