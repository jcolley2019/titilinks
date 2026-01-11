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

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden py-4 border-t border-border"
          >
            <div className="flex flex-col gap-4">
              <div className="py-2">
                <div className="text-muted-foreground font-medium mb-2">{t('nav.products')}</div>
                <div className="flex flex-col gap-1 pl-2">
                  {products.map((product) => (
                    <a
                      key={product.key}
                      href={product.href}
                      className="flex items-center gap-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <product.icon className="h-4 w-4 text-primary" />
                      <span>{t(`nav.products.${product.key}`)}</span>
                    </a>
                  ))}
                </div>
              </div>
              <Link 
                to="/templates" 
                className="text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('nav.templates')}
              </Link>
              <a 
                href="#pricing" 
                className="text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('nav.pricing')}
              </a>
              <div className="flex flex-col gap-2 pt-4 border-t border-border">
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login">{t('nav.login')}</Link>
                </Button>
                <Button asChild className="w-full gradient-gold text-primary-foreground">
                  <Link to="/login">{t('nav.signup')}</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.nav>
  );
}
