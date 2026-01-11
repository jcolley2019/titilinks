import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Enums, Json } from '@/integrations/supabase/types';

type ModeType = Enums<'mode_type'>;
type EventType = Enums<'event_type'>;

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget event tracking using beacon or fetch with keepalive.
 * Does NOT block navigation or wait for response.
 */
function sendBeaconEvent(
  pageId: string,
  mode: ModeType,
  eventType: EventType,
  metadata: Json
) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase config for beacon');
    return;
  }

  const url = `${supabaseUrl}/rest/v1/events`;
  const body = JSON.stringify({
    page_id: pageId,
    mode: mode,
    event_type: eventType,
    metadata_json: metadata,
  });

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Prefer': 'return=minimal',
  };

  // Try sendBeacon first (best for navigation scenarios)
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    // sendBeacon doesn't support custom headers, so use fetch with keepalive instead
  }

  // Use fetch with keepalive - works during page unload/navigation
  try {
    fetch(url, {
      method: 'POST',
      headers,
      body,
      keepalive: true, // Ensures request completes even if page navigates
    }).catch(() => {
      // Silently ignore errors - non-blocking fire-and-forget
    });
  } catch {
    // Silently ignore - don't block navigation
  }
}

export function useEventTracking(pageId: string | null, mode: ModeType) {
  const trackedRef = useRef(false);

  // Standard tracking (awaitable, for non-navigation events)
  const trackEvent = useCallback(async (
    eventType: EventType,
    metadata: Json
  ) => {
    if (!pageId) return;

    try {
      await supabase.from('events').insert([{
        page_id: pageId,
        mode: mode,
        event_type: eventType,
        metadata_json: metadata,
      }]);
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  }, [pageId, mode]);

  // Non-blocking tracking (for outbound clicks - doesn't delay navigation)
  const trackEventNonBlocking = useCallback((
    eventType: EventType,
    metadata: Json
  ) => {
    if (!pageId) return;
    sendBeaconEvent(pageId, mode, eventType, metadata);
  }, [pageId, mode]);

  const trackPageLoad = useCallback(async (routingReason: 'param' | 'utm' | 'referrer' | 'default') => {
    if (!pageId || trackedRef.current) return;
    trackedRef.current = true;

    const referrerDomain = document.referrer ? extractDomain(document.referrer) : null;
    const userAgent = navigator.userAgent;

    // Track page_view
    await trackEvent('page_view', {
      referrer_domain: referrerDomain,
      user_agent: userAgent,
    });

    // Track mode_routed
    await trackEvent('mode_routed', {
      routing_reason: routingReason,
    });
  }, [pageId, trackEvent]);

  // Non-blocking outbound click tracking - navigation happens immediately
  const trackOutboundClick = useCallback((
    blockType: string,
    blockId: string,
    itemId: string,
    url: string
  ) => {
    const destinationDomain = extractDomain(url);

    // Fire-and-forget: don't await, don't block navigation
    trackEventNonBlocking('outbound_click', {
      block_type: blockType,
      block_id: blockId,
      item_id: itemId,
      destination_domain: destinationDomain || 'unknown',
      full_url: url,
    });
  }, [trackEventNonBlocking]);

  return {
    trackPageLoad,
    trackOutboundClick,
  };
}
