// EMAIL.INFRA.1 — the pages GET and POST /u/<token> answer with.
//
// PURE (see layout.ts). Two states:
//   'confirm' — what GET returns. It writes NOTHING: mail scanners prefetch
//               every link in a message, so a GET that opted out would
//               unsubscribe readers who never clicked. One button POSTs the
//               form back to the same URL.
//   'done'    — what that button POST returns, after the opt-out is written.
// Neither page changes with whether the token matched a row, so they can never
// be used to test whether a token exists.

import type { Lang } from "./layout.ts";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The form field the confirm button submits. A POST that carries it came from
 * this page and gets the 'done' page back; every other POST — the RFC 8058
 * one-click body `List-Unsubscribe=One-Click` included — is the mailbox
 * provider's and gets the plain-text "ok".
 */
export const CONFIRM_FIELD = "confirm";

/** The first language the browser lists decides: es* → Spanish, anything else → English. */
export function pickLang(acceptLanguage: string | null | undefined): Lang {
  const first = (acceptLanguage ?? "").split(",")[0].trim().toLowerCase();
  return first === "es" || first.startsWith("es-") ? "es" : "en";
}

export type UnsubscribeState = "confirm" | "done";

const COPY: Record<
  Lang,
  {
    confirmTitle: string;
    confirmBody: string;
    button: string;
    title: string;
    body: string;
    note: string;
    errorTitle: string;
    errorBody: string;
  }
> = {
  en: {
    confirmTitle: "Unsubscribe from TitiLinks news?",
    confirmBody: "You will stop receiving TitiLinks news and tips at this address.",
    button: "Unsubscribe",
    title: "You're unsubscribed",
    body: "You will no longer receive TitiLinks news and tips at this address.",
    note: "Emails about your account, such as password resets and receipts, will still arrive.",
    errorTitle: "Something went wrong",
    errorBody: "We could not process your request. Please try the link again in a few minutes.",
  },
  es: {
    confirmTitle: "¿Cancelar tu suscripción a las novedades de TitiLinks?",
    confirmBody: "Dejarás de recibir novedades y consejos de TitiLinks en esta dirección.",
    button: "Cancelar suscripción",
    title: "Suscripción cancelada",
    body: "Ya no recibirás novedades ni consejos de TitiLinks en esta dirección.",
    note: "Los correos sobre tu cuenta, como el restablecimiento de contraseña y los recibos, seguirán llegando.",
    errorTitle: "Algo salió mal",
    errorBody: "No pudimos procesar tu solicitud. Vuelve a abrir el enlace en unos minutos.",
  },
};

/**
 * `ok` only matters for 'done': a failed write shows the error copy and never
 * claims success. The confirm form has no `action`, so it posts back to the
 * URL the reader is on — www.titilinks.com/u/<token> in prod, the dev proxy on
 * 8085 — which is the same route the one-click POST uses.
 */
export function unsubscribePage(lang: Lang, state: UnsubscribeState, ok = true): string {
  const c = COPY[lang];
  let title: string;
  let body: string;
  if (state === "confirm") {
    title = c.confirmTitle;
    body = `<p>${c.confirmBody}</p>
<form method="post">
<input type="hidden" name="${CONFIRM_FIELD}" value="1">
<button type="submit">${c.button}</button>
</form>
<p class="note">${c.note}</p>`;
  } else if (ok) {
    title = c.title;
    body = `<p>${c.body}</p>\n<p class="note">${c.note}</p>`;
  } else {
    title = c.errorTitle;
    body = `<p>${c.errorBody}</p>`;
  }
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · TitiLinks</title>
<style>
body{margin:0;padding:48px 16px;background:#f4f4f5;color:#111827;font-family:Arial,Helvetica,sans-serif;}
main{max-width:420px;margin:0 auto;background:#fff;border-radius:8px;padding:28px 24px;}
.brand{font-size:18px;font-weight:bold;margin:0 0 20px 0;}
h1{font-size:22px;margin:0 0 12px 0;}
p{font-size:16px;line-height:24px;margin:0 0 12px 0;}
.note{font-size:14px;line-height:20px;color:#6b7280;}
form{margin:20px 0;}
button{display:block;width:100%;padding:12px 16px;border:0;border-radius:999px;background:#111827;color:#fff;font:bold 16px Arial,Helvetica,sans-serif;cursor:pointer;}
button:focus-visible{outline:3px solid #6b7280;outline-offset:2px;}
</style>
</head>
<body>
<main>
<p class="brand">TitiLinks</p>
<h1>${title}</h1>
${body}
</main>
</body>
</html>`;
}
