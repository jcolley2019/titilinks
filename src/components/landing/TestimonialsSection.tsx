import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

const testimonials = [
  {
    name: 'Jasmine Torres',
    handle: '@jasfit',
    platform: '🎵 TikTok Creator',
    avatar: 'https://ui-avatars.com/api/?name=Jasmine+Torres&background=C9A55C&color=fff',
    content: 'I went from 200 to 12,000 link clicks in one month. TitiLINKS made my bio actually convert — my merch sales tripled overnight.',
    rating: 5
  },
  {
    name: 'Nicole Bray',
    handle: '@shopnikki',
    platform: '📸 Instagram Boutique',
    avatar: 'https://ui-avatars.com/api/?name=Nicole+Bray&background=C9A55C&color=fff',
    content: 'My customers used to DM me for links. Now they tap one link and see every product, organized beautifully. Revenue is up 40% since switching.',
    rating: 5
  },
  {
    name: 'David Park',
    handle: '@coachdpark',
    platform: '💪 Fitness Coach',
    avatar: 'https://ui-avatars.com/api/?name=David+Park&background=C9A55C&color=fff',
    content: 'The dual-page feature is genius. My clients see workout plans, my prospects see how to join my coaching program. One link, two audiences.',
    rating: 5
  },
  {
    name: 'Aaliyah Monroe',
    handle: '@glowbyali',
    platform: '💄 Beauty Influencer',
    avatar: 'https://ui-avatars.com/api/?name=Aaliyah+Monroe&background=C9A55C&color=fff',
    content: 'The product cards look so premium — my followers think I have a whole website. Set it up in literally 5 minutes with the AI assistant.',
    rating: 5
  },
  {
    name: 'Chris & Maria Vega',
    handle: '@vegateam',
    platform: '🤝 Network Marketers',
    avatar: 'https://ui-avatars.com/api/?name=Chris+Vega&background=C9A55C&color=fff',
    content: 'We replaced three different tools with TitiLINKS. Recruit page for team building, shop page for products. Our downline grew 60% in two months.',
    rating: 5
  },
  {
    name: 'Marcus Webb',
    handle: '@realtalkmarcus',
    platform: '🎙️ Podcast Host',
    avatar: 'https://ui-avatars.com/api/?name=Marcus+Webb&background=C9A55C&color=fff',
    content: 'Every platform, every episode, every sponsor — all in one gorgeous page. My listeners always know exactly where to find me.',
    rating: 5
  }
];

export function TestimonialsSection() {
  const { t } = useLanguage();

  return (
    <section className="py-24 px-4 relative mesh-gradient-rich noise-overlay">
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t('testimonials.title')} <span className="italic gradient-text">{t('testimonials.title2')}</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('testimonials.subtitle')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="p-6 rounded-2xl glass-card hover:shadow-lg hover:shadow-primary/5 transition-all"
            >
              <div className="flex gap-1 mb-3">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-foreground mb-5 italic leading-relaxed">&ldquo;{testimonial.content}&rdquo;</p>
              <div className="flex items-center gap-3">
                <img
                  src={testimonial.avatar}
                  alt={testimonial.name}
                  className="w-10 h-10 rounded-full border border-primary/30"
                />
                <div>
                  <p className="font-semibold text-sm">{testimonial.name} <span className="text-muted-foreground font-normal">{testimonial.handle}</span></p>
                  <p className="text-xs text-muted-foreground">{testimonial.platform}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
