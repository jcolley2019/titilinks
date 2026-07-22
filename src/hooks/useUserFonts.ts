import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlements } from '@/hooks/useEntitlements';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { UserFont } from '@/lib/fonts';
import {
  ensureUserFontFaces,
  fontFamilyFromFileName,
  fontsFromBrandJson,
  validateFontFile,
} from '@/lib/user-fonts';

export type AddFontError = 'invalidType' | 'tooLarge' | 'notAllowed' | 'uploadFailed';

/**
 * BRAND.1 — the current user's uploaded fonts (profiles.brand_json.fonts[]).
 *
 * Fetches on mount and registers @font-face for every entry, so any editor
 * surface that mounts a picker can preview/resolve the `custom:` keys.
 * Uploading is PRO-gated (entitlements.customFonts) at add time only —
 * already-uploaded fonts keep loading (and rendering) on a downgrade, they
 * just can't be added to.
 *
 * brand_json writes are read-modify-write over the FRESH row so the BRAND.2
 * keys (colors, heading/body font) survive a fonts update, and vice versa.
 */
export function useUserFonts() {
  const { user } = useAuth();
  const { can } = useEntitlements();
  const canUpload = can('customFonts');
  const [fonts, setFonts] = useState<UserFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('brand_json')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        // Pre-migration (no brand_json column) degrades to "no fonts yet".
        console.warn('[fonts] brand_json read failed:', error.message);
      } else {
        const parsed = fontsFromBrandJson(data?.brand_json);
        setFonts(parsed);
        ensureUserFontFaces(parsed);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge `next` into the FRESH brand_json so sibling keys survive.
  const persistFonts = useCallback(async (next: UserFont[]) => {
    if (!user) throw new Error('no user');
    const { data } = await supabase
      .from('profiles')
      .select('brand_json')
      .eq('id', user.id)
      .single();
    const brand = (data?.brand_json && typeof data.brand_json === 'object' && !Array.isArray(data.brand_json))
      ? (data.brand_json as Record<string, unknown>)
      : {};
    // Json's index-signature requirement rejects the UserFont[] literal; the
    // shape is plain data, so the cast is safe.
    const { error } = await supabase
      .from('profiles')
      .update({ brand_json: { ...brand, fonts: next } as unknown as Json })
      .eq('id', user.id);
    if (error) throw error;
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Validate → upload to fonts/{user_id}/{filename} → append to
   *  brand_json.fonts[] → register the face. Returns an error code (mapped to
   *  an i18n toast by the caller) or null on success. */
  const addFont = useCallback(async (file: File): Promise<AddFontError | null> => {
    if (!user) return 'uploadFailed';
    if (!canUpload) return 'notAllowed';
    const invalid = validateFontFile(file);
    if (invalid) return invalid;
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, '_');
      const path = `${user.id}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('fonts')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('fonts').getPublicUrl(path);
      const entry: UserFont = { family: fontFamilyFromFileName(file.name), url: urlData.publicUrl };
      const next = [...fonts.filter((f) => f.family !== entry.family), entry];
      await persistFonts(next);
      setFonts(next);
      ensureUserFontFaces([entry]);
      return null;
    } catch (err) {
      console.error('[fonts] upload failed:', err);
      return 'uploadFailed';
    } finally {
      setBusy(false);
    }
  }, [user?.id, canUpload, fonts, persistFonts]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Drop a family from brand_json (and best-effort delete its file). Pages
   *  still referencing it fall back to the page font on next load — the entry
   *  is only ever removed by the owner's explicit choice. */
  const removeFont = useCallback(async (family: string): Promise<boolean> => {
    const target = fonts.find((f) => f.family === family);
    try {
      await persistFonts(fonts.filter((f) => f.family !== family));
      setFonts((prev) => prev.filter((f) => f.family !== family));
    } catch (err) {
      console.error('[fonts] remove failed:', err);
      return false;
    }
    // Storage cleanup is best-effort — a stale file in the public bucket is
    // harmless; a failed delete must not fail the remove.
    const marker = '/object/public/fonts/';
    const idx = target?.url.indexOf(marker) ?? -1;
    if (target && idx !== -1) {
      const path = decodeURIComponent(target.url.slice(idx + marker.length).split('?')[0]);
      supabase.storage.from('fonts').remove([path]).catch(() => {});
    }
    return true;
  }, [fonts, persistFonts]);

  return { fonts, loading, busy, canUpload, addFont, removeFont };
}
