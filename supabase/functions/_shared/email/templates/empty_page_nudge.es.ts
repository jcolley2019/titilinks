// EMAIL.DRIP.1 — empty_page_nudge · día 14 · gate no_links_yet · español (neutro, de tú).
// El autocompletado es el unfurl de LinksEditor: llena título e imagen cuando
// el sitio los publica, por eso "casi siempre". Las respuestas llegan a
// support@titilinks.com.

import type { EmailTemplate } from "../render.ts";

export const emptyPageNudgeEs: EmailTemplate = {
  subject: "Tu página espera su primer link",
  lines: [
    "¡Hola, {{name}}!",
    "Agregar tu primer link toma un minuto: lo pegas y TitiLinks casi siempre completa el título y la imagen por ti.",
  ],
  button: { label: "Agregar mi primer link", href: "editor_url" },
  image: {
    file: "empty_page_nudge.es.png",
    alt: "El formulario de link nuevo en el editor de TitiLinks, en un teléfono, con el campo donde pegas tu link y el título debajo.",
  },
  closing: ["¿Necesitas ayuda? Responde a este correo y una persona te va a ayudar."],
};
