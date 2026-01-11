import { motion } from 'framer-motion';
import { AlertCircle, Clock, BarChart3 } from 'lucide-react';

const problems = [
  {
    icon: AlertCircle,
    title: "Scattered links, lost sales",
    description: "Your audience clicks away before they find what matters. Multiple links mean multiple chances to lose them."
  },
  {
    icon: Clock,
    title: "Hours wasted on setup",
    description: "Building a website takes weeks. Updating it takes hours. Your content moves faster than your tools."
  },
  {
    icon: BarChart3,
    title: "No idea what's working",
    description: "You're flying blind. Which links convert? Where do visitors drop off? Traditional bios tell you nothing."
  }
];

export function ProblemSection() {
  return (
    <section className="py-24 px-4 bg-muted/30">
      <div className="container max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Sound familiar?
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Most creators struggle with the same frustrating problems
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {problems.map((problem, index) => (
            <motion.div
              key={problem.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative p-8 rounded-2xl bg-card border border-border hover:border-destructive/50 transition-colors group"
            >
              <div className="p-3 rounded-xl bg-destructive/10 w-fit mb-4 group-hover:bg-destructive/20 transition-colors">
                <problem.icon className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{problem.title}</h3>
              <p className="text-muted-foreground">{problem.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
