import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Fashion Influencer',
    avatar: 'SC',
    content: 'TitiLINKS doubled my click-through rate in the first week. The analytics are game-changing.',
    rating: 5
  },
  {
    name: 'Marcus Johnson',
    role: 'Music Producer',
    avatar: 'MJ',
    content: 'Finally a link-in-bio that loads fast and looks professional. My fans love the clean design.',
    rating: 5
  },
  {
    name: 'Emma Rodriguez',
    role: 'Digital Creator',
    avatar: 'ER',
    content: 'The mode switching feature is brilliant. I show products to shoppers and booking links to clients.',
    rating: 5
  }
];

export function TestimonialsSection() {
  return (
    <section className="py-24 px-4 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/30 to-background" />
      
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Loved by <span className="italic gradient-text">creators</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Join thousands of creators who've upgraded their bio link
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="p-6 rounded-2xl bg-card border border-border"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-foreground mb-6 italic">&ldquo;{testimonial.content}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary">{testimonial.avatar}</span>
                </div>
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
