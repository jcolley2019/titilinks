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
  const bufferMs = 60 * 1000;

  if (expiresAt.getTime() - now.getTime() < bufferMs) {
    console.log("Token expired, refreshing for user:", userId);
    const tokenData = await refreshCanvaToken(connection.refresh_token);
    const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    await supabaseAdmin
      .from("canva_connections")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || connection.refresh_token,
        expires_at: newExpiresAt,
        scope: tokenData.scope || connection.scope,
      } as Record<string, unknown>)
      .eq("user_id", userId);

    return tokenData.access_token;
  }

  return connection.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse query params
    const url = new URL(req.url);
    const query = url.searchParams.get("query") || "";
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const continuation = url.searchParams.get("continuation") || "";

    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: connection, error: fetchError } = await supabaseAdmin
      .from("canva_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !connection) {
      return new Response(
        JSON.stringify({ error: "No Canva connection found", code: "NOT_CONNECTED" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedConnection = connection as CanvaConnection;
    const accessToken = await getValidAccessToken(supabaseAdmin, user.id, typedConnection);

    // Build Canva API URL
    const canvaUrl = new URL("https://api.canva.com/rest/v1/designs");
    if (query) canvaUrl.searchParams.set("query", query);
    canvaUrl.searchParams.set("limit", limit.toString());
    canvaUrl.searchParams.set("sort_by", "modified_descending");
    canvaUrl.searchParams.set("ownership", "owned");
    if (continuation) canvaUrl.searchParams.set("continuation", continuation);

    console.log("Fetching designs from Canva:", canvaUrl.toString());

    const canvaResponse = await fetch(canvaUrl.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!canvaResponse.ok) {
      const errorBody = await canvaResponse.text();
      console.error("Canva API error:", canvaResponse.status, errorBody);
      
      if (canvaResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: "Canva session expired", code: "TOKEN_EXPIRED" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to fetch designs from Canva" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const designsData = await canvaResponse.json();
    console.log("Fetched", designsData.items?.length || 0, "designs");

    // Transform response for frontend
    const designs = (designsData.items || []).map((design: {
      id: string;
      title?: string;
      thumbnail?: { url?: string };
      urls?: { edit_url?: string; view_url?: string };
      created_at?: string;
      updated_at?: string;
    }) => ({
      id: design.id,
      title: design.title || "Untitled",
      thumbnail_url: design.thumbnail?.url || null,
      edit_url: design.urls?.edit_url || null,
      view_url: design.urls?.view_url || null,
      created_at: design.created_at,
      updated_at: design.updated_at,
    }));

    return new Response(
      JSON.stringify({
        designs,
        continuation: designsData.continuation || null,
        has_more: !!designsData.continuation,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in canva-list-designs:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
