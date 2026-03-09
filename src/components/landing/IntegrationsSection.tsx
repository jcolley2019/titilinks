import { motion } from 'framer-motion';
import { Instagram, Youtube, ShoppingCart, Music, MessageCircle } from 'lucide-react';
import { ReactNode } from 'react';

interface Integration {
  name: string;
  icon: ReactNode;
}

const integrations: Integration[] = [
  { name: 'TikTok', icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg> },
  { name: 'Instagram', icon: <Instagram className="w-5 h-5 text-pink-500" /> },
  { name: 'YouTube', icon: <Youtube className="w-5 h-5 text-red-500" /> },
  { name: 'Shopify', icon: <ShoppingCart className="w-5 h-5 text-green-500" /> },
  { name: 'Spotify', icon: <Music className="w-5 h-5 text-green-400" /> },
  { name: 'Twitter/X', icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
  { name: 'Discord', icon: <MessageCircle className="w-5 h-5 text-indigo-400" /> },
  { name: 'Kick', icon: <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.9 3.45L12 11.08 5.1 7.63 12 4.18zM4 8.82l7 3.5v7.36l-7-3.5V8.82zm9 10.86v-7.36l7-3.5v7.36l-7 3.5z"/></svg> },
];

export function IntegrationsSection() {
  return (
    <section className="py-24 px-4 relative mesh-gradient-rich">
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Works with your stack</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Connect to all the platforms you already use
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto"
        >
          {integrations.map((integration, index) => (
            <motion.div
              key={integration.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl glass-card hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/5"
            >
              {integration.icon}
              <span className="font-medium">{integration.name}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-center text-muted-foreground mt-8"
        >
          ...and many more coming soon
        </motion.p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
