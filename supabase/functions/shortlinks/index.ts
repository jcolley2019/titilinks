import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateCode(length = 7): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Validate auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's auth context
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("JWT validation failed:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log("Authenticated user:", userId);

    // Parse and validate input
    const body = await req.json();
    const { pageId, destinationUrl, blockItemId } = body;

    if (!pageId || !isValidUuid(pageId)) {
      return new Response(
        JSON.stringify({ error: "Invalid pageId: must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!destinationUrl || !isValidUrl(destinationUrl)) {
      return new Response(
        JSON.stringify({ error: "Invalid destinationUrl: must be a valid http/https URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (blockItemId !== undefined && blockItemId !== null && !isValidUuid(blockItemId)) {
      return new Response(
        JSON.stringify({ error: "Invalid blockItemId: must be a valid UUID or null" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for existing short link with same (page_id, block_item_id, destination_url)
    let query = supabase
      .from("short_links")
      .select("code")
      .eq("page_id", pageId)
      .eq("destination_url", destinationUrl);

    if (blockItemId) {
      query = query.eq("block_item_id", blockItemId);
    } else {
      query = query.is("block_item_id", null);
    }

    const { data: existing, error: selectError } = await query.maybeSingle();

    if (selectError) {
      console.error("Error checking existing short link:", selectError);
      return new Response(
        JSON.stringify({ error: "Failed to check existing short links" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If exists, return existing code
    if (existing) {
      console.log("Found existing short link:", existing.code);
      return new Response(
        JSON.stringify({ code: existing.code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate new code with retry on collision (max 5 attempts)
    const maxAttempts = 5;
    let code: string | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateCode = generateCode(7);

      const { data: insertData, error: insertError } = await supabase
        .from("short_links")
        .insert({
          page_id: pageId,
          destination_url: destinationUrl,
          block_item_id: blockItemId || null,
          code: candidateCode,
        })
        .select("code")
        .single();

      if (!insertError) {
        code = insertData.code;
        console.log("Created short link:", code);
        break;
      }

      // Check if it's a unique constraint violation (code collision)
      if (insertError.code === "23505" && insertError.message?.includes("code")) {
        console.log(`Code collision on attempt ${attempt + 1}, retrying...`);
        continue;
      }

      // Check if it's an RLS policy violation (user doesn't own the page)
      if (insertError.code === "42501") {
        console.error("RLS policy violation - user does not own page:", pageId);
        return new Response(
          JSON.stringify({ error: "Forbidden: you do not own this page" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Other error
      console.error("Error inserting short link:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create short link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!code) {
      console.error("Failed to generate unique code after max attempts");
      return new Response(
        JSON.stringify({ error: "Failed to generate unique code, please try again" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ code }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
