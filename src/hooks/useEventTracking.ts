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

export function useEventTracking(pageId: string | null, mode: ModeType) {
  const trackedRef = useRef(false);

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

  const trackOutboundClick = useCallback(async (
    blockType: string,
    blockId: string,
    itemId: string,
    url: string
  ) => {
    const destinationDomain = extractDomain(url);

    await trackEvent('outbound_click', {
      block_type: blockType,
      block_id: blockId,
      item_id: itemId,
      destination_domain: destinationDomain || 'unknown',
      full_url: url,
    });
  }, [trackEvent]);

  return {
    trackPageLoad,
    trackOutboundClick,
  };
}
