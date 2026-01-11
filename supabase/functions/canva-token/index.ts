import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CanvaConnection {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_at: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

async function refreshCanvaToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = Deno.env.get("CANVA_CLIENT_ID");
  const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Canva credentials not configured");
  }

  const response = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Token refresh failed:", response.status, errorBody);
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user client to get user ID
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("User auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Load canva_connections for user
    const { data: connection, error: fetchError } = await supabaseAdmin
      .from("canva_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching connection:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch Canva connection" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connection) {
      return new Response(
        JSON.stringify({ error: "No Canva connection found", code: "NOT_CONNECTED" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedConnection = connection as CanvaConnection;
    const expiresAt = new Date(typedConnection.expires_at);
    const now = new Date();
    const bufferMs = 60 * 1000; // 60 seconds buffer

    // Check if token is expired or about to expire
    if (expiresAt.getTime() - now.getTime() < bufferMs) {
      console.log("Token expired or expiring soon, refreshing for user:", user.id);

      try {
        const tokenData = await refreshCanvaToken(typedConnection.refresh_token);

        // Calculate new expires_at
        const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

        // Update the connection with new tokens
        const { error: updateError } = await supabaseAdmin
          .from("canva_connections")
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || typedConnection.refresh_token,
            expires_at: newExpiresAt,
            scope: tokenData.scope || typedConnection.scope,
          })
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Error updating tokens:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to update tokens" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("Token refreshed successfully");

        // Return the new access token (for server-side use only)
        return new Response(
          JSON.stringify({ 
            access_token: tokenData.access_token,
            expires_at: newExpiresAt,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (refreshError) {
        console.error("Token refresh error:", refreshError);
        
        // If refresh fails, the connection may be invalid
        return new Response(
          JSON.stringify({ 
            error: "Token refresh failed - please reconnect Canva",
            code: "REFRESH_FAILED" 
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Token is still valid
    console.log("Returning valid token for user:", user.id);
    return new Response(
      JSON.stringify({ 
        access_token: typedConnection.access_token,
        expires_at: typedConnection.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in canva-token:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
