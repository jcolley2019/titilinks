import { motion } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';
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
              <div className="absolute inset-4 top-8 bg-gradient-to-b from-amber-100 to-amber-50 rounded-[2rem] flex flex-col items-center overflow-hidden">
                {/* Header image area */}
                <div className="w-full h-44 relative overflow-hidden">
                  <img 
                    src={mockupCreatorPhoto} 
                    alt="Creator profile" 
                    className="w-full h-full object-cover object-top"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-amber-50/90" />
                </div>
                
                {/* Profile section */}
                <div className="relative -mt-6 flex flex-col items-center px-4 w-full">
                  <h3 className="font-bold text-gray-800 text-lg">{t('solution.mockup.name')}</h3>
                  <p className="text-xs text-gray-600 text-center mb-4">{t('solution.mockup.bio')}</p>
                  
                  {/* Link buttons with circular photo thumbnails */}
                  <div className="w-full space-y-2 px-1">
                    <div className="w-full h-12 bg-white rounded-full flex items-center pl-1 pr-4 shadow-sm border border-gray-100">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        <img src={mockupCreatorPhoto} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-gray-700 text-sm font-medium flex-1 text-center">TikTok</span>
                    </div>
                    <div className="w-full h-12 bg-white rounded-full flex items-center pl-1 pr-4 shadow-sm border border-gray-100">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        <img src={mockupCreatorPhoto} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-gray-700 text-sm font-medium flex-1 text-center">Instagram</span>
                    </div>
                    <div className="w-full h-12 bg-white rounded-full flex items-center pl-1 pr-4 shadow-sm border border-gray-100">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        <img src={mockupCreatorPhoto} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-gray-700 text-sm font-medium flex-1 text-center">YouTube</span>
                    </div>
                    <div className="w-full h-12 bg-white rounded-full flex items-center pl-1 pr-4 shadow-sm border border-gray-100">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        <img src={mockupCreatorPhoto} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-gray-700 text-sm font-medium flex-1 text-center">Green World 🌍</span>
                    </div>
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
