import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brand_description, audience, goal } = await req.json();

    if (!brand_description || !audience || !goal) {
      return new Response(
        JSON.stringify({ error: "brand_description, audience, and goal are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt =
      "You are a conversion copywriter helping content creators set up their biolink page. Based on the brand info provided, generate 3 CTA button options and 1 bio. Return ONLY valid JSON, no markdown, no explanation.";

    const userPrompt = `Brand: ${brand_description}. Audience: ${audience}. Goal: ${goal}. Generate exactly this JSON structure: { "ctas": [{"label": string, "subtitle": string}, {"label": string, "subtitle": string}, {"label": string, "subtitle": string}], "bio": string }. Labels max 40 chars. Subtitles max 60 chars. Bio max 150 chars. Make them punchy, specific to the brand, and action-oriented.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_suggestions",
              description: "Return CTA suggestions and a bio for the creator's biolink page",
              parameters: {
                type: "object",
                properties: {
                  ctas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", description: "CTA button label, max 40 chars" },
                        subtitle: { type: "string", description: "CTA subtitle, max 60 chars" },
                      },
                      required: ["label", "subtitle"],
                      additionalProperties: false,
                    },
                    minItems: 3,
                    maxItems: 3,
                  },
                  bio: { type: "string", description: "Short bio, max 150 chars" },
                },
                required: ["ctas", "bio"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_suggestions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate suggestions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "return_suggestions") {
      console.error("Unexpected response format:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Unexpected AI response format" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Enforce character limits
    if (result.ctas) {
      result.ctas = result.ctas.slice(0, 3).map((cta: { label: string; subtitle: string }) => ({
        label: cta.label?.slice(0, 40) || "",
        subtitle: cta.subtitle?.slice(0, 60) || "",
      }));
    }
    if (result.bio) {
      result.bio = result.bio.slice(0, 150);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("suggest-onboarding-content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
