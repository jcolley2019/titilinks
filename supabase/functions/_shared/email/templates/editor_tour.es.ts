// EMAIL.DRIP.1 — editor_tour · día 2 · gate always · español (neutro, de tú).
// Etiquetas tal como las muestra la app: el botón dorado "Editar perfil" abre
// el menú de bloques; "Estilo" tiene la Galería de plantillas y "Personaliza tu
// perfil" (fuentes, fondo y colores de texto); en la foto, el lápiz la vuelve a
// recortar y la cámara elige otra.

import type { EmailTemplate } from "../render.ts";

export const editorTourEs: EmailTemplate = {
  subject: "Haz tuya tu página",
  lines: [
    "¡Hola, {{name}}!",
    "Esto es lo que hace cada parte de tu editor:",
  ],
  bullets: [
    "Bloques: links, productos, galería de fotos, eventos y feeds de video. Los agregas con el botón Editar perfil, arriba en tu editor.",
    "Orden: arrastra un bloque para moverlo. Lo que está arriba es lo primero que se ve.",
    "Estilo: elige una plantilla y después cambia las fuentes, el fondo y los colores.",
    "Tu foto: toca el lápiz para recortarla de nuevo o la cámara para elegir otra.",
  ],
  button: { label: "Editar mi página", href: "editor_url" },
};
