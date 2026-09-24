import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import { marketingPath, routeFromPath } from '@/lib/seo-marketing-html';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const toggleLanguage = () => {
    const next = language === 'en' ? 'es' : 'en';
    setLanguage(next);
    // TL.SEO.I18N.1 — on a marketing route the language is part of the URL:
    // move to the other language's twin, client-side (no reload). Anywhere
    // else the URL stays put, exactly as before.
    const route = routeFromPath(location.pathname);
    if (route) {
      navigate({ pathname: marketingPath(route, next), search: location.search, hash: location.hash });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="rounded-full border-primary/30 hover:bg-foreground hover:text-background hover:border-foreground gap-2 px-3 transition-colors"
    >
      <Globe className="h-4 w-4" />
      <span className="uppercase font-medium">{language === 'en' ? 'EN' : 'ES'}</span>
    </Button>
  );
}
