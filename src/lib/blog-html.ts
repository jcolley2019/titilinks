// SEO.TITILINKS.BLOG.1 — a post's markdown as static HTML, for the build script
// only (scripts/prerender-marketing.ts). It renders with the same react-markdown
// + remark-gfm pair the React blog page uses, so the no-JS HTML and the page a
// reader sees with JavaScript carry the same markup. Kept out of
// seo-marketing-html.ts on purpose: that module rides in the app bundle, and
// react-dom/server must not.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown));
}
