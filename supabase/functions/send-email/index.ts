// EMAIL.INFRA.1 — drains email_queue through Resend.
//
// Called by pg_cron/pg_net every 10 minutes (see
// supabase/migrations/20261104120100_email_infra1_cron.sql) and by nothing
// else. Two factors, like reconcile-billing: the gateway's JWT check stays ON,
// and the function itself requires `x-email-cron-secret` to equal the
// EMAIL_CRON_SECRET secret. An unset secret fails CLOSED.
//
// One run:
//   1. email_queue_due(batch) — the database skips suppressed / gated rows and
//      LEASES what it returns (send_after moves 15 minutes out), so an
//      overlapping or crashed run can never send a row twice;
//   2. each row is rendered (_shared/email/render.ts) and POSTed to Resend with
//      an Idempotency-Key derived from the row id — a second belt on (1);
//   3. success → status 'sent' + resend_id. Failure → attempts + 1 and the row
//      stays 'pending' for the next lease; the third failure marks it 'failed'.
//      A 429 stops the batch and releases the rest without counting an attempt.
//
// EMAIL_DRY_RUN=1 — nothing is sent and nothing is consumed: each message is
// logged (row id, user id, template, subject, header names — never the address
// or the unsubscribe token) and its lease is released.
//
// EMAIL_POSTAL_ADDRESS (EMAIL.DRIP.1) — the physical mailing address every
// news email's footer carries. Unset, blank or still a {{…}} placeholder → no
// news email goes out: each leased news row records a failed attempt with
// reason `no_postal_address` (the usual three-attempt rule, so setting the
// secret within two runs rescues it). Transactional mail is not held back.
//
// Deploy — JWT verification STAYS ON:
//   npx supabase functions deploy send-email --project-ref ohmvlypcbrfkuudcuqub

import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/cors.ts";
import { buildMessage, toLang, type ResendMessage, type Stream } from "../_shared/email/render.ts";
import { resolvePostalAddress } from "../_shared/email/layout.ts";
import { constantTimeEquals } from "../_shared/email/svix.ts";

const RESEND_URL = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 3;
const DEFAULT_BATCH = 50;
const MAX_BATCH = 100;
/** Resend's default rate limit is 2 requests/second per team. */
const SEND_SPACING_MS = 550;

type Svc = ReturnType<typeof serviceClient>;

interface DueRow {
  id: number;
  user_id: string;
  email: string;
  template_key: string;
  lang: string | null;
  stream: string | null;
  attempts: number;
  unsubscribe_token: string | null;
  /** EMAIL.DRIP.1: the page's (else the profile's) display name. */
  display_name: string | null;
  /** EMAIL.DRIP.1: the page handle — the /<handle> URL the email links. */
  username: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Give a leased row back to the queue untouched (dry run, rate limit). */
async function release(svc: Svc, ids: number[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await svc
    .from("email_queue")
    .update({ send_after: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending");
  if (error) console.error("[send-email] release failed:", error.message);
}

/** Count a failed attempt; the third one is final. */
async function recordFailure(svc: Svc, row: DueRow, reason: string, final = false): Promise<"failed" | "pending"> {
  const attempts = row.attempts + 1;
  const status = final || attempts >= MAX_ATTEMPTS ? "failed" : "pending";
  const { error } = await svc
    .from("email_queue")
    .update({ attempts, status, last_error: reason.slice(0, 500) })
    .eq("id", row.id);
  if (error) console.error(`[send-email] could not record failure for ${row.id}:`, error.message);
  return status;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-email-cron-secret`,
      },
    });
  }
  if (req.method !== "POST") return fail("Method not allowed", 405);

  // The gate, before any read. Never echoes either value and never
  // distinguishes "unset" from "wrong".
  const secret = Deno.env.get("EMAIL_CRON_SECRET") ?? "";
  const presented = req.headers.get("x-email-cron-secret") ?? "";
  if (!secret || !presented || !constantTimeEquals(presented, secret)) {
    return fail("Unauthorized", 401);
  }

  const dryRun = Deno.env.get("EMAIL_DRY_RUN") === "1";
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  // Checked BEFORE the queue is leased, so a missing key consumes nothing.
  if (!dryRun && !apiKey) return fail("RESEND_API_KEY is not set", 500);
  const postalAddress = resolvePostalAddress(Deno.env.get("EMAIL_POSTAL_ADDRESS"));

  let batch = DEFAULT_BATCH;
  try {
    const body = await req.json();
    const requested = Number(body?.batch);
    if (Number.isFinite(requested)) batch = Math.min(Math.max(Math.trunc(requested), 1), MAX_BATCH);
  } catch {
    /* no body / not JSON — the default batch applies */
  }

  const svc = serviceClient();
  const { data, error } = await svc.rpc("email_queue_due", { p_limit: batch });
  if (error) {
    console.error("[send-email] email_queue_due failed:", error.message);
    return fail("Queue read failed", 500);
  }
  const rows = (data ?? []) as DueRow[];

  const summary = { due: rows.length, sent: 0, retry: 0, failed: 0, released: 0, dry_run: dryRun };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const stream: Stream = row.stream === "mail" ? "mail" : "news";

    // A news email never goes out with a blank or placeholder address.
    if (stream === "news" && !postalAddress) {
      if (dryRun) {
        console.log(
          "[send-email] DRY RUN — would refuse: no_postal_address",
          JSON.stringify({ queue_id: row.id, template_key: row.template_key }),
        );
        await release(svc, [row.id]);
        summary.released++;
        continue;
      }
      const status = await recordFailure(svc, row, "no_postal_address");
      summary[status === "failed" ? "failed" : "retry"]++;
      continue;
    }

    let message: ResendMessage;
    try {
      message = buildMessage({
        templateKey: row.template_key,
        lang: toLang(row.lang),
        stream,
        unsubscribeToken: row.unsubscribe_token,
        displayName: row.display_name,
        username: row.username,
        postalAddress,
        to: row.email,
      });
    } catch (e) {
      // Deterministic — retrying an unknown template cannot help.
      await recordFailure(svc, row, `render: ${e instanceof Error ? e.message : String(e)}`, true);
      summary.failed++;
      continue;
    }

    if (dryRun) {
      console.log(
        "[send-email] DRY RUN",
        JSON.stringify({
          queue_id: row.id,
          user_id: row.user_id,
          template_key: row.template_key,
          lang: toLang(row.lang),
          stream,
          from: message.from,
          subject: message.subject,
          headers: Object.keys(message.headers ?? {}),
        }),
      );
      await release(svc, [row.id]);
      summary.released++;
      continue;
    }

    if (i > 0) await sleep(SEND_SPACING_MS);

    let res: Response;
    try {
      res = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `email-queue-${row.id}`,
        },
        body: JSON.stringify(message),
      });
    } catch (e) {
      const status = await recordFailure(svc, row, `network: ${e instanceof Error ? e.message : String(e)}`);
      summary[status === "failed" ? "failed" : "retry"]++;
      continue;
    }

    if (res.status === 429) {
      // Rate limited: not this row's fault. Hand it and everything after it back.
      const rest = rows.slice(i).map((r) => r.id);
      await release(svc, rest);
      summary.released += rest.length;
      console.warn(`[send-email] Resend 429 — released ${rest.length} row(s)`);
      break;
    }

    const text = await res.text();
    if (!res.ok) {
      const status = await recordFailure(svc, row, `resend ${res.status}: ${text}`);
      summary[status === "failed" ? "failed" : "retry"]++;
      continue;
    }

    let resendId: string | null = null;
    try {
      resendId = JSON.parse(text)?.id ?? null;
    } catch {
      /* a 2xx with an unreadable body still went out */
    }
    const { error: markErr } = await svc
      .from("email_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        resend_id: resendId,
        attempts: row.attempts + 1,
        last_error: null,
      })
      .eq("id", row.id);
    // The email is out. If this write fails the lease expires and the row is
    // retried — the Idempotency-Key makes Resend answer that retry with the
    // original send instead of a second email.
    if (markErr) console.error(`[send-email] sent ${row.id} but could not mark it:`, markErr.message);
    summary.sent++;
  }

  return json(summary);
});
