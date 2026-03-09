import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

const features = [
  { feature: 'Unlimited links', titilinks: true, linktree: true, others: true },
  { feature: 'Custom themes', titilinks: true, linktree: 'paid', others: 'limited' },
  { feature: 'Advanced analytics', titilinks: true, linktree: 'paid', others: false },
  { feature: 'Mode switching', titilinks: true, linktree: false, others: false },
  { feature: 'Sub-100ms load time', titilinks: true, linktree: false, others: false },
  { feature: 'Product cards', titilinks: true, linktree: 'paid', others: 'limited' },
  { feature: 'QR codes', titilinks: true, linktree: 'paid', others: 'paid' },
  { feature: 'Short links', titilinks: true, linktree: false, others: 'limited' },
  { feature: 'Free tier', titilinks: true, linktree: true, others: 'limited' },
];

function CellValue({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="h-5 w-5 text-green-500 mx-auto" />;
  if (value === false) return <X className="h-5 w-5 text-muted-foreground/50 mx-auto" />;
  return <span className="text-sm text-muted-foreground">{value}</span>;
}

export function ComparisonSection() {
  return (
    <section className="py-24 px-4 relative mesh-gradient-soft noise-overlay">
      <div className="container max-w-4xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">How we compare</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            See why creators are switching to <span className="text-foreground">Titi</span><span className="italic text-primary">Links</span>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="overflow-x-auto rounded-2xl glass-card p-1"
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-4 px-4 font-semibold">Feature</th>
                <th className="text-center py-4 px-4">
                  <span className="font-bold"><span className="text-foreground">Titi</span><span className="italic text-primary">Links</span></span>
                </th>
                <th className="text-center py-4 px-4 text-muted-foreground">Linktree</th>
                <th className="text-center py-4 px-4 text-muted-foreground">Others</th>
              </tr>
            </thead>
            <tbody>
              {features.map((row) => (
                <tr key={row.feature} className="border-b border-border/30">
                  <td className="py-4 px-4">{row.feature}</td>
                  <td className="py-4 px-4 text-center bg-primary/5 rounded-sm">
                    <CellValue value={row.titilinks} />
                  </td>
                  <td className="py-4 px-4 text-center"><CellValue value={row.linktree} /></td>
                  <td className="py-4 px-4 text-center"><CellValue value={row.others} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
