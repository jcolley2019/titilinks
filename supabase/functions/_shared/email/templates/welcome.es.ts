// EMAIL.INFRA.1 — welcome, Spanish.
//
// ⚠️ DRAFT COPY — placeholder that proves the pipe end to end. Three lines, no
// feature claims. DRIP.1 replaces it with the real welcome.

import type { EmailTemplate } from "../render.ts";

export const DRAFT = true;

export const welcomeEs: EmailTemplate = {
  subject: "Te damos la bienvenida a TitiLinks",
  lines: [
    "Gracias por registrarte en TitiLinks.",
    "Tu página te espera cuando quieras.",
    "Si necesitas algo, responde a este correo.",
  ],
};
