import { motion } from 'framer-motion';

const integrations = [
  { name: 'TikTok', emoji: '📱' },
  { name: 'Instagram', emoji: '📸' },
  { name: 'YouTube', emoji: '▶️' },
  { name: 'Shopify', emoji: '🛒' },
  { name: 'Stripe', emoji: '💳' },
  { name: 'Spotify', emoji: '🎵' },
  { name: 'Twitter/X', emoji: '🐦' },
  { name: 'Discord', emoji: '💬' },
];

export function IntegrationsSection() {
  return (
    <section className="py-24 px-4">
      <div className="container max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Works with your stack
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Connect to all the platforms you already use
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-4"
        >
          {integrations.map((integration, index) => (
            <motion.div
              key={integration.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="flex items-center gap-3 px-6 py-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
            >
              <span className="text-2xl">{integration.emoji}</span>
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
    </section>
  );
}
