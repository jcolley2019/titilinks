import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Eye,
  MousePointerClick,
  Target,
  Globe,
  TrendingUp,
  ShoppingBag,
  Users,
  ExternalLink,
  AlertCircle,
  Link2,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useLanguage } from '@/hooks/useLanguage';
import { formatDistanceToNow } from 'date-fns';

export default function Analytics() {
  const analytics = useAnalytics();
  const { t } = useLanguage();

  if (analytics.loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (analytics.error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-muted-foreground">{analytics.error}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t('analytics.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('analytics.subtitle')}</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={<Eye className="h-5 w-5" />}
            label={t('analytics.views7d')}
            value={analytics.pageViews7Days}
            subValue={`${analytics.pageViews30Days} ${t('analytics.last30d')}`}
          />
          <MetricCard
            icon={<MousePointerClick className="h-5 w-5" />}
            label={t('analytics.clicks7d')}
            value={analytics.clicks7Days}
            subValue={`${analytics.clicks30Days} ${t('analytics.last30d')}`}
          />
          <MetricCard
            icon={<Eye className="h-5 w-5" />}
            label={analytics.pageLabels.page1}
            value={analytics.viewsByMode.shop}
            subValue={`${analytics.clicksByMode.shop} ${t('analytics.clicks')}`}
          />
          <MetricCard
            icon={<Eye className="h-5 w-5" />}
            label={analytics.pageLabels.page2}
            value={analytics.viewsByMode.recruit}
            subValue={`${analytics.clicksByMode.recruit} ${t('analytics.clicks')}`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Goal Performance */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Target className="h-5 w-5 text-primary" />
                {t('analytics.goalPerformance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.goals.primaryOfferId || analytics.goals.recruitId ? (
                <div className="space-y-4">
                  <GoalMetric
                    label={t('analytics.primaryOfferGoal')}
                    clicks={analytics.goalClicks.primaryOffer}
                    isSet={!!analytics.goals.primaryOfferId}
                  />
                  <GoalMetric
                    label={`${analytics.pageLabels.page2} ${t('analytics.goal')}`}
                    clicks={analytics.goalClicks.recruit}
                    isSet={!!analytics.goals.recruitId}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Target className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-4">
                    {t('analytics.setGoalsDesc')}
                  </p>
                  <Button asChild size="sm">
                    <Link to="/dashboard/editor">{t('analytics.setGoals')}</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Destinations */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <ExternalLink className="h-5 w-5 text-primary" />
                {t('analytics.topDestinations')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.topDestinations.length > 0 ? (
                <div className="space-y-3">
                  {analytics.topDestinations.map((dest, index) => (
                    <DestinationRow
                      key={dest.domain}
                      rank={index + 1}
                      domain={dest.domain}
                      count={dest.count}
                      maxCount={analytics.topDestinations[0]?.count || 1}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message={t('analytics.noClicks')} />
              )}
            </CardContent>
          </Card>

          {/* Referrer Breakdown */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Globe className="h-5 w-5 text-primary" />
                {t('analytics.trafficSources')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.referrerBreakdown.tiktok > 0 ||
              analytics.referrerBreakdown.instagram > 0 ||
              analytics.referrerBreakdown.other > 0 ? (
                <div className="space-y-4">
                  <ReferrerBar
                    label="TikTok"
                    count={analytics.referrerBreakdown.tiktok}
                    total={analytics.pageViews30Days}
                    color="bg-pink-500"
                  />
                  <ReferrerBar
                    label="Instagram"
                    count={analytics.referrerBreakdown.instagram}
                    total={analytics.pageViews30Days}
                    color="bg-purple-500"
                  />
                  <ReferrerBar
                    label={t('analytics.otherDirect')}
                    count={analytics.referrerBreakdown.other}
                    total={analytics.pageViews30Days}
                    color="bg-muted-foreground"
                  />
                </div>
              ) : (
                <EmptyState message={t('analytics.noTraffic')} />
              )}
            </CardContent>
          </Card>

          {/* Mode Distribution */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <TrendingUp className="h-5 w-5 text-primary" />
                {t('analytics.modeDistribution')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.pageViews30Days > 0 ? (
                <div className="space-y-4">
                  <ModeBar
                    label={analytics.pageLabels.page1}
                    views={analytics.viewsByMode.shop}
                    clicks={analytics.clicksByMode.shop}
                    totalViews={analytics.pageViews30Days}
                    icon={<Eye className="h-4 w-4" />}
                  />
                  <ModeBar
                    label={analytics.pageLabels.page2}
                    views={analytics.viewsByMode.recruit}
                    clicks={analytics.clicksByMode.recruit}
                    totalViews={analytics.pageViews30Days}
                    icon={<Eye className="h-4 w-4" />}
                  />
                </div>
              ) : (
                <EmptyState message={t('analytics.noViews')} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Short Links Metrics */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-foreground">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                {t('analytics.shortLinks')}
              </div>
              <div className="text-sm font-normal text-muted-foreground">
                {t('analytics.totalClicks')} <span className="text-primary font-semibold">{analytics.totalShortLinkClicks}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.shortLinks.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">{t('analytics.code')}</TableHead>
                      <TableHead>{t('analytics.destination')}</TableHead>
                      <TableHead className="w-24 text-right">{t('analytics.clicks')}</TableHead>
                      <TableHead className="w-32 text-right">{t('analytics.lastClick')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.shortLinks.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell className="font-mono text-sm">/l/{link.code}</TableCell>
                        <TableCell className="max-w-[300px] truncate text-muted-foreground">
                          {link.destination_url}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {link.click_count || 0}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {link.last_clicked_at
                            ? formatDistanceToNow(new Date(link.last_clicked_at), { addSuffix: true })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState message={t('analytics.noShortLinks')} />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subValue: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
      </CardContent>
    </Card>
  );
}

function GoalMetric({
  label,
  clicks,
  isSet,
}: {
  label: string;
  clicks: number | null;
  isSet: boolean;
}) {
  const { t } = useLanguage();

  if (!isSet) {
    return (
      <div className="flex items-center justify-between py-2 text-muted-foreground">
        <span className="text-sm">{label}</span>
        <span className="text-xs">{t('analytics.notSet')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-primary">{clicks}</span>
        <span className="text-xs text-muted-foreground">{t('analytics.clicks')}</span>
      </div>
    </div>
  );
}

function DestinationRow({
  rank,
  domain,
  count,
  maxCount,
}: {
  rank: number;
  domain: string;
  count: number;
  maxCount: number;
}) {
  const percentage = (count / maxCount) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-4">{rank}.</span>
          <span className="text-foreground truncate max-w-[180px]">{domain}</span>
        </div>
        <span className="text-muted-foreground">{count}</span>
      </div>
      <Progress value={percentage} className="h-1.5" />
    </div>
  );
}

function ReferrerBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{count}</span>
          <span className="text-xs text-muted-foreground">({percentage}%)</span>
        </div>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ModeBar({
  label,
  views,
  clicks,
  totalViews,
  icon,
}: {
  label: string;
  views: number;
  clicks: number;
  totalViews: number;
  icon: React.ReactNode;
}) {
  const { t } = useLanguage();
  const percentage = totalViews > 0 ? Math.round((views / totalViews) * 100) : 0;
  const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-2 p-3 bg-secondary/30 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className="text-xs text-muted-foreground">{percentage}% {t('analytics.ofTraffic')}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{views} {t('analytics.views')}</span>
        <span className="text-muted-foreground">{clicks} {t('analytics.clicks')}</span>
        <span className="text-primary font-medium">{ctr}% {t('analytics.ctr')}</span>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
