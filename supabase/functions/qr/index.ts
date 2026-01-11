import QRCode from "https://esm.sh/qrcode@1.5.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow GET
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get("url");
    const format = url.searchParams.get("format") || "png";
    const sizeParam = url.searchParams.get("size");

    // Validate URL parameter
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidUrl(targetUrl)) {
      return new Response(
        JSON.stringify({ error: "Invalid url: must be a valid http/https URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate format
    if (format !== "png" && format !== "svg") {
      return new Response(
        JSON.stringify({ error: "Invalid format: must be 'png' or 'svg'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and parse size
    let size = 256;
    if (sizeParam) {
      const parsedSize = parseInt(sizeParam, 10);
      if (isNaN(parsedSize) || parsedSize < 128 || parsedSize > 1024) {
        return new Response(
          JSON.stringify({ error: "Invalid size: must be an integer between 128 and 1024" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      size = parsedSize;
    }

    console.log(`Generating QR code: url=${targetUrl}, format=${format}, size=${size}`);

    const cacheHeaders = {
      ...corsHeaders,
      "Cache-Control": "public, max-age=3600",
    };

    if (format === "svg") {
      // Generate SVG
      const svgString = await QRCode.toString(targetUrl, {
        type: "svg",
        width: size,
        margin: 2,
      });

      return new Response(svgString, {
        status: 200,
        headers: {
          ...cacheHeaders,
          "Content-Type": "image/svg+xml",
        },
      });
    } else {
      // Generate PNG as data URL, then convert to binary
      const dataUrl = await QRCode.toDataURL(targetUrl, {
        width: size,
        margin: 2,
        type: "image/png",
      });

      // Extract base64 data from data URL
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

      return new Response(binaryData, {
        status: 200,
        headers: {
          ...cacheHeaders,
          "Content-Type": "image/png",
        },
      });
    }
  } catch (error) {
    console.error("QR generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate QR code" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
