import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthedUser, serviceClient } from "../_shared/auth.ts";

const FN = "ai-crop";
const DAILY_LIMIT = 40;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // ~10MB decoded

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AiCropRequest {
  base64: string;
  mediaType: string;
}

interface FacePosition {
  faceTop: number;
  faceLeft: number;
  faceSize: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const user = await getAuthedUser(req);
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { base64, mediaType } = await req.json() as AiCropRequest;

    // Input cap: reject oversized images before spending an AI call.
    // base64 decodes to ~3/4 of its character length.
    if (typeof base64 === "string" && Math.floor((base64.length * 3) / 4) > MAX_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({ error: "Image too large (max ~10MB)" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Per-user daily quota (service role: RLS is owner-read only).
    const svc = serviceClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await svc
      .from("ai_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("fn", FN)
      .gte("created_at", oneDayAgo);
    if (countError) {
      console.error(`[${FN}] quota count failed:`, countError);
      // Non-blocking: allow the request (mirror shortlinks).
    } else if (count !== null && count >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ error: `Daily limit of ${DAILY_LIMIT} reached. Please try again tomorrow.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI crop not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: 'Analyze this photo. Detect the face position. Return ONLY a JSON object: {"faceTop": 0.2, "faceLeft": 0.5, "faceSize": 0.4} where faceTop is the face CENTER position from top (0=top, 1=bottom), faceLeft is face center from left (0=left, 1=right), faceSize is face height as fraction of image. For portrait/selfie photos the face is typically in upper half. Be precise about vertical position.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const facePosition = JSON.parse(clean) as FacePosition;

    // Record usage only on a successful AI dispatch.
    const { error: usageError } = await svc
      .from("ai_usage_events")
      .insert({ user_id: user.id, fn: FN });
    if (usageError) console.error(`[${FN}] usage insert failed:`, usageError);

    return new Response(JSON.stringify(facePosition), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-crop error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to analyze photo" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
