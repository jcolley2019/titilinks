import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link2, Menu, X } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLanguage } from '@/hooks/useLanguage';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useLanguage();

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
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('nav.products')}
            </a>
            <a href="#demo" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('nav.templates')}
            </a>
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
              <a 
                href="#features" 
                className="text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('nav.products')}
              </a>
              <a 
                href="#demo" 
                className="text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('nav.templates')}
              </a>
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
