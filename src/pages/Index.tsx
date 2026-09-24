import { Navbar } from '@/components/landing/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { BlocksSection } from '@/components/landing/BlocksSection';
import { MakeItYoursSection } from '@/components/landing/MakeItYoursSection';
import { KnowWhatWorksSection } from '@/components/landing/KnowWhatWorksSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { Footer } from '@/components/landing/Footer';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import { hreflangLinks, isEsPath, marketingUrl } from '@/lib/seo-marketing-html';

const Index = () => {
  const { t } = useLanguage();
  // TL.SEO.I18N.1 — canonical/og:url follow the URL's language (/ or /es), not the UI language.
  const { pathname } = useLocation();
  const canonical = marketingUrl('/', isEsPath(pathname) ? 'es' : 'en');
  return (
    <div className="relative min-h-screen overflow-x-hidden text-foreground" style={{ backgroundColor: 'hsl(30 15% 6%)' }}>
      <Helmet>
        <title>{t('seo.home.title')}</title>
        <meta name="description" content={t('seo.home.desc')} />
        <link rel="canonical" href={canonical} />
        {hreflangLinks('/').map((l) => (
          <link key={l.hreflang} rel="alternate" hrefLang={l.hreflang} href={l.href} />
        ))}
        <meta property="og:title" content={t('seo.home.title')} />
        <meta property="og:description" content={t('seo.home.desc')} />
        <meta property="og:url" content={canonical} />
      </Helmet>
      <Navbar />
      <HeroSection />
      <BlocksSection />
      <MakeItYoursSection />
      <KnowWhatWorksSection />
      {/* Still to rebuild in the new language: Trust strip → restyle Pricing/Navbar/Footer */}
      <PricingSection />
      <Footer />
    </div>
  );
};

export default Index;
