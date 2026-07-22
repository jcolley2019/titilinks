import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

const GOLD = '#C9A55C';
const BG = 'hsl(30 15% 6%)';

export function Footer() {
  const { t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="px-5 py-16" style={{ backgroundColor: BG, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-8 text-center md:flex-row md:items-start md:justify-between md:text-left">
          {/* Brand */}
          <div className="max-w-xs">
            <Link to="/" className="inline-flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: `${GOLD}1a`, border: `1px solid ${GOLD}4d` }}>
                <Link2 className="h-4 w-4" style={{ color: GOLD }} />
              </div>
              <span className="text-lg font-bold">
                <span className="text-white">Titi</span>
                <span className="font-display italic" style={{ color: GOLD }}>
                  Links
                </span>
              </span>
            </Link>
            <p className="mt-3 text-sm text-white/45">{t('footer.tagline')}</p>
          </div>

          {/* Real links only */}
          <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            <a href="#features" className="text-sm text-white/55 transition-colors hover:text-white">{t('nav.features')}</a>
            <a href="#pricing" className="text-sm text-white/55 transition-colors hover:text-white">{t('nav.pricing')}</a>
            <Link to="/templates" className="text-sm text-white/55 transition-colors hover:text-white">{t('nav.templates')}</Link>
            <Link to="/login" className="text-sm text-white/55 transition-colors hover:text-white">{t('nav.login')}</Link>
            <Link to="/terms" className="text-sm text-white/55 transition-colors hover:text-white">{t('footer.terms')}</Link>
            <Link to="/privacy" className="text-sm text-white/55 transition-colors hover:text-white">{t('footer.privacy')}</Link>
          </nav>
        </div>

        <div
          className="mt-12 flex flex-col items-center justify-between gap-3 border-t pt-6 text-center sm:flex-row sm:text-left"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-sm text-white/40">
            © {year} <span className="font-bold text-white">Titi</span>
            <span className="font-display font-bold italic" style={{ color: GOLD }}>
              Links
            </span>
            . {t('footer.copyright')}
          </p>
          <p className="text-sm text-white/40">{t('footer.made')}</p>
        </div>
      </div>
    </footer>
  );
}
