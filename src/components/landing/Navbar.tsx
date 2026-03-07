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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-background/90 backdrop-blur-lg border-b border-border' : ''
      }`}
    >
      <div className="container max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xl font-bold">
              Titi<span className="italic text-primary">Links</span>
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
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
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
                    className="absolute top-full left-0 mt-2 w-56 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-50"
                  >
                    {products.map((product) => (
                      <a
                        key={product.key}
                        href={product.href}
                        className="flex items-center gap-3 px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        onClick={() => setIsProductsOpen(false)}
                      >
                        <product.icon className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium text-foreground">{t(`nav.products.${product.key}`)}</div>
                          <div className="text-xs text-muted-foreground">{t(`nav.products.${product.key}.desc`)}</div>
                        </div>
                      </a>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Link to="/templates" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('nav.templates')}
            </Link>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('nav.pricing')}
            </a>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground">
              <Link to="/login">{t('nav.login')}</Link>
            </Button>
            <Button asChild className="gradient-gold text-primary-foreground rounded-full px-6">
              <Link to="/login">{t('nav.signup')}</Link>
            </Button>
            <LanguageToggle />
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <LanguageToggle />
            <button
              className="p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Mobile fullscreen overlay menu – Apple style */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 md:hidden"
          >
            {/* Backdrop blur */}
            <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="relative z-10 flex flex-col h-full pt-6 pb-10 px-6"
            >
              {/* Close / Back button */}
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-2 text-primary mb-6 active:opacity-60 transition-opacity self-start"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
                <span className="text-[15px] font-medium">Close</span>
              </button>
              {/* Nav links */}
              <nav className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 px-1">
                  {t('nav.products')}
                </span>
                {products.map((product, i) => (
                  <motion.a
                    key={product.key}
                    href={product.href}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * i, duration: 0.25 }}
                    className="flex items-center gap-3 py-3.5 px-1 rounded-xl text-foreground/80 active:bg-muted/40 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <product.icon className="h-[18px] w-[18px] text-primary" />
                    </div>
                    <span className="text-[17px] font-medium">{t(`nav.products.${product.key}`)}</span>
                  </motion.a>
                ))}

                <div className="h-px bg-border/50 my-3" />

                <motion.div
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25, duration: 0.25 }}
                >
                  <Link
                    to="/templates"
                    className="flex items-center py-3.5 px-1 rounded-xl text-foreground/80 active:bg-muted/40 transition-colors text-[17px] font-medium"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {t('nav.templates')}
                  </Link>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3, duration: 0.25 }}
                >
                  <a
                    href="#pricing"
                    className="flex items-center py-3.5 px-1 rounded-xl text-foreground/80 active:bg-muted/40 transition-colors text-[17px] font-medium"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {t('nav.pricing')}
                  </a>
                </motion.div>
              </nav>

              {/* Spacer */}
              <div className="flex-1" />

              {/* CTAs at bottom */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.3 }}
                className="flex flex-col gap-3"
              >
                <Button
                  asChild
                  variant="outline"
                  className="w-full h-[52px] rounded-2xl text-[17px] font-semibold border-border/60"
                >
                  <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
                    {t('nav.login')}
                  </Link>
                </Button>
                <Button
                  asChild
                  className="w-full h-[52px] rounded-2xl text-[17px] font-semibold gradient-gold text-primary-foreground"
                >
                  <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
                    {t('nav.signup')}
                  </Link>
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
