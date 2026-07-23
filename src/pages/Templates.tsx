import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { useLanguage } from '@/hooks/useLanguage';
import { PhoneCard, TEMPLATE_EXAMPLES, type Lang } from '@/components/PhoneMockup';
import { TPL_CATEGORIES, type TplCategory } from '@/lib/tpl-presets';

// TPL.PAGE.1 — a gallery of live phone mockups (the hero's seven plus the
// TPL.PAGE.2 templates-only personas), grouped by TPL category. Category chips
// filter client-side; each mockup's "Start with this style" CTA carries the
// persona's preset id into signup, where the Editor applies it post-onboarding.
// The badge (the TitiLinks footer wordmark) renders inside every mockup via the
// shared PhoneMockup renderer.

// Chips derive straight from the persona data: a category gets a chip iff a
// persona carries it (all eight do as of TPL.PAGE.2 — no hardcoded hide list).
// Chip order follows TPL_CATEGORIES.
const presentCategories = new Set(
  TEMPLATE_EXAMPLES.map((e) => e.category).filter(Boolean) as TplCategory[]
);
const visibleCategories = TPL_CATEGORIES.filter((c) => presentCategories.has(c.id));

const CARD_WIDTH = 240;

export default function Templates() {
  const { t, language } = useLanguage();
  const lang: Lang = language === 'es' ? 'es' : 'en';
  const [active, setActive] = useState<TplCategory | 'all'>('all');

  const shown =
    active === 'all' ? TEMPLATE_EXAMPLES : TEMPLATE_EXAMPLES.filter((e) => e.category === active);

  const chips: { id: TplCategory | 'all'; label: string }[] = [
    { id: 'all', label: t('tpl.category.all') },
    ...visibleCategories.map((c) => ({ id: c.id, label: t(c.label) })),
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="container max-w-5xl mx-auto px-4">
          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {t('templates.title')} <span className="text-primary italic">{t('templates.title2')}</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('templates.subtitle')}
            </p>
          </motion.div>

          {/* Category chips */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-wrap justify-center gap-2.5 mb-12"
          >
            {chips.map((chip) => {
              const isActive = active === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  data-testid={`tpl-chip-${chip.id}`}
                  aria-pressed={isActive}
                  onClick={() => setActive(chip.id)}
                  className={
                    'px-5 py-2 rounded-full text-sm font-medium border transition-all duration-300 ' +
                    (isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-foreground border-border hover:border-primary/40 hover:text-primary')
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </motion.div>

          {/* Mockup gallery — swipeable row on mobile, centered wrap (2-3 per row)
              on desktop. */}
          <div
            data-testid="tpl-gallery"
            className="flex gap-8 overflow-x-auto pb-4 snap-x snap-mandatory md:flex-wrap md:justify-center md:overflow-visible md:pb-0"
          >
            {shown.map((ex, index) => (
              <motion.div
                key={ex.key}
                data-testid={`tpl-mockup-${ex.key}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 * index }}
                className="snap-center shrink-0 flex flex-col items-center"
                style={{ width: CARD_WIDTH }}
              >
                <PhoneCard example={ex} lang={lang} displayWidth={CARD_WIDTH} />
                <p className="mt-5 text-base font-semibold text-foreground">{ex.name}</p>
                <Link
                  to={`/login?mode=signup&template=${ex.presetId}`}
                  className="mt-3 w-full"
                >
                  <button
                    type="button"
                    data-testid={`tpl-start-${ex.key}`}
                    className="w-full rounded-full gradient-gold text-primary-foreground text-sm font-semibold px-6 py-2.5 transition-transform duration-150 hover:-translate-y-px active:scale-[0.98]"
                  >
                    {t('templates.startWithStyle')}
                  </button>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
