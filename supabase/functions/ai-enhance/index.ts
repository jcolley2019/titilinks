import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnhanceRequest {
  base64: string;
  mediaType: string;
  // Legacy fields from old client — accepted but ignored. Crystal-upscaler
  // doesn't use a mode flag, and we always upscale at 2x for portraits.
  mode?: string;
  scale?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as EnhanceRequest;
    const { base64, mediaType } = body;

    console.log(`[ai-enhance] Request received: payload size=${base64?.length || 0} chars, media=${mediaType}`);

    if (!base64) {
      return new Response(
        JSON.stringify({ error: "Missing base64 image data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) {
      console.error("[ai-enhance] REPLICATE_API_TOKEN is not configured");
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_TOKEN env var is not set in Supabase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[ai-enhance] Calling philz1337x/crystal-upscaler (scale_factor=2)...");

    // Crystal-upscaler — portrait/face-optimized upscaler. Preserves natural
    // skin texture (no plastic GFPGAN look). Modern endpoint = no version hash
    // to maintain; Replicate always runs the latest version.
    const createResponse = await fetch(
      "https://api.replicate.com/v1/models/philz1337x/crystal-upscaler/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: {
            image: `data:${mediaType};base64,${base64}`,
            scale_factor: 2,
          },
        }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`[ai-enhance] Replicate API error: status=${createResponse.status}`, errorText);
      return new Response(
        JSON.stringify({
          error: `Replicate API ${createResponse.status}: ${errorText.slice(0, 300)}`
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let prediction = await createResponse.json();

    // Poll if Prefer: wait didn't complete
    if (prediction.status !== "succeeded" && prediction.status !== "failed") {
      const pollUrl = `https://api.replicate.com/v1/predictions/${prediction.id}`;
      const maxWait = 90_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollResponse = await fetch(pollUrl, {
          headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
        });
        prediction = await pollResponse.json();
        if (prediction.status === "succeeded" || prediction.status === "failed") break;
      }
    }

    if (prediction.status === "failed") {
      console.error("[ai-enhance] Replicate prediction failed:", prediction.error);
      return new Response(
        JSON.stringify({ error: `Replicate prediction failed: ${prediction.error || "unknown"}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (prediction.status !== "succeeded") {
      console.error("[ai-enhance] Replicate timeout, last status:", prediction.status);
      return new Response(
        JSON.stringify({ error: `Enhancement timed out (status: ${prediction.status})` }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Crystal-upscaler returns a single URL string in `output` (not an array).
    // Normalize: if it's an array, take the first element.
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    console.log("[ai-enhance] Success! Returning output URL");
    return new Response(
      JSON.stringify({ output: outputUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ai-enhance] Unhandled error:", msg);
    return new Response(
      JSON.stringify({ error: `Function exception: ${msg}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
