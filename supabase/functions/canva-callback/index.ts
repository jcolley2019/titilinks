import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// App base URL for redirects back to frontend
const APP_BASE_URL = "https://titilinks.lovable.app";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    // Handle OAuth errors from Canva
    if (error) {
      console.error("Canva OAuth error:", error, errorDescription);
      const errorRedirect = `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent(errorDescription || error)}`;
      return new Response(null, {
        status: 302,
        headers: { Location: errorRedirect },
      });
    }

    if (!code || !state) {
      console.error("Missing code or state parameter");
      return new Response(null, {
        status: 302,
        headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=Missing+authorization+code` },
      });
    }

    // Create admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Look up pending auth by state
    const { data: pendingAuth, error: lookupError } = await supabaseAdmin
      .from("pending_canva_auth")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    if (lookupError || !pendingAuth) {
      console.error("State lookup failed:", lookupError);
      return new Response(null, {
        status: 302,
        headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=Invalid+or+expired+state` },
      });
    }

    // Check if expired
    if (new Date(pendingAuth.expires_at) < new Date()) {
      console.error("Pending auth expired");
      await supabaseAdmin.from("pending_canva_auth").delete().eq("id", pendingAuth.id);
      return new Response(null, {
        status: 302,
        headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=Session+expired` },
      });
    }

    const userId = pendingAuth.user_id;
    const codeVerifier = pendingAuth.code_verifier;

    // Get credentials
    const clientId = Deno.env.get("CANVA_CLIENT_ID");
    const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const redirectUri = Deno.env.get("CANVA_REDIRECT_URI") || `${supabaseUrl}/functions/v1/canva-callback`;

    if (!clientId || !clientSecret) {
      console.error("Missing Canva credentials");
      return new Response(null, {
        status: 302,
        headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=Canva+not+configured` },
      });
    }

    // Exchange authorization code for tokens
    console.log("Exchanging authorization code for tokens");
    const tokenResponse = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Token exchange failed:", tokenResponse.status, errorBody);
      
      // Check for MFA-related errors
      if (errorBody.toLowerCase().includes("mfa") || errorBody.toLowerCase().includes("multi-factor")) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=MFA+required` },
        });
      }
      
      return new Response(null, {
        status: 302,
        headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent("Token exchange failed")}` },
      });
    }

    const tokenData = await tokenResponse.json();
    console.log("Token exchange successful");

    // Calculate expires_at
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Upsert canva_connections
    const { error: upsertError } = await supabaseAdmin
      .from("canva_connections")
      .upsert({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || "",
        expires_at: expiresAt,
        scope: tokenData.scope || "",
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Error storing tokens:", upsertError);
      return new Response(null, {
        status: 302,
        headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent("Failed to store connection")}` },
      });
    }

    // Clean up pending auth
    await supabaseAdmin.from("pending_canva_auth").delete().eq("id", pendingAuth.id);

    console.log("Canva connection stored successfully for user:", userId);

    // Redirect to success
    return new Response(null, {
      status: 302,
      headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=connected` },
    });

  } catch (error: unknown) {
    console.error("Error in canva-callback:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(null, {
      status: 302,
      headers: { Location: `${APP_BASE_URL}/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent(message)}` },
    });
  }
});
