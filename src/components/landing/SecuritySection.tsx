import { motion } from 'framer-motion';
import { Shield, Lock, Eye, Server } from 'lucide-react';

const securityFeatures = [
  { icon: Shield, title: 'Enterprise-grade security', description: 'Bank-level encryption protects all your data' },
  { icon: Lock, title: 'HTTPS everywhere', description: 'All connections are encrypted end-to-end' },
  { icon: Eye, title: 'Privacy first', description: 'We never sell your data or visitor information' },
  { icon: Server, title: '99.9% uptime SLA', description: 'Your page is always online when you need it' }
];

export function SecuritySection() {
  return (
    <section className="py-24 px-4 relative mesh-gradient-soft noise-overlay">
      <div className="container max-w-6xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <Shield className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-500">Security & Privacy</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">Your data is safe with us</h2>
            <p className="text-lg text-muted-foreground mb-8">
              We take security seriously. Your pages, analytics, and visitor data are protected 
              with industry-leading security practices.
            </p>

            <div className="grid sm:grid-cols-2 gap-6">
              {securityFeatures.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="flex gap-3"
                >
                  <div className="p-2 rounded-lg bg-primary/10 h-fit">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">{feature.title}</h4>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-square max-w-md mx-auto rounded-3xl glass-card border-primary/10 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-primary/10" />
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-green-500/20 flex items-center justify-center backdrop-blur-sm">
                  <Shield className="h-16 w-16 text-green-500" />
                </div>
                
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0"
                >
                  <Lock className="absolute -top-8 left-1/2 -translate-x-1/2 h-6 w-6 text-primary" />
                  <Eye className="absolute top-1/2 -right-8 -translate-y-1/2 h-6 w-6 text-accent" />
                  <Server className="absolute -bottom-8 left-1/2 -translate-x-1/2 h-6 w-6 text-primary" />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
