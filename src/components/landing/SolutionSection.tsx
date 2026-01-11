import { motion } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';

export function SolutionSection() {
  const { t } = useLanguage();

  const features = [
    t('solution.feature1'),
    t('solution.feature2'),
    t('solution.feature3'),
    t('solution.feature4')
  ];

  return (
    <section className="py-24 px-4">
      <div className="container max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              {t('solution.title')}{' '}
              <span className="italic gradient-text">{t('solution.title2')}</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              {t('solution.description')}
            </p>
            <ul className="space-y-4">
              {features.map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            {/* Phone mockup with gold accent */}
            <div className="relative mx-auto w-72 h-[580px] bg-card rounded-[3rem] border-2 border-primary/20 shadow-2xl overflow-hidden glow-gold">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-background rounded-b-2xl" />
              
              {/* Screen content */}
              <div className="absolute inset-4 top-8 bg-background rounded-[2rem] flex flex-col items-center justify-center p-6">
                {/* Avatar with gold ring */}
                <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-primary">JD</span>
                </div>
                <div className="h-4 w-32 bg-foreground/20 rounded mb-1" />
                <div className="h-3 w-40 bg-muted-foreground/30 rounded mb-6 text-center text-xs text-muted-foreground">
                  Creator • Entrepreneur • Dreamer
                </div>
                
                {/* Mock buttons with colors */}
                <div className="w-full space-y-3">
                  <div className="w-full h-12 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full flex items-center px-4 gap-3">
                    <div className="w-6 h-6 rounded-full bg-white/20" />
                    <span className="text-white text-sm font-medium">Follow on Instagram</span>
                  </div>
                  <div className="w-full h-12 bg-gradient-to-r from-gray-700 to-gray-800 rounded-full flex items-center px-4 gap-3">
                    <div className="w-6 h-6 rounded-full bg-white/20" />
                    <span className="text-white text-sm font-medium">Watch Latest Video</span>
                  </div>
                  <div className="w-full h-12 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-full flex items-center px-4 gap-3">
                    <div className="w-6 h-6 rounded-full bg-white/20" />
                    <span className="text-white text-sm font-medium">Join the Conversation</span>
                  </div>
                  <div className="w-full h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center px-4 gap-3">
                    <div className="w-6 h-6 rounded-full bg-white/20" />
                    <span className="text-white text-sm font-medium">Listen on Spotify</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating elements */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-4 -right-4 p-4 rounded-xl bg-card border border-primary/20 shadow-lg"
            >
              <p className="text-sm font-medium text-primary">{t('solution.clicks')}</p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
