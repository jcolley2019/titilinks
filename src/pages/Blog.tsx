import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { useLanguage } from '@/hooks/useLanguage';
import { formatPostDate, blogPostPath, postFromPath, type BlogPost } from '@/lib/blog';
import { BLOG_POSTS } from '@/lib/blog-posts';
import {
  blogBodyWithCta,
  blogHreflangLinks,
  blogPostTitle,
  blogPostUrl,
  hreflangLinks,
  isEsPath,
  marketingPath,
  marketingUrl,
} from '@/lib/seo-marketing-html';
import NotFound from './NotFound';

// SEO.TITILINKS.BLOG.1 — /blog, /es/blog (per-language index, newest first) and
// /blog/<slug>, /es/blog/<slug> (one post). The build prerenders the same pages
// from the same files (scripts/prerender-marketing.ts); this is what a reader
// with JavaScript sees once React replaces the no-JS summary. Layout follows
// LegalPage, the site's other long-form page. Like the signup money pages, a
// blog URL pins the UI language to its own, so chrome and post never disagree.

const GOLD = '#C9A55C';
const BG = 'hsl(30 15% 6%)';

const PROSE = `
  [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white
  [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white
  [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-white/65
  [&_strong]:font-semibold [&_strong]:text-white
  [&_a]:text-[#C9A55C] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-[#e0bd6f]
  [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6
  [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6
  [&_li]:leading-relaxed [&_li]:text-white/65
  [&_table]:mb-6 [&_table]:w-full [&_table]:text-sm
  [&_th]:border-b [&_th]:border-white/20 [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-white
  [&_td]:border-b [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-2 [&_td]:align-top [&_td]:text-white/65
`;

/** Internal markdown links navigate in-app; anything else is a plain link. */
function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (href?.startsWith('/')) return <Link to={href}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/55 transition-colors hover:text-white">
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

function PostView({ post }: { post: BlogPost }) {
  const { t } = useLanguage();
  const title = blogPostTitle(post);
  const canonical = blogPostUrl(post.lang, post.slug);
  const signup = marketingPath('/signup', post.lang);
  return (
    <>
      <Helmet>
        <html lang={post.lang} />
        <title>{title}</title>
        <meta name="description" content={post.description} />
        <link rel="canonical" href={canonical} />
        {blogHreflangLinks(post).map((l) => (
          <link key={l.hreflang} rel="alternate" hrefLang={l.hreflang} href={l.href} />
        ))}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={post.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
      </Helmet>
      <BackLink to={marketingPath('/blog', post.lang)} label={t('blog.back')} />
      <article className={PROSE}>
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{post.title}</h1>
        <p className="!mb-8 text-sm !text-white/45">
          <time dateTime={post.date}>{formatPostDate(post.date, post.lang)}</time>
        </p>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
          {blogBodyWithCta(post)}
        </ReactMarkdown>
        {post.faq.length > 0 && (
          <section>
            <h2>{t('seo.faq.heading')}</h2>
            {post.faq.map(({ q, a }) => (
              <div key={q}>
                <h3>{q}</h3>
                <p>{a}</p>
              </div>
            ))}
          </section>
        )}
      </article>
      <section className="mt-12 rounded-2xl border border-white/10 p-6" style={{ backgroundColor: 'hsl(30 15% 8%)' }}>
        <h2 className="text-xl font-semibold text-white">{t('blog.cta.heading')}</h2>
        <p className="mt-2 leading-relaxed text-white/65">{t('seo.signup.sub')}</p>
        <Link
          to={signup}
          className="mt-5 inline-flex rounded-full px-5 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-px active:scale-[0.98]"
          style={{ backgroundColor: GOLD, color: BG }}
        >
          {t('seo.signup.cta')}
        </Link>
      </section>
    </>
  );
}

function IndexView({ lang }: { lang: 'en' | 'es' }) {
  const { t } = useLanguage();
  const posts = BLOG_POSTS.filter((p) => p.lang === lang);
  const canonical = marketingUrl('/blog', lang);
  return (
    <>
      <Helmet>
        <html lang={lang} />
        <title>{t('seo.blog.title')}</title>
        <meta name="description" content={t('seo.blog.desc')} />
        <link rel="canonical" href={canonical} />
        {hreflangLinks('/blog').map((l) => (
          <link key={l.hreflang} rel="alternate" hrefLang={l.hreflang} href={l.href} />
        ))}
        <meta property="og:title" content={t('seo.blog.title')} />
        <meta property="og:description" content={t('seo.blog.desc')} />
        <meta property="og:url" content={canonical} />
      </Helmet>
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{t('blog.h1')}</h1>
      <p className="mb-10 leading-relaxed text-white/65">{t('seo.blog.desc')}</p>
      {posts.length > 0 ? (
        <div className="divide-y divide-white/10 border-y border-white/10">
          {posts.map((p) => (
            <article key={p.slug} className="py-6">
              <h2 className="text-xl font-semibold text-white">
                <Link to={blogPostPath(p.lang, p.slug)} className="transition-colors hover:text-[#e0bd6f]">
                  {p.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-white/45">
                <time dateTime={p.date}>{formatPostDate(p.date, p.lang)}</time>
              </p>
              <p className="mt-3 leading-relaxed text-white/65">{p.description}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="leading-relaxed text-white/65">
          {t('blog.empty')}{' '}
          <Link to={marketingPath('/blog', lang === 'en' ? 'es' : 'en')} className="text-[#C9A55C] underline underline-offset-2 hover:text-[#e0bd6f]">
            {t('blog.otherLang')}
          </Link>
        </p>
      )}
    </>
  );
}

export default function Blog() {
  const { language, setLanguage } = useLanguage();
  const { pathname } = useLocation();
  const urlLang = isEsPath(pathname) ? 'es' : 'en';
  const target = postFromPath(pathname);
  const post = target ? BLOG_POSTS.find((p) => p.lang === target.lang && p.slug === target.slug) : undefined;

  useEffect(() => {
    if (language !== urlLang) setLanguage(urlLang);
  }, [language, urlLang, setLanguage]);

  if (target && !post) return <NotFound />;

  return (
    <div className="relative min-h-screen text-foreground" style={{ backgroundColor: BG }}>
      <Navbar />
      <main className="mx-auto max-w-[70ch] px-5 pt-28 pb-24">
        {post ? <PostView post={post} /> : <IndexView lang={urlLang} />}
      </main>
      <Footer />
    </div>
  );
}
