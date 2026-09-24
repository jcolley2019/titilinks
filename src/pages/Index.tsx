import { Navbar } from '@/components/landing/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { BlocksSection } from '@/components/landing/BlocksSection';
import { MakeItYoursSection } from '@/components/landing/MakeItYoursSection';
import { KnowWhatWorksSection } from '@/components/landing/KnowWhatWorksSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { Footer } from '@/components/landing/Footer';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '@/hooks/useLanguage';

const Index = () => {
  const { t } = useLanguage();
  return (
    <div className="relative min-h-screen overflow-x-hidden text-foreground" style={{ backgroundColor: 'hsl(30 15% 6%)' }}>
      <Helmet>
        <title>{t('seo.home.title')}</title>
        <meta name="description" content={t('seo.home.desc')} />
        <link rel="canonical" href="https://www.titilinks.com/" />
        <meta property="og:title" content={t('seo.home.title')} />
        <meta property="og:description" content={t('seo.home.desc')} />
        <meta property="og:url" content="https://www.titilinks.com/" />
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
