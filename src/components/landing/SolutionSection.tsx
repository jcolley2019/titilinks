import { motion } from 'framer-motion';
import { Smartphone } from 'lucide-react';

export function SolutionSection() {
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
              Your bio link,{' '}
              <span className="gradient-text">supercharged</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              TitiLINKS transforms your single bio link into a dynamic, trackable storefront 
              that converts followers into customers—in minutes, not months.
            </p>
            <ul className="space-y-4">
              {[
                'Beautiful, mobile-first design',
                'Built-in analytics & tracking',
                'Mode switching for different audiences',
                'Lightning-fast load times'
              ].map((item, i) => (
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
            {/* Phone mockup */}
            <div className="relative mx-auto w-72 h-[580px] bg-card rounded-[3rem] border-4 border-foreground/10 shadow-2xl overflow-hidden">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/10 rounded-b-2xl" />
              
              {/* Screen content */}
              <div className="absolute inset-4 top-8 bg-gradient-to-br from-primary/20 via-background to-accent/20 rounded-[2rem] flex flex-col items-center justify-center p-6">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent mb-4" />
                <div className="h-4 w-32 bg-foreground/20 rounded mb-2" />
                <div className="h-3 w-24 bg-foreground/10 rounded mb-6" />
                
                {/* Mock buttons */}
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-full h-12 bg-foreground/10 rounded-full mb-3 flex items-center px-4 gap-3">
                    <div className="w-8 h-8 rounded-full bg-foreground/20" />
                    <div className="h-3 w-20 bg-foreground/20 rounded" />
                  </div>
                ))}
              </div>
            </div>

            {/* Floating elements */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-4 -right-4 p-4 rounded-xl bg-card border border-border shadow-lg"
            >
              <p className="text-sm font-medium">+127 clicks today</p>
            </motion.div>
            
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -bottom-4 -left-4 p-4 rounded-xl bg-card border border-border shadow-lg"
            >
              <p className="text-sm font-medium">🔥 2.3s avg. session</p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
