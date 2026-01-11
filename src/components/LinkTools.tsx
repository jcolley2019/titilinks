import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Link, Copy, Download, QrCode, Check, Loader2 } from "lucide-react";

interface LinkToolsProps {
  baseUrl: string;
  pageId: string;
  destinationUrl: string;
  blockItemId?: string;
}

export function LinkTools({ baseUrl, pageId, destinationUrl, blockItemId }: LinkToolsProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shortUrl = code ? `${baseUrl}/l/${code}` : null;
  const encodedShortUrl = shortUrl ? encodeURIComponent(shortUrl) : null;

  const qrPngUrl = encodedShortUrl
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr?url=${encodedShortUrl}&format=png&size=256`
    : null;

  const qrSvgUrl = encodedShortUrl
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr?url=${encodedShortUrl}&format=svg&size=256`
    : null;

  const handleCreateShortLink = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        toast({
          title: "Error",
          description: "You must be logged in to create short links",
          variant: "destructive",
        });
        return;
      }

      const response = await supabase.functions.invoke("shortlinks", {
        method: "POST",
        body: { pageId, destinationUrl, blockItemId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to create short link");
      }

      const result = response.data;
      if (result.error) {
        throw new Error(result.error);
      }

      setCode(result.code);
      toast({
        title: "Short link created",
        description: `Your short link is ready`,
      });
    } catch (error) {
      console.error("Error creating short link:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create short link",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      toast({
        title: "Copied",
        description: "Short URL copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (format: "png" | "svg") => {
    const url = format === "png" ? qrPngUrl : qrSvgUrl;
    if (!url || !code) return;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to download QR code");

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `qr-${code}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Downloaded",
        description: `QR code saved as ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Error",
        description: "Failed to download QR code",
        variant: "destructive",
      });
    }
  };

  if (!code) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleCreateShortLink}
        disabled={loading}
        className="gap-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link className="h-4 w-4" />
        )}
        Create Short Link
      </Button>
    );
  }

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
      <div className="flex items-center gap-2">
        <Link className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <code className="text-sm font-mono bg-background px-2 py-1 rounded border flex-1 truncate">
          {shortUrl}
        </code>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="h-8 w-8 flex-shrink-0"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="flex items-start gap-3">
        {qrPngUrl && (
          <div className="border rounded bg-white p-2">
            <img
              src={qrPngUrl}
              alt="QR Code"
              className="w-20 h-20"
              loading="lazy"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload("png")}
            className="gap-2 justify-start"
          >
            <Download className="h-4 w-4" />
            Download PNG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload("svg")}
            className="gap-2 justify-start"
          >
            <QrCode className="h-4 w-4" />
            Download SVG
          </Button>
        </div>
      </div>
    </div>
  );
}
