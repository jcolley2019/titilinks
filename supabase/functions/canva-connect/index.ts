import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("CANVA_CLIENT_ID");
    const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      console.error("Missing Canva credentials");
      return new Response(
        JSON.stringify({ error: "Canva integration not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user from the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a state parameter for CSRF protection
    const state = crypto.randomUUID();
    
    // Store state in session or return it for client to manage
    // For simplicity, we'll encode user ID in state
    const statePayload = btoa(JSON.stringify({ userId: user.id, nonce: state }));

    // Canva OAuth authorization URL
    const redirectUri = "https://titilinks.lovable.app/api/canva/callback";
    const scopes = ["design:meta:read", "design:content:read"];
    
    const authUrl = new URL("https://www.canva.com/api/oauth/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("state", statePayload);

    console.log("Generated Canva OAuth URL for user:", user.id);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString(), state: statePayload }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
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
