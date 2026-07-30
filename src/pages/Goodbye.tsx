// BILL.B4 / DELETE.1 — where a deleted account lands.
//
// A PUBLIC route on purpose: by the time anyone gets here the auth user no longer
// exists, so anything behind ProtectedRoute would bounce them to /login and the
// deletion would read as "something went wrong".

import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';

export default function Goodbye() {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md text-center"
        data-testid="goodbye-card"
      >
        <span className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-full bg-primary/10">
          <Heart className="h-7 w-7 text-primary" />
        </span>
        <h1 className="text-2xl font-bold text-foreground" data-testid="goodbye-title">
          {t('goodbye.title')}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t('goodbye.body')}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t('goodbye.deleted')}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="outline">
            <Link to="/">{t('goodbye.home')}</Link>
          </Button>
          <Button asChild className="gradient-primary text-primary-foreground">
            <Link to="/login?mode=signup">{t('goodbye.startOver')}</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
