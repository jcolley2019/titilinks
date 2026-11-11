// EMAIL.DRIP.1 — know_what_works · día 5 · gate always · español (neutro, de tú).
// Lo que muestra el plan Gratis en Analíticas: vistas y clics de 7 días con la
// cifra de 30 días al lado. Los clics de cada enlace corto están en la página
// Enlaces cortos. {{free_short_links}} viene de facts.ts.

import type { EmailTemplate } from "../render.ts";

export const knowWhatWorksEs: EmailTemplate = {
  subject: "Mira qué toca tu audiencia",
  lines: [
    "¡Hola, {{name}}!",
    "En Analíticas, en el menú de tu panel, ves cuántas personas vieron tu página y cuántos clics recibieron tus links en los últimos 7 y 30 días.",
    "Para saber de dónde llega tu gente, crea un enlace corto (titilinks.com/s/tu-palabra) para cada lugar donde compartes, por ejemplo uno para Instagram y otro para TikTok, y haz que todos lleven a tu página. Cada enlace corto muestra sus propios clics en Enlaces cortos, en el menú. El plan Gratis incluye {{free_short_links}} enlaces cortos.",
    "Un consejo: pon arriba de todo lo que quieres que la gente haga hoy.",
  ],
  button: { label: "Ver mis analíticas", href: "analytics_url" },
};
