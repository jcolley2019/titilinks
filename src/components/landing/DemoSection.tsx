import { motion } from 'framer-motion';
import { Play, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DemoSection() {
  return (
    <section id="demo" className="py-24 px-4 relative mesh-gradient-soft noise-overlay">
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            See <span className="text-foreground">Titi</span><span className="italic text-primary">Links</span> in action
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Watch how creators are using <span className="text-foreground">Titi</span><span className="italic text-primary">Links</span> to grow their business
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative max-w-4xl mx-auto"
        >
          {/* Video placeholder */}
          <div className="aspect-video rounded-2xl glass-card overflow-hidden relative group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10" />
            
            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full gradient-gold flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-primary/30">
                <Play className="h-8 w-8 text-primary-foreground ml-1" fill="currentColor" />
              </div>
            </div>

            {/* Mock UI elements */}
            <div className="absolute top-4 left-4 flex gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
            </div>

            <div className="absolute bottom-4 left-4 right-4 h-12 bg-foreground/5 rounded-lg backdrop-blur-sm" />
          </div>

          <div className="flex justify-center mt-8">
            <Button variant="outline" size="lg" className="rounded-full glass border-primary/20">
              <ExternalLink className="mr-2 h-4 w-4" />
              View live example
            </Button>
          </div>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
