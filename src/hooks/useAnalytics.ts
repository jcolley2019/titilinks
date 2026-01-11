import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, Json } from '@/integrations/supabase/types';

type Event = Tables<'events'>;
type Page = Tables<'pages'>;

interface AnalyticsData {
  pageViews7Days: number;
  pageViews30Days: number;
  viewsByMode: { shop: number; recruit: number };
  clicks7Days: number;
  clicks30Days: number;
  clicksByMode: { shop: number; recruit: number };
  topDestinations: { domain: string; count: number }[];
  referrerBreakdown: { tiktok: number; instagram: number; other: number };
  goalClicks: {
    primaryOffer: number | null;
    recruit: number | null;
  };
  goals: {
    primaryOfferId: string | null;
    recruitId: string | null;
  };
  loading: boolean;
  error: string | null;
}

function isMetadataObject(json: Json): json is { [key: string]: Json | undefined } {
  return typeof json === 'object' && json !== null && !Array.isArray(json);
}

function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function useAnalytics(): AnalyticsData {
  const { user } = useAuth();
  const [page, setPage] = useState<Page | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch user's page
        const { data: pageData, error: pageError } = await supabase
          .from('pages')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (pageError) throw pageError;

        if (!pageData) {
          setPage(null);
          setEvents([]);
          setLoading(false);
          return;
        }

        setPage(pageData);

        // Fetch events for last 30 days
        const thirtyDaysAgo = getDaysAgo(30);
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('*')
          .eq('page_id', pageData.id)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: false });

        if (eventsError) throw eventsError;

        setEvents(eventsData || []);
      } catch (err) {
        console.error('Error fetching analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const analytics = useMemo(() => {
    const sevenDaysAgo = getDaysAgo(7);
    const thirtyDaysAgo = getDaysAgo(30);

    // Filter events by type and date
    const pageViewEvents = events.filter((e) => e.event_type === 'page_view');
    const clickEvents = events.filter((e) => e.event_type === 'outbound_click');

    // Page views
    const pageViews7Days = pageViewEvents.filter(
      (e) => new Date(e.created_at) >= sevenDaysAgo
    ).length;
    const pageViews30Days = pageViewEvents.length;

    // Views by mode
    const viewsByMode = {
      shop: pageViewEvents.filter((e) => e.mode === 'shop').length,
      recruit: pageViewEvents.filter((e) => e.mode === 'recruit').length,
    };

    // Clicks
    const clicks7Days = clickEvents.filter(
      (e) => new Date(e.created_at) >= sevenDaysAgo
    ).length;
    const clicks30Days = clickEvents.length;

    // Clicks by mode
    const clicksByMode = {
      shop: clickEvents.filter((e) => e.mode === 'shop').length,
      recruit: clickEvents.filter((e) => e.mode === 'recruit').length,
    };

    // Top destinations
    const destinationCounts: Record<string, number> = {};
    clickEvents.forEach((e) => {
      const metadata = e.metadata_json;
      if (metadata && isMetadataObject(metadata)) {
        const domain = metadata.destination_domain;
        if (typeof domain === 'string') {
          destinationCounts[domain] = (destinationCounts[domain] || 0) + 1;
        }
      }
    });
    const topDestinations = Object.entries(destinationCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Referrer breakdown
    const referrerBreakdown = { tiktok: 0, instagram: 0, other: 0 };
    pageViewEvents.forEach((e) => {
      const metadata = e.metadata_json;
      if (metadata && isMetadataObject(metadata)) {
        const referrer = metadata.referrer_domain;
        if (typeof referrer === 'string') {
          if (referrer.includes('tiktok')) {
            referrerBreakdown.tiktok++;
          } else if (referrer.includes('instagram')) {
            referrerBreakdown.instagram++;
          } else if (referrer) {
            referrerBreakdown.other++;
          }
        } else if (referrer === null) {
          referrerBreakdown.other++;
        }
      }
    });

    // Goal clicks
    let primaryOfferClicks: number | null = null;
    let recruitClicks: number | null = null;

    if (page?.goal_primary_offer_item_id) {
      primaryOfferClicks = clickEvents.filter((e) => {
        const metadata = e.metadata_json;
        if (metadata && isMetadataObject(metadata)) {
          return metadata.item_id === page.goal_primary_offer_item_id;
        }
        return false;
      }).length;
    }

    if (page?.goal_recruit_item_id) {
      recruitClicks = clickEvents.filter((e) => {
        const metadata = e.metadata_json;
        if (metadata && isMetadataObject(metadata)) {
          return metadata.item_id === page.goal_recruit_item_id;
        }
        return false;
      }).length;
    }

    return {
      pageViews7Days,
      pageViews30Days,
      viewsByMode,
      clicks7Days,
      clicks30Days,
      clicksByMode,
      topDestinations,
      referrerBreakdown,
      goalClicks: {
        primaryOffer: primaryOfferClicks,
        recruit: recruitClicks,
      },
      goals: {
        primaryOfferId: page?.goal_primary_offer_item_id || null,
        recruitId: page?.goal_recruit_item_id || null,
      },
    };
  }, [events, page]);

  return {
    ...analytics,
    loading,
    error,
  };
}
