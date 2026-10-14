// SEO.TITILINKS.BLOG.1 — blog posts: markdown files with front matter in
// content/blog/<lang>/<slug>.md, read by scripts/prerender-marketing.ts (Node,
// full HTML per post) and by src/lib/blog-posts.ts (Vite glob, the React pages).
//
// PURE: no DOM, no Node APIs, no imports — both runtimes share this module, so a
// post parses, dates and gets its in-body CTA the same way with or without JS.
//
// Front matter is a strict YAML subset, so no YAML dependency rides into the
// bundle: `key: value` lines (a value may be "double-quoted" JSON-style or
// 'single-quoted'), plus `faq:` followed by `- q:` / `a:` pairs. Anything else
// THROWS — a malformed post fails the build instead of shipping half-parsed.
//
//   ---
//   title: "Link en bio para creadores: cómo crear uno gratis"
//   description: "…"
//   date: 2026-10-14
//   lang: es
//   slug: link-en-bio-para-creadores
//   twin: link-in-bio-for-creators      (optional: the other language's slug)
//   faq:
//     - q: "¿…?"
//       a: "…"
//   ---

export type BlogLang = 'en' | 'es';
export type BlogFaq = { q: string; a: string };
export type BlogPost = {
  title: string;
  description: string;
  /** YYYY-MM-DD, a calendar date with no time zone. */
  date: string;
  lang: BlogLang;
  slug: string;
  /** Slug of the same post in the other language, when one exists. */
  twin?: string;
  faq: BlogFaq[];
  /** Markdown after the front matter. */
  body: string;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = ['title', 'description', 'date', 'lang', 'slug', 'twin', 'faq'] as const;

function scalar(raw: string, where: string): string {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(v);
      if (typeof parsed === 'string') return parsed;
    } catch {
      /* fall through */
    }
    throw new Error(`${where}: bad double-quoted value ${v}`);
  }
  if (v.startsWith("'")) {
    if (v.length < 2 || !v.endsWith("'")) throw new Error(`${where}: bad single-quoted value ${v}`);
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

/** Parse and validate one post. `file` (e.g. 'content/blog/es/x.md') pins slug and lang to the path. */
export function parsePost(raw: string, file = 'post'): BlogPost {
  const text = raw.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${file}: no front matter (the file must open with a --- block)`);
  const fields: Record<string, string> = {};
  const faq: BlogFaq[] = [];
  let inFaq = false;
  let faqSeen = false;
  m[1].split('\n').forEach((line, i) => {
    const where = `${file}: front matter line ${i + 2}`;
    if (!line.trim()) return;
    const item = /^\s+-\s+q:\s*(.*)$/.exec(line);
    const answer = /^\s+a:\s*(.*)$/.exec(line);
    const top = /^([a-z]+):\s*(.*)$/.exec(line);
    if (inFaq && item) {
      faq.push({ q: scalar(item[1], where), a: '' });
    } else if (inFaq && answer && faq.length && !faq[faq.length - 1].a) {
      faq[faq.length - 1].a = scalar(answer[1], where);
    } else if (top) {
      const key = top[1];
      if (!(KEYS as readonly string[]).includes(key)) throw new Error(`${where}: unknown key "${key}"`);
      if (key in fields || (key === 'faq' && faqSeen)) throw new Error(`${where}: "${key}" given twice`);
      inFaq = key === 'faq';
      if (inFaq) {
        faqSeen = true;
        if (top[2].trim()) throw new Error(`${where}: faq takes a list of "- q:" / "a:" pairs`);
      } else {
        fields[key] = scalar(top[2], where);
      }
    } else {
      throw new Error(`${where}: cannot read ${JSON.stringify(line)}`);
    }
  });

  const need = (key: string) => {
    const v = (fields[key] ?? '').trim();
    if (!v) throw new Error(`${file}: front matter needs "${key}"`);
    return v;
  };
  const lang = need('lang');
  if (lang !== 'en' && lang !== 'es') throw new Error(`${file}: lang must be en or es, got "${lang}"`);
  const slug = need('slug');
  if (!SLUG_RE.test(slug)) throw new Error(`${file}: slug "${slug}" must be lowercase words joined by hyphens`);
  const date = need('date');
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`${file}: date must be YYYY-MM-DD, got "${date}"`);
  }
  const twin = (fields.twin ?? '').trim() || undefined;
  if (twin && !SLUG_RE.test(twin)) throw new Error(`${file}: twin "${twin}" is not a slug`);
  for (const [i, f] of faq.entries()) {
    if (!f.q.trim() || !f.a.trim()) throw new Error(`${file}: faq entry ${i + 1} needs both q and a`);
  }
  const pathMatch = /(?:^|\/)(en|es)\/([^/]+)\.md$/.exec(file.replace(/\\/g, '/'));
  if (pathMatch && (pathMatch[1] !== lang || pathMatch[2] !== slug)) {
    throw new Error(`${file}: lives in ${pathMatch[1]}/${pathMatch[2]}.md but says lang "${lang}", slug "${slug}"`);
  }
  const body = m[2].trim();
  if (!body) throw new Error(`${file}: empty body`);
  return { title: need('title'), description: need('description'), date, lang, slug, twin, faq, body };
}

/** The public path of a post: ('es', 'x') → '/es/blog/x', ('en', 'x') → '/blog/x'. */
export function blogPostPath(lang: BlogLang, slug: string): string {
  return `${lang === 'es' ? '/es' : ''}/blog/${slug}`;
}

/** { lang, slug } when `pathname` is a post URL, else null. Index pages are not posts. */
export function postFromPath(pathname: string): { lang: BlogLang; slug: string } | null {
  const m = /^(?:\/(es))?\/blog\/([a-z0-9-]+)\/?$/i.exec(pathname);
  return m ? { lang: m[1] ? 'es' : 'en', slug: m[2].toLowerCase() } : null;
}

/** Newest first; same-day posts by title so the order is stable. */
export function newestFirst<P extends Pick<BlogPost, 'date' | 'title'>>(posts: readonly P[]): P[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/** '2026-10-14' → '14 de octubre de 2026' / 'October 14, 2026'. UTC, so the day never shifts. */
export function formatPostDate(date: string, lang: BlogLang): string {
  return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** Words a reader sees: link targets, markdown markers and punctuation-only tokens do not count. */
export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`|]/g, ' ');
  return (text.match(/\S+/g) ?? []).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const isParagraph = (block: string) => !/^(#|[-*+]\s|>|\d+\.\s|\||```)/.test(block.trim());

/**
 * The body with `cta` (one markdown paragraph) inserted after the last paragraph
 * that ends within the first third of the post's words — or after the first
 * paragraph when even that one runs past a third. Never after the last block,
 * and never between a heading and its text.
 */
export function withInlineCta(body: string, cta: string): string {
  const blocks = body.trim().split(/\n\s*\n/);
  const words = blocks.map(wordCount);
  const total = words.reduce((a, b) => a + b, 0);
  let seen = 0;
  let at = -1;
  for (let i = 0; i < blocks.length - 1; i++) {
    seen += words[i];
    if (!isParagraph(blocks[i])) continue;
    if (seen <= total / 3 || at === -1) at = i;
    if (seen > total / 3) break;
  }
  if (at === -1) throw new Error('blog: the body needs a paragraph before its last block to carry the in-body CTA');
  return [...blocks.slice(0, at + 1), cta, ...blocks.slice(at + 1)].join('\n\n');
}
