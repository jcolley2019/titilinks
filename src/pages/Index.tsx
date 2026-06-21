import { Navbar } from '@/components/landing/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { BlocksSection } from '@/components/landing/BlocksSection';
import { MakeItYoursSection } from '@/components/landing/MakeItYoursSection';
import { KnowWhatWorksSection } from '@/components/landing/KnowWhatWorksSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { Footer } from '@/components/landing/Footer';

const Index = () => {
  return (
    <div className="relative min-h-screen overflow-x-hidden text-foreground" style={{ backgroundColor: 'hsl(30 15% 6%)' }}>
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
