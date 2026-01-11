import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { useLanguage } from '@/hooks/useLanguage';
import { 
  Shirt, 
  Dumbbell, 
  Users, 
  TrendingUp, 
  Music, 
  Store, 
  Share2, 
  Trophy,
  Send,
  MessageCircle
} from 'lucide-react';

const categories = [
  { key: 'fashion', icon: Shirt },
  { key: 'healthFitness', icon: Dumbbell },
  { key: 'influencer', icon: Users },
  { key: 'marketing', icon: TrendingUp },
  { key: 'music', icon: Music },
  { key: 'smallBusiness', icon: Store },
  { key: 'socialMedia', icon: Share2 },
  { key: 'sports', icon: Trophy },
  { key: 'telegram', icon: Send },
  { key: 'whatsapp', icon: MessageCircle },
];

export default function Templates() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-24 pb-16">
        <div className="container max-w-6xl mx-auto px-4">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {t('templates.title')} <span className="text-primary italic">{t('templates.title2')}</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('templates.subtitle')}
            </p>
          </motion.div>

          {/* Categories Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto"
          >
            {categories.map((category, index) => (
              <motion.div
                key={category.key}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
              >
                <Link
                  to={`/templates/${category.key}`}
                  className="group flex items-center gap-3 px-6 py-3 bg-muted/50 hover:bg-primary/10 border border-border hover:border-primary/30 rounded-full transition-all duration-300"
                >
                  <category.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {t(`templates.category.${category.key}`)}
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>

          {/* Coming Soon Notice */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="text-center mt-16"
          >
            <p className="text-muted-foreground">
              {t('templates.comingSoon')}
            </p>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
