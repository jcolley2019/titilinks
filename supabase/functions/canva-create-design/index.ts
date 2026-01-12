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

// deno-lint-ignore no-explicit-any
async function getValidAccessToken(
  supabaseAdmin: any,
  userId: string,
  connection: CanvaConnection
): Promise<string> {
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();
  const bufferMs = 60 * 1000; // 60 seconds buffer

  // Check if token is expired or about to expire
  if (expiresAt.getTime() - now.getTime() < bufferMs) {
    console.log("Token expired or expiring soon, refreshing for user:", userId);

    const tokenData = await refreshCanvaToken(connection.refresh_token);

    // Calculate new expires_at
    const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Update the connection with new tokens
    const updateData = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || connection.refresh_token,
      expires_at: newExpiresAt,
      scope: tokenData.scope || connection.scope,
    };
    
    await supabaseAdmin
      .from("canva_connections")
      .update(updateData as Record<string, unknown>)
      .eq("user_id", userId);

    console.log("Token refreshed successfully");
    return tokenData.access_token;
  }

  return connection.access_token;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const body = await req.json();
    const { width = 1200, height = 400, title = "Header Image" } = body;

    console.log("Creating Canva design:", { width, height, title });

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

    // Check if scope includes design:content:write
    if (!typedConnection.scope.includes("design:content:write")) {
      console.log("Missing design:content:write scope. Current scopes:", typedConnection.scope);
      return new Response(
        JSON.stringify({ 
          error: "Missing required permissions. Please reconnect Canva to grant design creation permission.",
          code: "MISSING_SCOPE" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get valid access token (refreshing if needed)
    const accessToken = await getValidAccessToken(supabaseAdmin, user.id, typedConnection);

    // Create design via Canva API
    console.log("Creating design via Canva API");
    const canvaResponse = await fetch("https://api.canva.com/rest/v1/designs", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        design_type: {
          type: "custom",
          width: width,
          height: height,
        },
        title: title,
      }),
    });

    if (!canvaResponse.ok) {
      const errorBody = await canvaResponse.text();
      console.error("Canva API error:", canvaResponse.status, errorBody);
      
      // Check for specific error types
      if (canvaResponse.status === 401) {
        return new Response(
          JSON.stringify({ 
            error: "Canva session expired. Please reconnect Canva.",
            code: "TOKEN_EXPIRED" 
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (canvaResponse.status === 403) {
        return new Response(
          JSON.stringify({ 
            error: "Missing permissions. Please reconnect Canva to grant design creation permission.",
            code: "FORBIDDEN" 
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to create design in Canva" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const designData = await canvaResponse.json();
    console.log("Design created successfully:", designData.design?.id);

    // Return the design info including the edit URL
    return new Response(
      JSON.stringify({
        design_id: designData.design?.id,
        edit_url: designData.design?.urls?.edit_url,
        view_url: designData.design?.urls?.view_url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in canva-create-design:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
