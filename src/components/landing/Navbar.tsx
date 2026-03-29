import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link2, Menu, X, ChevronDown, LinkIcon, QrCode, ExternalLink } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLanguage } from '@/hooks/useLanguage';
export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const { t } = useLanguage();

  const products = [
    { key: 'linkInBio', icon: LinkIcon, href: '#features' },
    { key: 'linkShortener', icon: ExternalLink, href: '#features' },
    { key: 'qrGenerator', icon: QrCode, href: '#features' },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b"
      style={{
        backgroundColor: 'hsl(30, 15%, 6%)',
        borderColor: 'hsl(43 65% 55% / 0.2)',
      }}
    >
      <div className="container max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-white/10 border border-[hsl(43_65%_55%_/_0.3)]">
              <Link2 className="h-5 w-5 text-[hsl(43,65%,55%)]" />
            </div>
            <span className="text-xl font-bold gradient-text">
              TitiLinks
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <div 
              className="relative"
              onMouseEnter={() => setIsProductsOpen(true)}
              onMouseLeave={() => setIsProductsOpen(false)}
            >
              <button
                className="flex items-center gap-1 text-white/70 hover:text-white transition-colors"
                onClick={() => setIsProductsOpen(!isProductsOpen)}
              >
                {t('nav.products')}
                <ChevronDown className={`h-4 w-4 transition-transform ${isProductsOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {isProductsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 mt-2 w-56 rounded-xl shadow-lg overflow-hidden z-50 border"
                    style={{ backgroundColor: 'hsl(30, 15%, 8%)', borderColor: 'hsl(43 65% 55% / 0.2)' }}
                  >
                    {products.map((product) => (
                      <a
                        key={product.key}
                        href={product.href}
                        className="flex items-center gap-3 px-4 py-3 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                        onClick={() => setIsProductsOpen(false)}
                      >
                        <product.icon className="h-5 w-5 text-[hsl(43,65%,55%)]" />
                        <div>
                          <div className="font-medium text-white">{t(`nav.products.${product.key}`)}</div>
                          <div className="text-xs text-white/50">{t(`nav.products.${product.key}.desc`)}</div>
                        </div>
                      </a>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Link to="/templates" className="text-white/70 hover:text-white transition-colors">
              {t('nav.templates')}
            </Link>
            <a href="#pricing" className="text-white/70 hover:text-white transition-colors">
              {t('nav.pricing')}
            </a>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <Button asChild variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">
              <Link to="/login">{t('nav.login')}</Link>
            </Button>
            <Button asChild className="gradient-primary text-white rounded-full px-6">
              <Link to="/login">{t('nav.signup')}</Link>
            </Button>
            <LanguageToggle />
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <LanguageToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

      </div>

      {/* Mobile Menu Overlay – matches dashboard style */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-40 backdrop-blur-sm"
            style={{ backgroundColor: 'hsla(30, 15%, 6%, 0.8)' }}
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile Slide-out Menu – matches dashboard style */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="md:hidden fixed top-16 right-0 bottom-0 z-50 w-64 border-l"
            style={{ backgroundColor: 'hsl(30, 15%, 8%)', borderColor: 'hsl(43 65% 55% / 0.2)' }}
          >
            <nav className="flex flex-col gap-1 p-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-2 px-4">
                {t('nav.products')}
              </span>
              {products.map((product) => (
                <a
                  key={product.key}
                  href={product.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white/60 hover:bg-white/5 hover:text-white transition-all"
                >
                  <product.icon className="h-5 w-5 text-[hsl(43,65%,55%)]" />
                  <span className="font-medium">{t(`nav.products.${product.key}`)}</span>
                </a>
              ))}

              <div className="h-px bg-white/10 my-2" />

              <Link
                to="/templates"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-white/60 hover:bg-white/5 hover:text-white transition-all"
              >
                <span className="font-medium">{t('nav.templates')}</span>
              </Link>
              <a
                href="#pricing"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-white/60 hover:bg-white/5 hover:text-white transition-all"
              >
                <span className="font-medium">{t('nav.pricing')}</span>
              </a>

              <div className="h-px bg-white/10 my-2" />

              <Link
                to="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-white/60 hover:bg-white/5 hover:text-white transition-all"
              >
                <span className="font-medium">{t('nav.login')}</span>
              </Link>

              <Button
                asChild
                className="mt-2 mx-4 gradient-primary text-white rounded-lg"
              >
                <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
                  {t('nav.signup')}
                </Link>
              </Button>
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
