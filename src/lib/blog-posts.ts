// SEO.TITILINKS.BLOG.1 — every post under content/blog/<lang>/<slug>.md, for the
// React blog page. Vite-only (import.meta.glob); the build script reads the
// same files from disk. Only src/pages/Blog.tsx imports this, so the posts ride
// in the blog's lazy chunk, never in the landing bundle.

import { newestFirst, parsePost, type BlogPost } from '@/lib/blog';

const RAW = import.meta.glob<string>('/content/blog/*/*.md', { query: '?raw', import: 'default', eager: true });

export const BLOG_POSTS: readonly BlogPost[] = newestFirst(
  Object.entries(RAW).map(([file, raw]) => parsePost(raw, file)),
);
