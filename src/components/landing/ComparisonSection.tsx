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

function CellValue({ value, column }: { value: boolean | string; column?: 'titilinks' | 'linktree' | 'others' }) {
  if (value === true && column === 'titilinks') return <Check className="h-5 w-5 mx-auto" style={{ color: 'hsl(43, 65%, 55%)' }} />;
  if (value === true) return <Check className="h-5 w-5 mx-auto text-white/70" />;
  if (value === false) return <X className="h-5 w-5 text-red-400 mx-auto" />;
  return <span className="text-sm text-white/60">{value}</span>;
}

export function ComparisonSection() {
  return (
    <section className="py-28 px-4 relative noise-overlay" style={{ backgroundColor: 'hsl(30, 15%, 6%)' }}>
      <div className="container max-w-4xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">How we compare</h2>
          <p className="text-white/55 text-lg max-w-2xl mx-auto font-body">
            See why creators are switching to <span className="text-white">Titi</span><span className="italic text-primary">Links</span>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="overflow-x-auto rounded-2xl border p-1"
          style={{ backgroundColor: 'hsl(30, 12%, 10%)', borderColor: 'hsl(43 65% 55% / 0.2)' }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid hsl(43 65% 55% / 0.2)' }}>
                <th className="text-left py-4 px-4 font-semibold text-white font-body">Feature</th>
                <th className="text-center py-4 px-4">
                  <span className="font-bold"><span className="text-white">Titi</span><span className="italic text-primary">Links</span></span>
                </th>
                <th className="text-center py-4 px-4 text-white/80">Linktree</th>
                <th className="text-center py-4 px-4 text-white/80">Others</th>
              </tr>
            </thead>
            <tbody>
              {features.map((row) => (
                <tr key={row.feature} style={{ borderBottom: '1px solid hsl(43 65% 55% / 0.1)' }}>
                  <td className="py-4 px-4 text-white font-body">{row.feature}</td>
                  <td className="py-4 px-4 text-center rounded-sm" style={{ backgroundColor: 'hsl(43 65% 55% / 0.08)' }}>
                    <CellValue value={row.titilinks} column="titilinks" />
                  </td>
                  <td className="py-4 px-4 text-center"><CellValue value={row.linktree} column="linktree" /></td>
                  <td className="py-4 px-4 text-center"><CellValue value={row.others} column="others" /></td>
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
