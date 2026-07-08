import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Menu, X } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLanguage } from '@/hooks/useLanguage';

const GOLD = '#C9A55C';
const BG = 'hsl(30 15% 6%)';

function Wordmark() {
  return (
    <span className="text-lg font-bold">
      <span className="text-white">Titi</span>
      <span className="font-display italic" style={{ color: GOLD }}>
        Links
      </span>
    </span>
  );
}

export function Navbar() {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-x-0 top-0 z-50 border-b transition-colors"
      style={{
        backgroundColor: scrolled ? 'hsla(30,15%,6%,0.85)' : BG,
        borderColor: 'rgba(255,255,255,0.08)',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: `${GOLD}1a`, border: `1px solid ${GOLD}4d` }}>
            <Link2 className="h-4 w-4" style={{ color: GOLD }} />
          </div>
          <Wordmark />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-white/65 transition-colors hover:text-white">{t('nav.features')}</a>
          <a href="#pricing" className="text-sm text-white/65 transition-colors hover:text-white">{t('nav.pricing')}</a>
          <Link to="/templates" className="text-sm text-white/65 transition-colors hover:text-white">{t('nav.templates')}</Link>
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageToggle />
          <Link to="/login" className="text-sm font-medium text-white/65 transition-colors hover:text-white">{t('nav.login')}</Link>
          <Link
            to="/login?mode=signup"
            className="rounded-full px-5 py-2 text-sm font-semibold transition-transform duration-150 hover:-translate-y-px active:scale-[0.98]"
            style={{ backgroundColor: GOLD, color: BG }}
          >
            {t('nav.signup')}
          </Link>
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          <LanguageToggle />
          <button onClick={() => setMenuOpen((v) => !v)} className="text-white/70" aria-label="Menu">
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-x-0 bottom-0 top-16 z-40 md:hidden"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 240 }}
              className="fixed bottom-0 right-0 top-16 z-50 w-64 border-l md:hidden"
              style={{ backgroundColor: 'hsl(30 15% 8%)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <nav className="flex flex-col gap-1 p-4">
                <a href="#features" onClick={() => setMenuOpen(false)} className="rounded-lg px-4 py-3 text-white/70 transition-colors hover:bg-white/5 hover:text-white">{t('nav.features')}</a>
                <a href="#pricing" onClick={() => setMenuOpen(false)} className="rounded-lg px-4 py-3 text-white/70 transition-colors hover:bg-white/5 hover:text-white">{t('nav.pricing')}</a>
                <Link to="/templates" onClick={() => setMenuOpen(false)} className="rounded-lg px-4 py-3 text-white/70 transition-colors hover:bg-white/5 hover:text-white">{t('nav.templates')}</Link>
                <div className="my-2 h-px bg-white/10" />
                <Link to="/login" onClick={() => setMenuOpen(false)} className="rounded-lg px-4 py-3 text-white/70 transition-colors hover:bg-white/5 hover:text-white">{t('nav.login')}</Link>
                <Link
                  to="/login?mode=signup"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 rounded-full px-4 py-3 text-center font-semibold"
                  style={{ backgroundColor: GOLD, color: BG }}
                >
                  {t('nav.signup')}
                </Link>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
