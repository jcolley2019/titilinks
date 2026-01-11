import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateBioRequest {
  display_name: string;
  creator_type: string;
  tone: string;
  primary_offer_description?: string;
}

interface GenerateBioResponse {
  bio_short: string;
  bio_long: string;
}

const FALLBACK_BIOS: GenerateBioResponse = {
  bio_short: "Creator | Links below",
  bio_long: "Find my latest content, offers, and ways to connect.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { display_name, creator_type, tone, primary_offer_description } = 
      await req.json() as GenerateBioRequest;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify(FALLBACK_BIOS), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the prompt
    const toneDescriptions: Record<string, string> = {
      professional: "professional, polished, and business-focused",
      friendly: "warm, approachable, and conversational",
      bold: "confident, eye-catching, and energetic",
      minimal: "simple, clean, and understated",
      funny: "playful, witty, and humorous",
    };

    const creatorDescriptions: Record<string, string> = {
      streaming_tiktok: "content creator on TikTok and streaming platforms",
      gamer: "gaming content creator and streamer",
      fitness: "fitness coach and wellness influencer",
      musician: "musician and music artist",
      affiliate_marketer: "affiliate marketer and deal curator",
      adult_creator: "exclusive content creator",
    };

    const toneDesc = toneDescriptions[tone] || tone;
    const creatorDesc = creatorDescriptions[creator_type] || creator_type;

    const systemPrompt = `You are a copywriter specializing in social media bios for creators. 
Write bios that are authentic, engaging, and match the creator's style.
Never use hashtags. Keep it natural and human-sounding.
Do not use quotation marks in the output.`;

    const userPrompt = `Write two bio versions for ${display_name}, a ${creatorDesc}.

Style: ${toneDesc}
${primary_offer_description ? `They promote: ${primary_offer_description}` : ""}

Requirements:
1. bio_short: Maximum 90 characters. Punchy and memorable.
2. bio_long: Maximum 180 characters. More descriptive but still concise.

Both should reflect their personality and what they offer.`;

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
              name: "return_bios",
              description: "Return the generated bio variations",
              parameters: {
                type: "object",
                properties: {
                  bio_short: {
                    type: "string",
                    description: "Short bio, maximum 90 characters",
                  },
                  bio_long: {
                    type: "string",
                    description: "Longer bio, maximum 180 characters",
                  },
                },
                required: ["bio_short", "bio_long"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_bios" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("Rate limited by AI gateway");
        return new Response(JSON.stringify({ 
          ...FALLBACK_BIOS, 
          error: "Rate limit exceeded. Using default bio." 
        }), {
          status: 200, // Return 200 with fallback so UI still works
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        console.error("Payment required for AI gateway");
        return new Response(JSON.stringify({ 
          ...FALLBACK_BIOS, 
          error: "AI credits exhausted. Using default bio." 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify(FALLBACK_BIOS), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    
    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "return_bios") {
      console.error("Unexpected response format:", JSON.stringify(data));
      return new Response(JSON.stringify(FALLBACK_BIOS), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bios = JSON.parse(toolCall.function.arguments) as GenerateBioResponse;

    // Enforce character limits
    const result: GenerateBioResponse = {
      bio_short: bios.bio_short?.slice(0, 90) || FALLBACK_BIOS.bio_short,
      bio_long: bios.bio_long?.slice(0, 180) || FALLBACK_BIOS.bio_long,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-bio error:", error);
    return new Response(JSON.stringify(FALLBACK_BIOS), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
