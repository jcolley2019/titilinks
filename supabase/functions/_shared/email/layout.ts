// EMAIL.INFRA.1 — the one bilingual shell every TitiLinks email is wrapped in.
//
// PURE: strings in, strings out. No Deno, DOM or Node APIs — it runs in the
// send-email edge function and, for the guard chain, under tsx
// (scripts/email-infra.test.mjs).
//
// Plain HTML on purpose: one 600px table, inline styles, a text wordmark (no
// image to block or host). The footer carries the physical postal address and,
// on the `news` stream ONLY, the unsubscribe line. Transactional (`mail`) email
// has no unsubscribe link: it is not marketing and must not be opt-out-able.
//
// EMAIL.DRIP.1: the address is EMAIL_POSTAL_ADDRESS from the function
// environment, passed in by the caller (this module never reads the
// environment). A news email cannot be built without a real one — see
// resolvePostalAddress() and renderEmail(). A mail email with none simply
// leaves it out of the footer.

export type Lang = "en" | "es";
export type Stream = "mail" | "news";

/**
 * The literal the footer carried before DRIP.1. It must never reach an inbox:
 * resolvePostalAddress() rejects it (and anything else still holding a
 * {{…}} marker).
 */
export const POSTAL_ADDRESS_PLACEHOLDER = "{{POSTAL_ADDRESS}}";

export const SITE = "https://www.titilinks.com";

/**
 * The configured postal address, or null when there is none to use: unset,
 * blank, or still a template placeholder.
 */
export function resolvePostalAddress(raw: string | null | undefined): string | null {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  if (value.includes("{{") || value.includes("}}")) return null;
  return value;
}

const FOOTER: Record<Lang, { sentBy: string; unsubscribe: string; unsubscribeLink: string }> = {
  en: {
    sentBy: "Sent by TitiLinks",
    unsubscribe: "Don't want these emails?",
    unsubscribeLink: "Unsubscribe",
  },
  es: {
    sentBy: "Enviado por TitiLinks",
    unsubscribe: "¿No quieres recibir estos correos?",
    unsubscribeLink: "Cancelar suscripción",
  },
};

/** Escape & < > " ' for text and double-quoted attribute values. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The one primary button. A table cell carries the colour so clients that drop
 * padding on links (Outlook) still show a button. `data-role="button"` lets the
 * unit test count buttons; mail clients ignore it.
 */
export function buttonHtml(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
<tr><td style="border-radius:999px;background:#111827;">
<a data-role="button" href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
</td></tr>
</table>`;
}

export interface LayoutInput {
  lang: Lang;
  stream: Stream;
  /** Used as <title> and as the hidden preheader. Plain text. */
  subject: string;
  /** Already-escaped body markup. */
  bodyHtml: string;
  /** Required for `news`; ignored for `mail`. */
  unsubscribeUrl?: string;
  /** From resolvePostalAddress(). Required for `news` (renderEmail enforces it). */
  postalAddress?: string | null;
}

export function layoutHtml(input: LayoutInput): string {
  const f = FOOTER[input.lang];
  const address = input.postalAddress ? ` · ${escapeHtml(input.postalAddress)}` : "";
  const unsubscribe =
    input.stream === "news" && input.unsubscribeUrl
      ? `<br>${escapeHtml(f.unsubscribe)} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(f.unsubscribeLink)}</a>`
      : "";

  return `<!doctype html>
<html lang="${input.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;">
<tr><td style="padding:28px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#111827;">TitiLinks</td></tr>
<tr><td style="padding:8px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#111827;">
${input.bodyHtml}
</td></tr>
<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
${escapeHtml(f.sentBy)}${address}${unsubscribe}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The text/plain alternative of the same shell. */
export function layoutText(input: Omit<LayoutInput, "bodyHtml" | "subject"> & { bodyText: string }): string {
  const f = FOOTER[input.lang];
  const address = input.postalAddress ? ` · ${input.postalAddress}` : "";
  const lines = [input.bodyText, "", "--", `${f.sentBy}${address}`];
  if (input.stream === "news" && input.unsubscribeUrl) {
    lines.push(`${f.unsubscribeLink}: ${input.unsubscribeUrl}`);
  }
  return lines.join("\n");
}
