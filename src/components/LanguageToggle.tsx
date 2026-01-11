import { useLanguage } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'es' : 'en');
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="rounded-full border-primary/30 hover:bg-primary/5 gap-2 px-3"
    >
      <Globe className="h-4 w-4" />
      <span className="uppercase font-medium">{language === 'en' ? 'EN' : 'ES'}</span>
    </Button>
  );
}
