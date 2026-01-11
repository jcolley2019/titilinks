import { motion } from 'framer-motion';

const stats = [
  { value: '47%', label: 'Higher CTR', description: 'vs. traditional bio links' },
  { value: '2.8x', label: 'More Conversions', description: 'with mode switching' },
  { value: '89ms', label: 'Avg Load Time', description: 'globally distributed' }
];

export function StatsSection() {
  return (
    <section className="py-24 px-4">
      <div className="container max-w-6xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-border p-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Results that speak
            </h2>
            <p className="text-muted-foreground text-lg">
              Real numbers from real creators
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 text-center">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <p className="text-5xl sm:text-6xl font-bold gradient-text mb-2">
                  {stat.value}
                </p>
                <p className="text-xl font-semibold mb-1">{stat.label}</p>
                <p className="text-sm text-muted-foreground">{stat.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
