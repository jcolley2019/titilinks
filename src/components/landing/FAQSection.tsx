import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  { question: 'Is TitiLINKS really free?', answer: 'Yes! Our free tier includes unlimited links, basic analytics, and beautiful themes. No credit card required. Upgrade to Pro only if you need advanced features like mode switching and custom domains.' },
  { question: 'How fast will my page load?', answer: 'We optimize for speed obsessively. Average load times are under 100ms globally. Your visitors see your content before they can blink, which means they stay longer and click more.' },
  { question: 'What is mode switching?', answer: 'Mode switching lets you show different content to different audiences. For example, show your product catalog to shoppers, and your portfolio to potential employers—all from the same link.' },
  { question: 'Can I use my own domain?', answer: 'Yes! Pro and Business plans include custom domain support. Connect your own domain (like links.yourname.com) for a fully branded experience.' },
  { question: 'How do analytics work?', answer: 'We track every view, click, and interaction on your page. See where your traffic comes from, which links perform best, and how visitors engage with your content—all in real-time.' },
  { question: 'Can I switch plans anytime?', answer: 'Absolutely. Upgrade, downgrade, or cancel anytime. No long-term contracts, no hidden fees. If you downgrade, you keep access to Pro features until your billing period ends.' }
];

export function FAQSection() {
  return (
    <section className="py-28 px-4 relative" style={{ background: 'hsl(30 15% 6%)' }}>
      <div className="container max-w-3xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">Frequently asked questions</h2>
          <p className="text-white/55 text-lg font-body">Everything you need to know about TitiLINKS</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="rounded-2xl p-6"
          style={{ background: 'hsl(30 12% 10%)', border: '1px solid hsl(43 65% 55% / 0.2)' }}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} style={{ borderColor: 'hsl(43 65% 55% / 0.2)' }}>
                <AccordionTrigger className="text-left hover:no-underline text-white font-body font-medium [&>svg]:text-[hsl(43,65%,55%)]">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-white/55 font-body leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
