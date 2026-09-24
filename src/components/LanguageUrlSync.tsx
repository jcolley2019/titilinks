import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import { isEsPath } from '@/lib/seo-marketing-html';

/**
 * TL.SEO.I18N.1b — client navigation honours the URL. LanguageProvider reads the
 * /es prefix once, at mount; this covers every later pathname change (back /
 * forward, in-app links). An /es URL switches the UI to Spanish. Nothing forces
 * English: a plain marketing URL keeps whatever language the user has chosen.
 * Mounted inside BrowserRouter (App.tsx, beside ReferralCapture); renders nothing.
 */
export function LanguageUrlSync() {
  const { pathname } = useLocation();
  const { language, setLanguage } = useLanguage();

  useEffect(() => {
    if (isEsPath(pathname) && language !== 'es') setLanguage('es');
    // Keyed on the pathname alone: re-running when `language` changes would
    // undo a toggle to English made while still on an /es URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
