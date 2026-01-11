import { motion } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';
import { Instagram, Youtube, Globe } from 'lucide-react';
import mockupCreatorPhoto from '@/assets/mockup-creator-photo.jpg';

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
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-background rounded-b-2xl z-20" />
              
              {/* Screen content */}
              <div className="absolute inset-4 top-8 bg-gradient-to-b from-amber-100 to-amber-50 rounded-[2rem] flex flex-col overflow-hidden">
                {/* Header image area - taller to show more */}
                <div className="w-full h-52 relative overflow-hidden flex-shrink-0">
                  <img 
                    src={mockupCreatorPhoto} 
                    alt="Creator profile" 
                    className="w-full h-full object-cover object-top"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-amber-50/95" />
                </div>
                
                {/* Profile section */}
                <div className="relative -mt-8 flex flex-col items-center px-3 w-full flex-1">
                  <h3 className="font-bold text-gray-800 text-base">{t('solution.mockup.name')}</h3>
                  <p className="text-xs text-gray-600 text-center mb-3">{t('solution.mockup.bio')}</p>
                  
                  {/* Link buttons with social media icons */}
                  <div className="w-full space-y-1.5 px-1">
                    <div className="w-full h-10 bg-white rounded-full flex items-center pl-1 pr-3 shadow-sm border border-gray-100">
                      <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                        </svg>
                      </div>
                      <span className="text-gray-700 text-xs font-medium flex-1 text-center">TikTok</span>
                    </div>
                    <div className="w-full h-10 bg-white rounded-full flex items-center pl-1 pr-3 shadow-sm border border-gray-100">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                        <Instagram className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-gray-700 text-xs font-medium flex-1 text-center">Instagram</span>
                    </div>
                    <div className="w-full h-10 bg-white rounded-full flex items-center pl-1 pr-3 shadow-sm border border-gray-100">
                      <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                        <Youtube className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-gray-700 text-xs font-medium flex-1 text-center">YouTube</span>
                    </div>
                    <div className="w-full h-10 bg-white rounded-full flex items-center pl-1 pr-3 shadow-sm border border-gray-100">
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <Globe className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-gray-700 text-xs font-medium flex-1 text-center">Green World</span>
                    </div>
                  </div>
                  
                  {/* TitiLinks branding at bottom */}
                  <div className="mt-auto pb-2 pt-2">
                    <p className="text-[10px] text-gray-500">
                      <span className="text-gray-700">Titi</span>
                      <span className="italic text-amber-600">Links</span>
                    </p>
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
