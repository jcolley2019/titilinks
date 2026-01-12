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

async function pollExportJob(accessToken: string, jobId: string, maxAttempts = 30): Promise<string[]> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between polls

    const response = await fetch(`https://api.canva.com/rest/v1/exports/${jobId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Export job poll failed:", response.status, errorBody);
      throw new Error(`Export job poll failed: ${response.status}`);
    }

    const jobData = await response.json();
    console.log("Export job status:", jobData.job?.status);

    if (jobData.job?.status === "success") {
      // Return the download URLs
      return jobData.job.urls || [];
    } else if (jobData.job?.status === "failed") {
      throw new Error("Export job failed: " + (jobData.job?.error?.message || "Unknown error"));
    }
    // status is "in_progress" - continue polling
  }

  throw new Error("Export job timed out");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { design_id, format = "png", page_id } = body;

    if (!design_id) {
      return new Response(
        JSON.stringify({ error: "design_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Exporting Canva design:", { design_id, format });

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

    // Step 1: Create export job
    console.log("Creating export job for design:", design_id);
    const exportResponse = await fetch("https://api.canva.com/rest/v1/exports", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        design_id: design_id,
        format: {
          type: format,
        },
      }),
    });

    if (!exportResponse.ok) {
      const errorBody = await exportResponse.text();
      console.error("Canva export API error:", exportResponse.status, errorBody);
      
      if (exportResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: "Canva session expired", code: "TOKEN_EXPIRED" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to start export job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const exportData = await exportResponse.json();
    const jobId = exportData.job?.id;

    if (!jobId) {
      console.error("No job ID in export response:", exportData);
      return new Response(
        JSON.stringify({ error: "No export job ID received" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Export job created:", jobId);

    // Step 2: Poll for completion
    const downloadUrls = await pollExportJob(accessToken, jobId);

    if (!downloadUrls.length) {
      return new Response(
        JSON.stringify({ error: "No download URLs in export result" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Download the image and upload to Supabase storage
    const imageUrl = downloadUrls[0];
    console.log("Downloading exported image:", imageUrl);

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download exported image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const fileName = `canva-${design_id}-${Date.now()}.${format}`;
    const storagePath = `${user.id}/${fileName}`;

    console.log("Uploading to storage:", storagePath);

    const { error: uploadError } = await supabaseAdmin.storage
      .from("page-assets")
      .upload(storagePath, imageBlob, {
        contentType: `image/${format}`,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload image to storage" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("page-assets")
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl;

    console.log("Export complete, public URL:", publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        design_id: design_id,
        storage_path: storagePath,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in canva-export-design:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
