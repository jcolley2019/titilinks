import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, Loader2 } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  listSnapshots,
  captureSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  SnapshotQuotaError,
  type SnapshotRow,
} from '@/lib/snapshots';

/**
 * SNAP.1b — the Snapshots panel (Style group). Named restore points for a
 * page's THEME + block layout/content, plus the auto safety-net snapshots.
 *
 * Self-contained like TrackingPixelsEditor: reads/writes profile_snapshots for
 * the page (owner RLS). Rendered inside the narrow slide-in panel, so the
 * layout is single-column, full-width, with the primary "Save current look"
 * action anchored in the uniform sticky footer. At the plan's manual-snapshot
 * quota the footer swaps to the standard PRO upsell.
 */

interface SnapshotsEditorProps {
  pageId: string;
  /** Refresh the editor preview after a restore mutates the page. */
  onRestored?: () => void;
}

type Confirm = { action: 'restore' | 'delete'; id: string; name: string };

/** Suggested default snapshot name — today's date in the active language. */
const defaultSnapshotName = (lang: string) =>
  new Date().toLocaleDateString(lang, { month: 'short', day: 'numeric', year: 'numeric' });

/** Compact localized "x ago" for a snapshot's created_at. */
function relativeTime(iso: string, lang: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000); // secs, past = negative
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff / 60) || 0, 'minute');
}

export function SnapshotsEditor({ pageId, onRestored }: SnapshotsEditorProps) {
  const { t, language } = useLanguage();
  const { plan, entitlements } = useEntitlements();
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(() => defaultSnapshotName(language));
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const reload = async () => {
    const rows = await listSnapshots(pageId);
    setSnapshots(rows);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listSnapshots(pageId);
        if (alive) setSnapshots(rows);
      } catch (e) {
        console.warn('[snapshots] load failed:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pageId]);

  const manualCount = snapshots.filter((s) => s.kind === 'manual').length;
  const limit = entitlements.maxSnapshots;
  const atQuota = manualCount >= limit;

  const handleSave = async () => {
    if (saving || atQuota || !name.trim()) return;
    setSaving(true);
    try {
      await captureSnapshot(pageId, name.trim(), 'manual');
      toast.success(t('snapshots.saved'));
      setName(defaultSnapshotName(language));
      await reload();
    } catch (e) {
      if (e instanceof SnapshotQuotaError) {
        toast(t('snapshots.proTitle'), { description: t('snapshots.proDesc') });
        await reload();
      } else {
        console.error('[snapshots] save failed:', e);
        toast.error(t('snapshots.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const doRestore = async (id: string) => {
    setBusyId(id);
    try {
      await restoreSnapshot(id);
      toast.success(t('snapshots.restored'));
      await reload();
      onRestored?.();
    } catch (e) {
      console.error('[snapshots] restore failed:', e);
      toast.error(t('snapshots.restoreFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteSnapshot(id);
      await reload();
    } catch (e) {
      console.error('[snapshots] delete failed:', e);
      toast.error(t('snapshots.deleteFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const runConfirm = () => {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    if (c.action === 'restore') void doRestore(c.id);
    else void doDelete(c.id);
  };

  return (
    <div
      className="dark text-foreground flex min-h-full flex-col gap-4 px-4 pt-4"
      data-testid="snapshots-panel"
    >
      <p className="text-white/50 text-[13px] leading-relaxed">{t('snapshots.intro')}</p>

      {/* Quota line — "1 of 1 used", per plan. */}
      <p className="text-white/40 text-[11px]" data-testid="snapshots-quota">
        {t('snapshots.quota').replace('{used}', String(manualCount)).replace('{max}', String(limit))}
      </p>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-white/40 text-[13px] py-6 text-center" data-testid="snapshots-empty">
          {t('snapshots.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snap) => {
            const isAuto = snap.kind === 'auto';
            const busy = busyId === snap.id;
            return (
              <div
                key={snap.id}
                data-testid="snapshot-row"
                data-kind={snap.kind}
                className={`rounded-xl bg-white/5 px-3 py-3 ${isAuto ? 'opacity-75' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{snap.name}</span>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full text-[9px] font-bold px-1.5 py-0.5 ${
                          isAuto
                            ? 'bg-white/10 text-white/50'
                            : 'bg-[#C9A55C]/15 text-[#C9A55C]'
                        }`}
                      >
                        {t(isAuto ? 'snapshots.autoBadge' : 'snapshots.manualBadge')}
                      </span>
                    </p>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      {relativeTime(snap.created_at, language)}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => setConfirm({ action: 'restore', id: snap.id, name: snap.name })}
                    disabled={busy}
                    data-testid="snapshot-restore"
                    className="flex-1 h-9 rounded-lg bg-white/10 border border-white/15 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t('snapshots.restore')}
                  </button>
                  <button
                    onClick={() => setConfirm({ action: 'delete', id: snap.id, name: snap.name })}
                    disabled={busy}
                    data-testid="snapshot-delete"
                    className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs font-semibold hover:text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    {t('snapshots.delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Uniform sticky footer — primary "Save current look" action, or the PRO
          upsell once the manual-snapshot quota is reached. */}
      <div className="sticky bottom-0 z-10 mt-auto -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
        {atQuota ? (
          plan === 'business' ? (
            <p className="text-white/50 text-[12px] text-center py-2" data-testid="snapshots-limit">
              {t('snapshots.limitReached')}
            </p>
          ) : (
            <button
              onClick={() => toast(t('snapshots.proTitle'), { description: t('snapshots.proDesc') })}
              data-testid="snapshots-upsell"
              className="w-full h-12 rounded-xl bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 font-semibold text-sm flex items-center justify-center gap-1.5"
            >
              <Lock className="h-4 w-4" />
              {t('snapshots.upgradeToPro')}
            </button>
          )
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="snapshot-name"
              placeholder={t('snapshots.namePlaceholder')}
              maxLength={80}
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50"
            />
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              data-testid="snapshot-save"
              className="shrink-0 h-11 px-4 rounded-xl bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('snapshots.save')}
            </button>
          </div>
        )}
      </div>

      {/* Destructive-action confirm — restore overwrites, delete removes. */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          data-testid="snapshot-confirm"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#C9A55C]/40 bg-[#1a160f] p-5">
            <p className="text-base font-bold text-white mb-1">
              {t(confirm.action === 'restore' ? 'snapshots.restoreConfirmTitle' : 'snapshots.deleteConfirmTitle')}
            </p>
            <p className="text-[13px] leading-snug text-white/70 mb-4">
              {t(confirm.action === 'restore' ? 'snapshots.restoreConfirmBody' : 'snapshots.deleteConfirmBody').replace(
                '{name}',
                confirm.name,
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 h-11 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 font-semibold text-sm"
              >
                {t('snapshots.cancel')}
              </button>
              <button
                onClick={runConfirm}
                data-testid="snapshot-confirm-go"
                className="flex-1 h-11 rounded-xl bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 font-semibold text-sm"
              >
                {t(confirm.action === 'restore' ? 'snapshots.restoreAction' : 'snapshots.deleteAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
