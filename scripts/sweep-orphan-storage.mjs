// TL.STOR.6 — gated sweep of storage folders whose owner no longer exists.
//
// Every user bucket stores objects under `{userId}/…`. delete-account purges a
// user's folders when the account is deleted through the app, but accounts
// removed any other way (the dashboard, SQL, TL.CLEAN.1) left their folders
// behind. This finds top-level folders named by a UUID that is not a live
// auth user and, only with --apply, deletes the objects inside them.
//
// Run (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY = '<service role key>'
//   node scripts/sweep-orphan-storage.mjs            # dry run — no changes
//   node scripts/sweep-orphan-storage.mjs --apply    # delete orphan objects
//
// The key comes from the environment ONLY — this never reads .env files. The
// URL is pinned to prod (ohmvlypcbrfkuudcuqub), not supabase/config.toml's
// orphan project. SAFETY GATE: the live-user set must hold all four known
// accounts and at least five members, or nothing is classified — an empty or
// truncated user list would otherwise make every folder look orphaned.
// Folder names that are not UUID-shaped are reported and never deleted.

import { pathToFileURL } from 'node:url';

const SUPABASE_URL = 'https://ohmvlypcbrfkuudcuqub.supabase.co';

/** Same list as USER_BUCKETS in supabase/functions/delete-account/index.ts. */
const USER_BUCKETS = ['avatars', 'products', 'fonts', 'page-assets'];

/** joeyc, battery, free, onb — the gate's proof the user list really loaded. */
const REQUIRED_PREFIXES = ['3eb457d7', 'd3f1cfce', '87d14c9b', 'c46470a0'];
const MIN_USERS = 5;

const PAGE = 1000;
const REMOVE_BATCH = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: split top-level folder names into orphans (UUID, no live user), live
 *  (UUID of a live user) and unexpected (not UUID-shaped — never deleted).
 *  UUIDs compare case-insensitively. */
export function classifyFolders(folderNames, userIdSet) {
  const users = new Set([...userIdSet].map((id) => String(id).toLowerCase()));
  const orphans = [];
  const live = [];
  const unexpected = [];
  for (const name of folderNames) {
    if (!UUID.test(name)) unexpected.push(name);
    else if (users.has(name.toLowerCase())) live.push(name);
    else orphans.push(name);
  }
  return { orphans, live, unexpected };
}

/** Pure: does the loaded user set look like the real prod user list? */
export function userSetProblem(userIdSet) {
  const ids = [...userIdSet].map((id) => String(id).toLowerCase());
  const missing = REQUIRED_PREFIXES.filter((p) => !ids.some((id) => id.startsWith(p)));
  if (missing.length) return `missing known account(s) ${missing.join(', ')}`;
  if (ids.length < MIN_USERS) return `only ${ids.length} user(s), expected >= ${MIN_USERS}`;
  return null;
}

async function loadUserIds(svc) {
  const ids = new Set();
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) ids.add(u.id);
    if (users.length < PAGE) break;
  }
  return ids;
}

/** Every entry directly under `prefix`, paginated. */
async function listAll(svc, bucket, prefix) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await svc.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`${bucket}: list '${prefix}' — ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/** The objects under `{folder}/`, walked to depth 2 like delete-account's
 *  purgeBucket. A folder placeholder at the depth limit is not an object: it
 *  is reported as not walked instead of being counted. */
async function walkFolder(svc, bucket, folder) {
  const objects = [];
  const notWalked = [];
  const collect = async (prefix, depth) => {
    for (const entry of await listAll(svc, bucket, prefix)) {
      const full = `${prefix}/${entry.name}`;
      // A row with no id/metadata is a folder placeholder, not an object.
      if (!entry.id) {
        if (depth < 2) await collect(full, depth + 1);
        else notWalked.push(full);
      } else {
        objects.push({ path: full, bytes: Number(entry.metadata?.size ?? 0) });
      }
    }
  };
  await collect(folder, 1);
  return { objects, notWalked };
}

const mb = (bytes) => (bytes / 1048576).toFixed(2);

async function main() {
  const apply = process.argv.includes('--apply');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set — in PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY = '<service role key>' (it is never read from .env files).");
    process.exit(2);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const svc = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const userIds = await loadUserIds(svc);
  const problem = userSetProblem(userIds);
  if (problem) {
    console.error(`ABORT — the user list did not load correctly (${problem}). Nothing was classified or changed.`);
    process.exit(1);
  }
  console.log(`${userIds.size} live auth users loaded (gate passed). Mode: ${apply ? 'APPLY' : 'DRY RUN'}\n`);

  const plan = []; // { bucket, folder, objects, bytes }
  const unexpected = [];
  const notWalked = [];
  let failed = false;

  for (const bucket of USER_BUCKETS) {
    let top;
    try { top = await listAll(svc, bucket, ''); }
    catch (e) { console.error(`x ${e.message}`); failed = true; continue; }
    const { orphans, unexpected: odd } = classifyFolders(top.map((e) => e.name), userIds);
    for (const name of odd) unexpected.push(`${bucket}/${name}`);
    for (const folder of orphans) {
      try {
        const w = await walkFolder(svc, bucket, folder);
        notWalked.push(...w.notWalked.map((p) => `${bucket}/${p}`));
        plan.push({ bucket, folder, objects: w.objects, bytes: w.objects.reduce((s, o) => s + o.bytes, 0) });
      } catch (e) { console.error(`x ${e.message}`); failed = true; }
    }
  }

  if (plan.length) {
    console.log(`${'bucket'.padEnd(12)} ${'folder'.padEnd(36)} ${'objects'.padStart(8)} ${'MB'.padStart(9)}`);
    for (const p of plan) {
      console.log(`${p.bucket.padEnd(12)} ${p.folder.padEnd(36)} ${String(p.objects.length).padStart(8)} ${mb(p.bytes).padStart(9)}`);
    }
  } else {
    console.log('No orphan folders.');
  }
  const totalObjects = plan.reduce((s, p) => s + p.objects.length, 0);
  const totalBytes = plan.reduce((s, p) => s + p.bytes, 0);
  console.log(`\nTotal: ${plan.length} orphan folder(s), ${totalObjects} object(s), ${mb(totalBytes)} MB`);
  if (unexpected.length) console.log(`\nUnexpected (not UUID-shaped, never deleted):\n  ${unexpected.join('\n  ')}`);
  if (notWalked.length) console.log(`\nDeeper than 2 levels (not walked, not counted, not deleted):\n  ${notWalked.join('\n  ')}`);

  if (!apply) {
    console.log('\nDRY RUN — no changes made. Re-run with --apply to delete the orphan objects.');
    process.exit(failed ? 1 : 0);
  }

  console.log('');
  let removedTotal = 0;
  for (const bucket of USER_BUCKETS) {
    const paths = plan.filter((p) => p.bucket === bucket).flatMap((p) => p.objects.map((o) => o.path));
    if (!paths.length) continue;
    let removed = 0;
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const batch = paths.slice(i, i + REMOVE_BATCH);
      const { data, error } = await svc.storage.from(bucket).remove(batch);
      if (error) { console.error(`x ${bucket}: remove batch ${i / REMOVE_BATCH + 1} — ${error.message}`); failed = true; continue; }
      // A blocked remove() answers data:[] / error:null — count what came back.
      removed += (data ?? []).length;
    }
    if (removed !== paths.length) failed = true;
    console.log(`${removed === paths.length ? 'ok' : 'x '} ${bucket}: removed ${removed} of ${paths.length} object(s)`);
    removedTotal += removed;
  }
  console.log(`\nRemoved ${removedTotal} of ${totalObjects} orphan object(s).`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`x ${e?.message ?? e}`); process.exit(1); });
}
