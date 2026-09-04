// TL.LINK.ICONFIX — a button-style featured link with an unbreakable label
// truncates with an ellipsis inside the icon-free lane instead of spilling
// under the leading icon.
//
// Live defect (mecivietnam's public page, 2026-09-01): raw URLs pasted as
// labels ran under the absolutely-positioned .lb-social icon on both sides of
// the button. The 44px side padding reserves the lane; what was missing was
// min-width:0 on the flex child and nowrap/ellipsis on the title
// (src/index.css, "Velvet: BUTTON"). This spec seeds ONE real button link with
// a 120-char unbroken label on the battery account, measures it on the public
// page, and deletes exactly that row by its own id.
//
// Not in spec 03: that file is static smoke over the account as-is, with no
// write opt-in and no cleanup contract. A seeded fixture belongs beside specs
// 45/47, with its own finally + afterEach sweep.

import { test, expect, allowWrites, type Page } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

const MARK = 'TL-ICONFIX-53';
// 120 chars, no spaces, no hyphens — nothing a line-breaker may split on.
const LONG_LABEL = `${MARK}_${'x'.repeat(120 - MARK.length - 1)}`;
const SHORT_LABEL = `${MARK}_short`; // under 20 chars — must still centre

/** Run supabase-js code inside the page using the app's own signed-in client. */
const sb = <T,>(page: Page, body: string, arg?: unknown): Promise<T> =>
  page.evaluate(
    async ({ body, a }) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = await import('/src/integrations/supabase/client.ts');
      return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
    },
    { body, a: arg ?? null },
  );

/**
 * The battery account's `links` block on its page1 mode. Every read is
 * .eq-scoped to this account (handle → page → mode → block) — no
 * cross-account rows are ever returned.
 */
const linksBlockId = (page: Page) => sb<string>(page, `
  const { data: pg } = await sb.from('pages').select('id').eq('handle', arg.handle).single();
  const { data: modes } = await sb.from('modes').select('id,type').eq('page_id', pg.id);
  const mode = (modes || []).find(m => m.type === 'page1') ?? (modes || [])[0];
  const { data: blocks } = await sb.from('blocks').select('id').eq('mode_id', mode.id).eq('type', 'links');
  if (!blocks?.length) throw new Error('battery account has no links block');
  return blocks[0].id;`, { handle: TEST_HANDLE });

/** Delete every row this spec ever inserted, by marker prefix on the label,
 *  scoped to the one block it inserts into. Pre-flight AND finally. */
const sweep = (page: Page, blockId: string) => sb<number>(page, `
  const { data } = await sb.from('block_items').select('id').eq('block_id', arg.blockId).like('label', arg.mark + '%');
  for (const r of (data || [])) await sb.from('block_items').delete().eq('id', r.id);
  return (data || []).length;`, { blockId, mark: MARK });

type Box = { left: number; right: number };
const boxes = (page: Page, label: string) =>
  page.locator(`a.lb-velvet.lb-size-button:has-text("${label}")`).first().evaluate((a) => {
    const r = (el: Element | null): Box | null =>
      el ? { left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right } : null;
    return {
      anchor: r(a)!,
      title: r(a.querySelector('.lb-title'))!,
      social: r(a.querySelector('.lb-social')),
      overflowing: (() => { const t = a.querySelector('.lb-title') as HTMLElement; return t.scrollWidth > t.clientWidth + 1; })(),
    };
  });

test.describe('TL.LINK.ICONFIX — button label ellipsis', () => {
  test('a 120-char unbroken label stays right of the icon and inside the button', async ({ page }) => {
    await allowWrites(page, ['rest/v1/block_items']);

    // The app's client only exists on an app page; the editor is signed in.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const blockId = await linksBlockId(page);
    await sweep(page, blockId);

    const ids = await sb<string[]>(page, `
      const { data, error } = await sb.from('block_items').insert([
        { block_id: arg.blockId, label: arg.long,  url: 'https://example.com/iconfix-long',  size: 'button', order_index: 9001 },
        { block_id: arg.blockId, label: arg.short, url: 'https://example.com/iconfix-short', size: 'button', order_index: 9002 },
      ]).select('id');
      if (error) throw new Error(error.message);
      return data.map(r => r.id);`, { blockId, long: LONG_LABEL, short: SHORT_LABEL });
    expect(ids, 'two fixture rows inserted').toHaveLength(2);

    try {
      await page.goto(`/${TEST_HANDLE}`);
      await page.waitForLoadState('networkidle');
      const long = await boxes(page, MARK + '_x');
      const short = await boxes(page, SHORT_LABEL);

      // The lane: title sits entirely to the RIGHT of the icon and INSIDE the <a>.
      expect(long.social, 'button link renders a leading icon').not.toBeNull();
      expect(long.title.left, 'title.left >= social.right').toBeGreaterThanOrEqual(long.social!.right);
      expect(long.title.right, 'title.right <= anchor.right').toBeLessThanOrEqual(long.anchor.right + 0.5);
      expect(long.title.left, 'title.left >= anchor.left').toBeGreaterThanOrEqual(long.anchor.left - 0.5);
      // It is actually truncated (ellipsis in effect), not shrunk by a font quirk.
      expect(long.overflowing, '120-char label overflows its box, i.e. ellipsis is in effect').toBe(true);

      // A short label is still visually centred in the button.
      const tc = (short.title.left + short.title.right) / 2;
      const ac = (short.anchor.left + short.anchor.right) / 2;
      expect(Math.abs(tc - ac), 'short label centred within 2px').toBeLessThanOrEqual(2);
    } finally {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      for (const id of ids) {
        await sb(page, `const { error } = await sb.from('block_items').delete().eq('id', arg.id); if (error) throw new Error(error.message);`, { id });
      }
      const left = await sweep(page, blockId);
      expect(left, 'no fixture rows left behind').toBe(0);
    }
  });
});
