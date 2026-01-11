import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { useLanguage } from '@/hooks/useLanguage';

interface Template {
  id: string;
  name: string;
  description: string;
  previewImage: string;
  colors: string[];
}

const categoryTemplates: Record<string, Template[]> = {
  fashion: [
    { id: 'fashion-1', name: 'Runway', description: 'Elegant and minimal for fashion influencers', previewImage: 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=600&fit=crop', colors: ['#1a1a1a', '#f5f5f5', '#d4af37'] },
    { id: 'fashion-2', name: 'Boutique', description: 'Sophisticated look for clothing brands', previewImage: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=400&h=600&fit=crop', colors: ['#2d2d2d', '#faf0e6', '#c9a86c'] },
    { id: 'fashion-3', name: 'Vogue', description: 'Bold and modern fashion template', previewImage: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=600&fit=crop', colors: ['#000000', '#ffffff', '#ff1493'] },
  ],
  healthFitness: [
    { id: 'fitness-1', name: 'Strength', description: 'Powerful design for fitness coaches', previewImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=600&fit=crop', colors: ['#1a1a2e', '#00ff88', '#ffffff'] },
    { id: 'fitness-2', name: 'Zen', description: 'Calm and peaceful for yoga instructors', previewImage: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=600&fit=crop', colors: ['#f5f0e8', '#6b8e23', '#2f4f4f'] },
    { id: 'fitness-3', name: 'Energy', description: 'Dynamic template for personal trainers', previewImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=600&fit=crop', colors: ['#ff6b35', '#1a1a1a', '#ffffff'] },
  ],
  influencer: [
    { id: 'influencer-1', name: 'Glow', description: 'Aesthetic design for content creators', previewImage: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=600&fit=crop', colors: ['#ffd1dc', '#ff69b4', '#ffffff'] },
    { id: 'influencer-2', name: 'Creator', description: 'Clean layout for multi-platform influencers', previewImage: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=400&h=600&fit=crop', colors: ['#667eea', '#764ba2', '#f8f9fa'] },
    { id: 'influencer-3', name: 'Viral', description: 'Eye-catching template for trending creators', previewImage: 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?w=400&h=600&fit=crop', colors: ['#00f5d4', '#9b5de5', '#000000'] },
  ],
  marketing: [
    { id: 'marketing-1', name: 'Agency', description: 'Professional template for marketing agencies', previewImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=600&fit=crop', colors: ['#2c3e50', '#3498db', '#ffffff'] },
    { id: 'marketing-2', name: 'Growth', description: 'Conversion-focused design', previewImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=600&fit=crop', colors: ['#00c853', '#1a1a1a', '#f5f5f5'] },
    { id: 'marketing-3', name: 'Brand', description: 'Sleek template for brand managers', previewImage: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=400&h=600&fit=crop', colors: ['#6366f1', '#1e1b4b', '#ffffff'] },
  ],
  music: [
    { id: 'music-1', name: 'Vinyl', description: 'Retro vibes for musicians', previewImage: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=600&fit=crop', colors: ['#1a1a1a', '#ff6600', '#ffd700'] },
    { id: 'music-2', name: 'Beats', description: 'Modern template for DJs and producers', previewImage: 'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?w=400&h=600&fit=crop', colors: ['#0f0f0f', '#ff00ff', '#00ffff'] },
    { id: 'music-3', name: 'Acoustic', description: 'Warm design for singer-songwriters', previewImage: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&h=600&fit=crop', colors: ['#8b4513', '#f4e4bc', '#2d1810'] },
  ],
  smallBusiness: [
    { id: 'business-1', name: 'Storefront', description: 'Perfect for local businesses', previewImage: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=600&fit=crop', colors: ['#2d5016', '#f5f5dc', '#8b4513'] },
    { id: 'business-2', name: 'Craft', description: 'Handmade feel for artisan shops', previewImage: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=600&fit=crop', colors: ['#d4a574', '#ffffff', '#333333'] },
    { id: 'business-3', name: 'Professional', description: 'Clean design for service businesses', previewImage: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=600&fit=crop', colors: ['#1e3a5f', '#ffffff', '#f0f4f8'] },
  ],
  socialMedia: [
    { id: 'social-1', name: 'Grid', description: 'Instagram-inspired layout', previewImage: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=400&h=600&fit=crop', colors: ['#833ab4', '#fd1d1d', '#fcb045'] },
    { id: 'social-2', name: 'Stories', description: 'Story-focused design', previewImage: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=400&h=600&fit=crop', colors: ['#1da1f2', '#14171a', '#ffffff'] },
    { id: 'social-3', name: 'Feed', description: 'Content-rich template', previewImage: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&h=600&fit=crop', colors: ['#fe2c55', '#000000', '#ffffff'] },
  ],
  sports: [
    { id: 'sports-1', name: 'Champion', description: 'Bold design for athletes', previewImage: 'https://images.unsplash.com/photo-1461896836934- voices-0bc5d407a561?w=400&h=600&fit=crop', colors: ['#1a1a1a', '#ff0000', '#ffffff'] },
    { id: 'sports-2', name: 'Team', description: 'Perfect for sports teams', previewImage: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=600&fit=crop', colors: ['#003087', '#ffd700', '#ffffff'] },
    { id: 'sports-3', name: 'Active', description: 'Dynamic template for sports brands', previewImage: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400&h=600&fit=crop', colors: ['#00ff00', '#000000', '#ffffff'] },
  ],
  telegram: [
    { id: 'telegram-1', name: 'Channel', description: 'For Telegram channel owners', previewImage: 'https://images.unsplash.com/photo-1611606063065-ee7946f0787a?w=400&h=600&fit=crop', colors: ['#0088cc', '#ffffff', '#1a1a1a'] },
    { id: 'telegram-2', name: 'Community', description: 'Community-focused design', previewImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=600&fit=crop', colors: ['#229ed9', '#1a1a1a', '#f5f5f5'] },
    { id: 'telegram-3', name: 'Bot', description: 'For Telegram bot creators', previewImage: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=600&fit=crop', colors: ['#0088cc', '#2b5278', '#ffffff'] },
  ],
  whatsapp: [
    { id: 'whatsapp-1', name: 'Business', description: 'WhatsApp Business ready', previewImage: 'https://images.unsplash.com/photo-1611606063065-ee7946f0787a?w=400&h=600&fit=crop', colors: ['#25d366', '#ffffff', '#075e54'] },
    { id: 'whatsapp-2', name: 'Catalog', description: 'Product catalog focused', previewImage: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=600&fit=crop', colors: ['#128c7e', '#dcf8c6', '#075e54'] },
    { id: 'whatsapp-3', name: 'Support', description: 'Customer support template', previewImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=600&fit=crop', colors: ['#25d366', '#ece5dd', '#1a1a1a'] },
  ],
};

const categoryNames: Record<string, string> = {
  fashion: 'Fashion',
  healthFitness: 'Health and Fitness',
  influencer: 'Influencer and Creator',
  marketing: 'Marketing',
  music: 'Music',
  smallBusiness: 'Small Business',
  socialMedia: 'Social Media',
  sports: 'Sports',
  telegram: 'Telegram',
  whatsapp: 'Whatsapp',
};

export default function TemplateCategory() {
  const { category } = useParams<{ category: string }>();
  const { t } = useLanguage();
  
  const templates = category ? categoryTemplates[category] || [] : [];
  const categoryName = category ? (t(`templates.category.${category}`) || categoryNames[category] || category) : '';

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-24 pb-16">
        <div className="container max-w-6xl mx-auto px-4">
          {/* Back Link */}
          <Link 
            to="/templates" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('templates.backToCategories')}
          </Link>

          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="text-primary italic">{categoryName}</span> {t('templates.categoryTitle')}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('templates.categorySubtitle')}
            </p>
          </motion.div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {templates.map((template, index) => (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * index }}
                className="group"
              >
                <div className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                  {/* Preview Image */}
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <img 
                      src={template.previewImage} 
                      alt={template.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <Button variant="secondary" className="gap-2">
                        <Eye className="h-4 w-4" />
                        {t('templates.preview')}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Template Info */}
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-lg text-foreground">{template.name}</h3>
                      {/* Color Swatches */}
                      <div className="flex gap-1">
                        {template.colors.map((color, i) => (
                          <div 
                            key={i}
                            className="w-4 h-4 rounded-full border border-border"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">{template.description}</p>
                    <Button asChild className="w-full gradient-gold text-primary-foreground">
                      <Link to="/login">{t('templates.useTemplate')}</Link>
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* No Templates Message */}
          {templates.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <p className="text-muted-foreground text-lg">
                {t('templates.noTemplates')}
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/templates">{t('templates.backToCategories')}</Link>
              </Button>
            </motion.div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
