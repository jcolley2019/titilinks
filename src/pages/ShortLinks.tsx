import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Link2, Copy, Check, Trash2, Plus, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useEntitlements } from '@/hooks/useEntitlements';
import { validateSlug } from '@/lib/reserved-slugs';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type ShortLink = Tables<'custom_short_links'>;

/** Coerce user input into an http(s) URL string, or null if it can't be one. */
function normalizeUrl(value: string): string | null {
  let s = value.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** SHORT.1 — custom short links dashboard tool.
 *
 *  Create user-chosen /s/:slug destinations, see click counts, copy, delete.
 *  Quota is enforced here in the UI via `entitlements.maxShortLinks`;
 *  server-side enforcement arrives with ENT.SRV in the BILL sprint. */
export default function ShortLinks() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { plan, entitlements } = useEntitlements();

  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('custom_short_links')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (!err && data) setLinks(data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const limit = entitlements.maxShortLinks;
  const atQuota = links.length >= limit;
  const shortUrlFor = (s: string) => `${window.location.origin}/s/${s}`;

  const handleCreate = async () => {
    if (!user) return;
    const slugNorm = slug.trim().toLowerCase();

    const slugError = validateSlug(slugNorm);
    if (slugError) {
      setError(slugError === 'reserved' ? t('shortLinks.errReserved') : t('shortLinks.errFormat'));
      return;
    }
    const target = normalizeUrl(destination);
    if (!target) {
      setError(t('shortLinks.errUrl'));
      return;
    }
    if (atQuota) {
      setError(t('shortLinks.errQuota'));
      return;
    }
    if (links.some((l) => l.slug === slugNorm)) {
      setError(t('shortLinks.errTaken'));
      return;
    }

    setSaving(true);
    const { data, error: err } = await supabase
      .from('custom_short_links')
      .insert({ user_id: user.id, slug: slugNorm, target_url: target })
      .select()
      .single();
    setSaving(false);

    if (err || !data) {
      // 23505 = unique_violation (claimed on another device between checks).
      setError(err?.code === '23505' ? t('shortLinks.errTaken') : t('shortLinks.errSave'));
      return;
    }
    setLinks((prev) => [data, ...prev]);
    setSlug('');
    setDestination('');
    setError(null);
    toast.success(t('shortLinks.created'));
  };

  const handleCopy = async (s: string, id: string) => {
    try {
      await navigator.clipboard.writeText(shortUrlFor(s));
      setCopiedId(id);
      toast.success(t('shortLinks.copied'));
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error(t('shortLinks.copyFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    const prev = links;
    setLinks((cur) => cur.filter((l) => l.id !== id)); // optimistic
    const { error: err } = await supabase.from('custom_short_links').delete().eq('id', id);
    if (err) {
      setLinks(prev);
      toast.error(t('shortLinks.deleteFailed'));
      return;
    }
    toast.success(t('shortLinks.deleted'));
  };

  const canSubmit = !saving && !atQuota && slug.trim().length > 0 && destination.trim().length > 0;

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
            <Link2 className="h-6 w-6 text-primary" />
            {t('shortLinks.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('shortLinks.subtitle')}</p>
        </div>

        {/* Create */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
              <div>
                <Label htmlFor="short-link-slug" className="text-xs font-medium text-muted-foreground">
                  {t('shortLinks.slugLabel')}
                </Label>
                <div className="mt-1.5 flex items-center rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring">
                  <span className="pl-3 pr-1 text-sm text-muted-foreground select-none">/s/</span>
                  <Input
                    id="short-link-slug"
                    data-testid="short-link-slug"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={t('shortLinks.slugPlaceholder')}
                    className="border-0 bg-transparent px-1 focus-visible:ring-0"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="short-link-url" className="text-xs font-medium text-muted-foreground">
                  {t('shortLinks.urlLabel')}
                </Label>
                <Input
                  id="short-link-url"
                  data-testid="short-link-url"
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={t('shortLinks.urlPlaceholder')}
                  className="mt-1.5"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <Button
                data-testid="short-link-create"
                onClick={handleCreate}
                disabled={!canSubmit}
                className="gap-1.5 sm:w-auto"
              >
                <Plus className="h-4 w-4" /> {t('shortLinks.create')}
              </Button>
            </div>

            {error && (
              <p data-testid="short-link-error" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {atQuota ? (
              <div
                data-testid="short-link-quota-reached"
                className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
              >
                <span>{t('shortLinks.quotaReached').replace('{max}', String(limit))}</span>
                {plan === 'business' ? null : (
                  <Link to="/#pricing" className="font-medium text-primary hover:underline">
                    {t('shortLinks.upgradeCta')}
                  </Link>
                )}
              </div>
            ) : (
              <p data-testid="short-link-quota" className="text-xs text-muted-foreground">
                {t('shortLinks.quota')
                  .replace('{used}', String(links.length))
                  .replace('{max}', String(limit))}
              </p>
            )}
          </CardContent>
        </Card>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-14 px-6 text-center">
            <Link2 className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{t('shortLinks.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {links.map((link) => (
              <div
                key={link.id}
                data-testid="short-link-row"
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">/s/{link.slug}</span>
                    <button
                      onClick={() => handleCopy(link.slug, link.id)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={t('shortLinks.copy')}
                    >
                      {copiedId === link.id ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <a
                    href={link.target_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:underline truncate"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{link.target_url}</span>
                  </a>
                </div>
                <div className="text-center shrink-0 px-1">
                  <div className="text-sm font-semibold text-foreground">{link.clicks}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('shortLinks.clicks')}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(link.id)}
                  aria-label={t('shortLinks.delete')}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
