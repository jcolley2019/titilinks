// EMAIL.INFRA.1 — Resend delivery feedback: bounces and complaints.
//
// Contract with Resend (Svix):
//   • signature verified over the RAW body (RESEND_WEBHOOK_SECRET) — a request
//     that fails it is a 401 and touches nothing;
//   • at-least-once delivery, so everything here is idempotent: the event row is
//     keyed on (resend_id, type) and the suppression stamps are only ever set
//     once;
//   • every verified event lands in email_events, whatever its type;
//   • email.bounced    → email_prefs.bounced_at
//     email.complained → email_prefs.complained_at AND marketing_opt_out = true
//   • a failed write is a 500 so Svix retries; an event we cannot tie to a user
//     is still recorded (user_id null) and acked.
//
// The user is resolved from the queue row that produced the email (resend_id);
// mail we did not queue — Supabase Auth email over Resend SMTP — falls back to
// the recipient address.
//
// Deploy (JWT verification MUST be off — Resend does not send a Supabase JWT):
//   npx supabase functions deploy resend-webhook --no-verify-jwt --project-ref ohmvlypcbrfkuudcuqub

import { serviceClient } from "../_shared/auth.ts";
import { verifySvixSignature } from "../_shared/email/svix.ts";

const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Svc = ReturnType<typeof serviceClient>;

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string };
}

async function resolveUser(
  svc: Svc,
  event: ResendEvent,
): Promise<{ userId: string | null; templateKey: string | null }> {
  const resendId = event.data?.email_id;
  if (resendId) {
    const { data, error } = await svc
      .from("email_queue")
      .select("user_id, template_key")
      .eq("resend_id", resendId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`queue lookup: ${error.message}`);
    if (data?.user_id) return { userId: data.user_id, templateKey: data.template_key };
  }

  const to = event.data?.to;
  const address = (Array.isArray(to) ? to[0] : to)?.trim().toLowerCase();
  if (address) {
    const { data, error } = await svc.from("profiles").select("id").eq("email", address).limit(1).maybeSingle();
    if (error) throw new Error(`profile lookup: ${error.message}`);
    if (data?.id) return { userId: data.id, templateKey: null };
  }
  return { userId: null, templateKey: null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const verdict = await verifySvixSignature(
    rawBody,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "",
  );
  if (!verdict.ok) {
    console.warn("[resend-webhook] rejected:", verdict.reason);
    return reply({ error: "Invalid signature" }, 401);
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }
  const type = typeof event.type === "string" ? event.type : "";
  if (!type) return reply({ error: "Missing type" }, 400);

  const svc = serviceClient();
  try {
    const { userId, templateKey } = await resolveUser(svc, event);

    const { error: eventErr } = await svc.from("email_events").upsert(
      {
        user_id: userId,
        resend_id: event.data?.email_id ?? null,
        type,
        template_key: templateKey,
        payload: event,
      },
      { onConflict: "resend_id,type", ignoreDuplicates: true },
    );
    if (eventErr) throw new Error(`event insert: ${eventErr.message}`);

    if (userId && (type === "email.bounced" || type === "email.complained")) {
      const now = new Date().toISOString();
      const column = type === "email.bounced" ? "bounced_at" : "complained_at";

      // Accounts older than EMAIL.INFRA.1 have no prefs row until they need one.
      const { error: ensureErr } = await svc
        .from("email_prefs")
        .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
      if (ensureErr) throw new Error(`prefs ensure: ${ensureErr.message}`);

      // First stamp wins — a redelivery does not move it.
      const { error: stampErr } = await svc
        .from("email_prefs")
        .update({ [column]: now, updated_at: now })
        .eq("user_id", userId)
        .is(column, null);
      if (stampErr) throw new Error(`prefs stamp: ${stampErr.message}`);

      if (type === "email.complained") {
        const { error: optErr } = await svc
          .from("email_prefs")
          .update({ marketing_opt_out: true, updated_at: now })
          .eq("user_id", userId)
          .eq("marketing_opt_out", false);
        if (optErr) throw new Error(`prefs opt-out: ${optErr.message}`);
      }
    }
  } catch (e) {
    console.error("[resend-webhook] failed:", e instanceof Error ? e.message : String(e));
    return reply({ error: "Processing failed" }, 500);
  }

  return reply({ received: true });
});
