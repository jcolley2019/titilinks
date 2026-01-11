import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a random string for state/code_verifier
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map((v) => chars[v % chars.length])
    .join("");
}

// Generate code_challenge from code_verifier using SHA-256
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  
  // Base64url encode the hash
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse body to get redirect origin
    let redirectOrigin = "https://titilinks.lovable.app"; // Fallback
    try {
      const body = await req.json();
      if (body?.redirectOrigin) {
        redirectOrigin = body.redirectOrigin;
      }
    } catch {
      // No body or invalid JSON, use default
    }

    const clientId = Deno.env.get("CANVA_CLIENT_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const redirectUri = Deno.env.get("CANVA_REDIRECT_URI") || `${supabaseUrl}/functions/v1/canva-callback`;
    const scopes = Deno.env.get("CANVA_SCOPES") || "design:meta:read design:content:read";

    if (!clientId) {
      console.error("Missing CANVA_CLIENT_ID");
      return new Response(
        JSON.stringify({ error: "Canva integration not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - no auth header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("User auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Initiating Canva OAuth for user:", user.id);

    // Generate PKCE parameters
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store state and code_verifier in database (service role)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Clean up any existing pending auth for this user
    await supabaseAdmin
      .from("pending_canva_auth")
      .delete()
      .eq("user_id", user.id);

    // Insert new pending auth
    const { error: insertError } = await supabaseAdmin
      .from("pending_canva_auth")
      .insert({
        user_id: user.id,
        state: state,
        code_verifier: codeVerifier,
        redirect_origin: redirectOrigin,
      });

    if (insertError) {
      console.error("Error storing pending auth:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to initiate OAuth" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Canva OAuth authorize URL
    const authUrl = new URL("https://www.canva.com/api/oauth/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    console.log("Generated Canva OAuth URL");

    // Return JSON with authUrl (frontend will handle redirect)
    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in canva-connect:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
