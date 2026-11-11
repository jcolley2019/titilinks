// EMAIL.DRIP.1 — pro_showcase · día 8 · gate still_free · español (neutro, de tú).
// Cada viñeta es una línea de `features` atada a su clave de PlanEntitlements
// (ver pro_showcase.en.ts; mismas claves, mismo orden). Precio en US$ para que
// no se lea como pesos.

import type { EmailTemplate } from "../render.ts";

export const proShowcaseEs: EmailTemplate = {
  subject: "Lo que Pro le suma a tu página",
  lines: [
    "¡Hola, {{name}}!",
    "Esto es lo que Pro le suma a tu página:",
  ],
  features: [
    { entitlement: "maxPages", text: "Una segunda página: tus visitantes pueden pasar de una a otra." },
    { entitlement: "carousel", text: "Un carrusel: una fila deslizable de tarjetas con tus links." },
    { entitlement: "linkAnimations", text: "Animaciones en tus botones, para que el más importante se note." },
    { entitlement: "customFonts", text: "Tus propias fuentes: sube los archivos de fuente de tu marca y úsalos en tu página." },
    { entitlement: "analyticsAdvanced", text: "Analíticas completas: tus destinos principales y de dónde llegan tus visitantes." },
  ],
  afterList: [
    "Pro cuesta US{{pro_month}} al mes, o US{{pro_year_total}} al año (US{{pro_year_monthly}} al mes).",
  ],
  button: { label: "Ver Pro", href: "upgrade_url" },
  image: {
    file: "pro_showcase.es.png",
    alt: "La pantalla Mejora a Pro en un teléfono, con el precio y la lista de lo que incluye Pro.",
  },
  closing: ["Si con el plan Gratis tienes todo lo que necesitas, no tienes que hacer nada."],
};
