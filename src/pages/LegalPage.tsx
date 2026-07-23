import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { useLanguage } from '@/hooks/useLanguage';
import termsEn from '../content/legal/terms-en.md?raw';
import termsEs from '../content/legal/terms-es.md?raw';
import privacyEn from '../content/legal/privacy-en.md?raw';
import privacyEs from '../content/legal/privacy-es.md?raw';

// LEGAL.2 — Terms of Service + Privacy Policy pages. One component renders both
// docs; the route picks which. Copy lives in src/content/legal/*.md, imported
// raw and rendered with react-markdown (remark-gfm autolinks bare emails to
// mailto:). Language follows the site toggle, so switching re-renders the doc.
const DOCS = {
  terms: { en: termsEn, es: termsEs },
  privacy: { en: privacyEn, es: privacyEs },
} as const;

type LegalDoc = keyof typeof DOCS;

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const markdown = DOCS[doc][language];

  // Go back within the app when there is history; a direct visit (no in-app
  // entry) has location.key === 'default', so fall back to the landing page.
  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  };

  useEffect(() => {
    const heading = markdown.split('\n', 1)[0].replace(/^#\s*/, '').trim();
    if (heading) document.title = heading;
  }, [markdown]);

  return (
    <div className="relative min-h-screen text-foreground" style={{ backgroundColor: 'hsl(30 15% 6%)' }}>
      <Navbar />
      <main className="mx-auto max-w-[70ch] px-5 pt-28 pb-24">
        <button
          type="button"
          onClick={goBack}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/55 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('legal.back')}
        </button>
        <article
          className="
            [&_h1]:mb-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-white sm:[&_h1]:text-4xl
            [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white
            [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-white/65
            [&_strong]:font-semibold [&_strong]:text-white
            [&_a]:text-[#C9A55C] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-[#e0bd6f]
            [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6
            [&_li]:leading-relaxed [&_li]:text-white/65
          "
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </main>
      <Footer />
    </div>
  );
}
