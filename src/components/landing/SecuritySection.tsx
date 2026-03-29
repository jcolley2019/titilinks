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
    <section className="py-28 px-4 relative noise-overlay" style={{ background: 'hsl(30 12% 10%)' }}>
      <div className="container max-w-6xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ background: 'hsl(43 65% 55% / 0.1)', border: '1px solid hsl(43 65% 55% / 0.2)' }}>
              <Shield className="h-4 w-4" style={{ color: 'hsl(43 65% 55%)' }} />
              <span className="section-label">Security & Privacy</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-white">Your data is safe with us</h2>
            <p className="text-lg text-white/55 mb-8 font-body leading-relaxed">
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
                  className="flex gap-3 p-3 rounded-xl"
                  style={{ background: 'hsl(30 15% 6%)', border: '1px solid hsl(43 65% 55% / 0.2)' }}
                >
                  <div className="p-2 rounded-lg h-fit" style={{ background: 'hsl(43 65% 55% / 0.1)' }}>
                    <feature.icon className="h-5 w-5" style={{ color: 'hsl(43 65% 55%)' }} />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1 text-white font-body">{feature.title}</h4>
                    <p className="text-sm text-white/55 font-body">{feature.description}</p>
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
            <div className="aspect-square max-w-md mx-auto rounded-3xl flex items-center justify-center overflow-hidden" style={{ background: 'hsl(30 15% 6%)', border: '1px solid hsl(43 65% 55% / 0.2)' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(43_65%_55%_/_0.1)] via-transparent to-[hsl(43_65%_55%_/_0.05)]" />
              <div className="relative">
                <div className="w-32 h-32 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ background: 'hsl(43 65% 55% / 0.15)' }}>
                  <Shield className="h-16 w-16" style={{ color: 'hsl(43 65% 55%)' }} />
                </div>

                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0"
                >
                  <Lock className="absolute -top-8 left-1/2 -translate-x-1/2 h-6 w-6" style={{ color: 'hsl(43 65% 55%)' }} />
                  <Eye className="absolute top-1/2 -right-8 -translate-y-1/2 h-6 w-6" style={{ color: 'hsl(43 65% 55% / 0.7)' }} />
                  <Server className="absolute -bottom-8 left-1/2 -translate-x-1/2 h-6 w-6" style={{ color: 'hsl(43 65% 55%)' }} />
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
