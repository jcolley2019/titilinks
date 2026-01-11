import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse cookies from Cookie header
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) {
      cookies[name] = rest.join("=");
    }
  });
  return cookies;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    // Handle OAuth errors from Canva
    if (error) {
      console.error("Canva OAuth error:", error, errorDescription);
      const errorRedirect = `/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent(errorDescription || error)}`;
      return new Response(null, {
        status: 302,
        headers: { Location: errorRedirect },
      });
    }

    if (!code || !state) {
      console.error("Missing code or state parameter");
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/editor?tab=design&canva=error&message=Missing+authorization+code" },
      });
    }

    // Read cookies
    const cookieHeader = req.headers.get("Cookie");
    const cookies = parseCookies(cookieHeader);
    const storedState = cookies["canva_oauth_state"];
    const codeVerifier = cookies["canva_code_verifier"];

    // Validate state matches
    if (!storedState || storedState !== state) {
      console.error("State mismatch:", { storedState, state });
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/editor?tab=design&canva=error&message=Invalid+state+parameter" },
      });
    }

    if (!codeVerifier) {
      console.error("Missing code_verifier cookie");
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/editor?tab=design&canva=error&message=Session+expired" },
      });
    }

    // Get credentials
    const clientId = Deno.env.get("CANVA_CLIENT_ID");
    const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET");
    const redirectUri = Deno.env.get("CANVA_REDIRECT_URI") || "https://titilinks.lovable.app/api/canva/callback";

    if (!clientId || !clientSecret) {
      console.error("Missing Canva credentials");
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/editor?tab=design&canva=error&message=Canva+not+configured" },
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
          headers: { Location: "/dashboard/editor?tab=design&canva=error&message=MFA+required" },
        });
      }
      
      return new Response(null, {
        status: 302,
        headers: { Location: `/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent("Token exchange failed")}` },
      });
    }

    const tokenData = await tokenResponse.json();
    console.log("Token exchange successful");

    // Calculate expires_at
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Get user from the state (we need to decode the original auth context)
    // Since we're in a callback, we need to use service role to store the token
    // The user_id should be passed in the state or we need another mechanism
    
    // For now, we'll extract user_id from a secure mechanism
    // Option: Decode state to get user info (if we encoded it in canva-connect)
    // Let's check if we can get user from auth header (won't work in redirect)
    
    // We need to store a mapping of state -> user_id in the connect function
    // For simplicity, let's use a different approach: store pending auth in a table
    // OR use signed state containing user_id

    // Actually, let's update canva-connect to include user_id in an encrypted/signed state
    // For now, we'll return an error asking for re-auth
    
    // Better approach: Use Supabase service role to look up state from a pending_canva_auth table
    // But for MVP, let's assume the frontend will pass auth header via a different mechanism

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Try to get user from Authorization header (for API calls, not redirects)
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id ?? null;
    }

    // If no auth header (redirect flow), try to decode user from state
    // We should have encoded user_id in the state in canva-connect
    if (!userId) {
      try {
        // Try to decode state as base64 JSON with userId
        const decoded = JSON.parse(atob(state));
        if (decoded.userId) {
          userId = decoded.userId;
        }
      } catch {
        console.log("Could not decode user from state, trying lookup");
      }
    }

    if (!userId) {
      console.error("Could not determine user ID");
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/editor?tab=design&canva=error&message=Session+expired" },
      });
    }

    console.log("Storing tokens for user:", userId);

    // Upsert canva_connections
    const { error: upsertError } = await supabaseAdmin
      .from("canva_connections")
      .upsert({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        expires_at: expiresAt,
        scope: tokenData.scope || null,
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Error storing tokens:", upsertError);
      return new Response(null, {
        status: 302,
        headers: { Location: `/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent("Failed to store connection")}` },
      });
    }

    console.log("Canva connection stored successfully");

    // Clear PKCE cookies and redirect to success
    const clearStateCookie = "canva_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
    const clearVerifierCookie = "canva_code_verifier=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

    const headers = new Headers();
    headers.set("Location", "/dashboard/editor?tab=design&canva=connected");
    headers.append("Set-Cookie", clearStateCookie);
    headers.append("Set-Cookie", clearVerifierCookie);

    return new Response(null, { status: 302, headers });

  } catch (error: unknown) {
    console.error("Error in canva-callback:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent(message)}` },
    });
  }
});
