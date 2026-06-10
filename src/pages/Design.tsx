import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { DesignEditor } from '@/components/editors/DesignEditor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import type { Tables } from '@/integrations/supabase/types';

type Page = Tables<'pages'>;

export default function Design() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('pages')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      setPage(data);
    } catch (err) {
      console.error('Error fetching page:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!page) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">{t('dashboard.noMode')}</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <DesignEditor
        pageId={page.id}
        themeJson={page.theme_json}
        onUpdate={fetchPage}
        displayName={page.display_name ?? undefined}
        bio={page.bio ?? undefined}
        avatarUrl={page.avatar_url ?? undefined}
      />
    </DashboardLayout>
  );
}
