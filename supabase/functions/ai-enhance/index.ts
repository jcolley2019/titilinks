import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnhanceRequest {
  base64: string;
  mediaType: string;
  mode: "upscale" | "face_restore";
  scale?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { base64, mediaType, mode, scale = 2 } = (await req.json()) as EnhanceRequest;

    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) {
      console.error("REPLICATE_API_TOKEN is not configured");
      return new Response(
        JSON.stringify({ error: "AI enhance not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create prediction using Replicate HTTP API
    // nightmareai/real-esrgan supports both upscaling and GFPGAN face enhancement
    const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",  // Replicate will hold connection until done (up to 60s)
      },
      body: JSON.stringify({
        version: "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa",
        input: {
          image: `data:${mediaType};base64,${base64}`,
          scale: Math.min(Math.max(scale, 2), 4),
          face_enhance: mode === "face_restore",
        },
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("Replicate API error:", createResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Enhancement failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let prediction = await createResponse.json();

    // If "Prefer: wait" didn't complete, poll for result
    if (prediction.status !== "succeeded" && prediction.status !== "failed") {
      const pollUrl = `https://api.replicate.com/v1/predictions/${prediction.id}`;
      const maxWait = 90_000; // 90 seconds max
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise((r) => setTimeout(r, 2000));

        const pollResponse = await fetch(pollUrl, {
          headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
        });
        prediction = await pollResponse.json();

        if (prediction.status === "succeeded" || prediction.status === "failed") {
          break;
        }
      }
    }

    if (prediction.status === "failed") {
      console.error("Replicate prediction failed:", prediction.error);
      return new Response(
        JSON.stringify({ error: prediction.error || "Enhancement failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (prediction.status !== "succeeded") {
      return new Response(
        JSON.stringify({ error: "Enhancement timed out" }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the enhanced image URL
    return new Response(
      JSON.stringify({ output: prediction.output }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ai-enhance error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to enhance photo" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
