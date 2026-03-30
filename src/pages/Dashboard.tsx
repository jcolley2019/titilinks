import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Eye, MousePointer, TrendingUp } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type TimeRange = '7d' | 'all';

export default function Dashboard() {
  const { user } = useAuth();
  const analytics = useAnalytics();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [activeLinksCount, setActiveLinksCount] = useState<number>(0);
  const [activeLinksLoading, setActiveLinksLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchActiveLinks = async () => {
      setActiveLinksLoading(true);
      try {
        // Get user's page
        const { data: page } = await supabase
          .from('pages')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!page) {
          setActiveLinksCount(0);
          return;
        }

        // Get modes for page
        const { data: modes } = await supabase
          .from('modes')
          .select('id')
          .eq('page_id', page.id);

        if (!modes?.length) {
          setActiveLinksCount(0);
          return;
        }

        // Get enabled blocks for those modes
        const modeIds = modes.map((m) => m.id);
        const { data: blocks } = await supabase
          .from('blocks')
          .select('id')
          .in('mode_id', modeIds)
          .eq('is_enabled', true);

        if (!blocks?.length) {
          setActiveLinksCount(0);
          return;
        }

        // Count block items in enabled blocks
        const blockIds = blocks.map((b) => b.id);
        const { count } = await supabase
          .from('block_items')
          .select('*', { count: 'exact', head: true })
          .in('block_id', blockIds);

        setActiveLinksCount(count || 0);
      } catch (err) {
        console.error('Error fetching active links:', err);
      } finally {
        setActiveLinksLoading(false);
      }
    };

    fetchActiveLinks();
  }, [user]);

  const isLoading = analytics.loading || activeLinksLoading;

  const views = timeRange === '7d' ? analytics.pageViews7Days : analytics.pageViews30Days;
  const clicks = timeRange === '7d' ? analytics.clicks7Days : analytics.clicks30Days;
  const clickRate = views > 0 ? ((clicks / views) * 100).toFixed(1) + '%' : '0%';

  const stats = [
    { label: 'Total Views', value: String(views), icon: Eye },
    { label: 'Link Clicks', value: String(clicks), icon: MousePointer },
    { label: 'Click Rate', value: clickRate, icon: TrendingUp },
    { label: 'Active Links', value: String(activeLinksCount), icon: BarChart3 },
  ];

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome to your TitiLinks dashboard</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                timeRange === '7d'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Last 7 days
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                timeRange === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All time
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <>
                      <Skeleton className="h-8 w-16 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                      <p className="text-xs text-muted-foreground">
                        {timeRange === '7d' ? 'last 7 days' : 'last 30 days'}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Quick Start</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Get started by setting up your profile in the Setup tab, then add your links in the Editor.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}
