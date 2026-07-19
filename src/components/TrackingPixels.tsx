import { useEffect } from 'react';
import { safePixelId } from '@/lib/tracking-pixels';

/**
 * PIXELS.1 — injects the creator's Meta / TikTok / GA4 base pixels into the
 * document head.
 *
 * THE FENCE: this component is rendered ONLY by PublicProfile.tsx (the real
 * `/:handle` route). It must never be mounted by the editor, the dashboard, or
 * DP.2's visitor-preview frame. Visitor preview shares EditableProfileView's
 * view branch (editMode=false) but is reached through the Editor route, which
 * never mounts PublicProfile — so keying injection to this component keys it to
 * the public route, not to editMode. See the fence spec in
 * tests/16-tracking-pixels.spec.ts.
 *
 * Each pixel fires its BASE page-view event only (Meta PageView / TikTok page /
 * GA4 config). Link-tap → pixel-event tracking is out of scope (PIXELS.2).
 *
 * Every ID is run through `safePixelId` before it touches an inline <script>,
 * so only a strict charset can reach the DOM — a pixel ID can never break out
 * of its string literal.
 */
export interface TrackingPixelsProps {
  metaPixelId?: string | null;
  tiktokPixelId?: string | null;
  ga4Id?: string | null;
}

export function TrackingPixels({ metaPixelId, tiktokPixelId, ga4Id }: TrackingPixelsProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const meta = safePixelId('meta', metaPixelId);
    const tiktok = safePixelId('tiktok', tiktokPixelId);
    const ga4 = safePixelId('ga4', ga4Id);
    if (!meta && !tiktok && !ga4) return;

    // Nodes we own — removed on unmount so a client-side route change away from
    // the public page leaves no injected tags behind (the fence's cleanup half).
    const nodes: HTMLScriptElement[] = [];
    const addScript = (
      attrs: Record<string, string>,
      opts: { text?: string; src?: string } = {},
    ) => {
      const el = document.createElement('script');
      el.async = true;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      if (opts.src) el.src = opts.src;
      if (opts.text) el.text = opts.text;
      document.head.appendChild(el);
      nodes.push(el);
    };

    // ── Meta Pixel — standard fbevents bootstrap + PageView. ──
    if (meta) {
      addScript(
        { 'data-pixel': 'meta', 'data-pixel-id': meta },
        {
          text:
            `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
            `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
            `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
            `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
            `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
            `fbq('init','${meta}');fbq('track','PageView');`,
        },
      );
    }

    // ── TikTok Pixel — official events.js bootstrap + page(). ──
    if (tiktok) {
      addScript(
        { 'data-pixel': 'tiktok', 'data-pixel-id': tiktok },
        {
          text:
            `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];` +
            `ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];` +
            `ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};` +
            `for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);` +
            `ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};` +
            `ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{},n=document.createElement("script"),n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};` +
            `ttq.load('${tiktok}');ttq.page();}(window,document,'ttq');`,
        },
      );
    }

    // ── GA4 — gtag.js loader + config. ──
    if (ga4) {
      addScript(
        { 'data-pixel': 'ga4', 'data-pixel-id': ga4 },
        { src: `https://www.googletagmanager.com/gtag/js?id=${ga4}` },
      );
      addScript(
        { 'data-pixel': 'ga4-config', 'data-pixel-id': ga4 },
        {
          text:
            `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
            `gtag('js',new Date());gtag('config','${ga4}');`,
        },
      );
    }

    return () => {
      for (const n of nodes) n.parentNode?.removeChild(n);
    };
  }, [metaPixelId, tiktokPixelId, ga4Id]);

  return null;
}
