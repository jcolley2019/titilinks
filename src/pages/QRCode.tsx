import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { QrCode, Download, Copy, Check, Sun, Moon, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { toast } from 'sonner';

/** Brand palette (mirrors src/index.css --gold + planBadgeStyles warm-black). */
const WARM_BLACK = '#0e0c09';
const WARM_WHITE = '#F7F2E7';
const GOLD = '#C9A55C'; // brand gold — high contrast on warm-black
const GOLD_DEEP = '#9A751B'; // deeper gold — keeps ~4:1 contrast on white so the code still scans

type QRStyle = 'light' | 'dark';

/** Resolve the QR module (fg) + background colors for the chosen style + accent.
 *  Every combination stays above the ~3:1 contrast a scanner needs. */
function resolveColors(style: QRStyle, gold: boolean): { fg: string; bg: string } {
  if (style === 'dark') {
    return { fg: gold ? GOLD : WARM_WHITE, bg: WARM_BLACK };
  }
  return { fg: gold ? GOLD_DEEP : WARM_BLACK, bg: '#FFFFFF' };
}

const EXPORT_QR = 1024; // intrinsic QR resolution (px) — also the PNG/SVG export source

/** QR.1 — branded page QR code tool.
 *  Renders an on-brand, scannable QR for the account's single public page URL
 *  (this app has one handle per account; page1/page2 are in-page modes at the
 *  same URL, so there is no page selector to show). Exports the composed card
 *  (QR + wordmark + handle) as PNG (canvas) or SVG. */
export default function QRCodePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [handle, setHandle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [style, setStyle] = useState<QRStyle>('light');
  const [gold, setGold] = useState(false);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null); // hi-res preview + PNG source
  const svgWrapRef = useRef<HTMLDivElement>(null); // hidden QRCodeSVG source for SVG export

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data: page } = await supabase
        .from('pages')
        .select('handle')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      setHandle(page?.handle ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const publicUrl = handle ? `${window.location.origin}/${handle}` : null;
  const { fg, bg } = resolveColors(style, gold);

  const copyUrl = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success(t('qr.copiedToast'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('qr.copyFailed'));
    }
  }, [publicUrl, t]);

  /** Shared layout geometry for the exported branded card (PNG + SVG). */
  const layout = () => {
    const pad = 96;
    const gap = 44;
    const wordmarkSize = 64;
    const handleSize = 40;
    const textBlock = wordmarkSize + 24 + handleSize;
    const W = EXPORT_QR + pad * 2;
    const H = pad + EXPORT_QR + gap + textBlock + pad;
    const cx = W / 2;
    const wordmarkY = pad + EXPORT_QR + gap + wordmarkSize;
    const handleY = wordmarkY + 24 + handleSize;
    return { pad, W, H, cx, wordmarkSize, handleSize, wordmarkY, handleY };
  };

  const triggerDownload = (href: string, filename: string, revoke = false) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const downloadPng = () => {
    const src = canvasRef.current;
    if (!src || !handle) return;
    const { pad, W, H, cx, wordmarkSize, handleSize, wordmarkY, handleY } = layout();
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(src, pad, pad, EXPORT_QR, EXPORT_QR);
    ctx.textAlign = 'center';
    ctx.fillStyle = fg;
    ctx.font = `700 ${wordmarkSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText('TitiLinks', cx, wordmarkY);
    ctx.globalAlpha = 0.6;
    ctx.font = `400 ${handleSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText(`/${handle}`, cx, handleY);
    ctx.globalAlpha = 1;
    triggerDownload(out.toDataURL('image/png'), `titilinks-${handle}-qr.png`);
    toast.success(t('qr.downloadedToast'));
  };

  const downloadSvg = () => {
    const inner = svgWrapRef.current?.querySelector('svg');
    if (!inner || !handle) return;
    const viewBox = inner.getAttribute('viewBox') ?? `0 0 ${EXPORT_QR} ${EXPORT_QR}`;
    const qrInner = inner.innerHTML;
    const { pad, W, H, cx, wordmarkSize, handleSize, wordmarkY, handleY } = layout();
    const font = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <svg x="${pad}" y="${pad}" width="${EXPORT_QR}" height="${EXPORT_QR}" viewBox="${viewBox}">${qrInner}</svg>
  <text x="${cx}" y="${wordmarkY}" text-anchor="middle" font-family='${font}' font-weight="700" font-size="${wordmarkSize}" fill="${fg}">TitiLinks</text>
  <text x="${cx}" y="${handleY}" text-anchor="middle" font-family='${font}' font-weight="400" font-size="${handleSize}" fill="${fg}" fill-opacity="0.6">/${handle}</text>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    triggerDownload(URL.createObjectURL(blob), `titilinks-${handle}-qr.svg`, true);
    toast.success(t('qr.downloadedToast'));
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6 max-w-3xl"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <QrCode className="h-6 w-6 text-primary" />
            {t('qr.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('qr.subtitle')}</p>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ) : !publicUrl ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 px-6 text-center">
            <QrCode className="h-10 w-10 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground">{t('qr.noPageTitle')}</h2>
            <p className="text-muted-foreground mt-1 max-w-sm">{t('qr.noPageDesc')}</p>
            <Button asChild className="mt-5 gap-1">
              <Link to="/dashboard/editor">
                {t('qr.goToEditor')} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 sm:items-start">
            {/* Preview — the branded card that gets exported (WYSIWYG) */}
            <div className="flex justify-center">
              <div
                data-testid="qr-preview"
                className="flex flex-col items-center gap-4 rounded-2xl border border-border p-6 w-full max-w-[280px]"
                style={{ backgroundColor: bg }}
              >
                <QRCodeCanvas
                  ref={canvasRef}
                  value={publicUrl}
                  size={EXPORT_QR}
                  bgColor={bg}
                  fgColor={fg}
                  level="M"
                  marginSize={2}
                  className="h-auto w-full max-w-[220px]"
                />
                <div className="text-center leading-tight">
                  <div className="font-bold tracking-tight" style={{ color: fg }}>
                    TitiLinks
                  </div>
                  <div className="text-sm" style={{ color: fg, opacity: 0.6 }}>
                    /{handle}
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-5">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  {t('qr.yourPageUrl')}
                </Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground truncate">
                    {publicUrl}
                  </div>
                  <Button variant="outline" size="icon" onClick={copyUrl} aria-label={t('qr.copy')}>
                    {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground">{t('qr.style')}</Label>
                <ToggleGroup
                  type="single"
                  value={style}
                  onValueChange={(v) => v && setStyle(v as QRStyle)}
                  className="mt-1.5 justify-start"
                >
                  <ToggleGroupItem value="light" className="gap-1.5">
                    <Sun className="h-4 w-4" /> {t('qr.styleLight')}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="dark" className="gap-1.5">
                    <Moon className="h-4 w-4" /> {t('qr.styleDark')}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <Label htmlFor="qr-gold" className="text-sm font-medium text-foreground">
                    {t('qr.goldAccent')}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t('qr.goldAccentDesc')}</p>
                </div>
                <Switch id="qr-gold" checked={gold} onCheckedChange={setGold} />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={downloadPng} className="flex-1 gap-1.5">
                  <Download className="h-4 w-4" /> {t('qr.downloadPng')}
                </Button>
                <Button onClick={downloadSvg} variant="outline" className="flex-1 gap-1.5">
                  <Download className="h-4 w-4" /> {t('qr.downloadSvg')}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">{t('qr.scanHint')}</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Hidden SVG source for vector export (kept off-screen, not display:none so it renders) */}
      {publicUrl && (
        <div ref={svgWrapRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
          <QRCodeSVG value={publicUrl} size={EXPORT_QR} bgColor={bg} fgColor={fg} level="M" marginSize={2} />
        </div>
      )}
    </DashboardLayout>
  );
}
