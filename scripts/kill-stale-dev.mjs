// HOUSE.1 — stale dev-server sweep.
//
// Finds and kills STALE node/vite dev listeners in a TCP port range so a fresh
// `npm run dev` (strictPort 8085) never fails on a zombie, and a battery never
// hits stale code left behind by a crashed server.
//
// Usage:
//   node scripts/kill-stale-dev.mjs            → sweep the whole 8080-8090 range
//   node scripts/kill-stale-dev.mjs 8085       → sweep a single port (predev)
//   node scripts/kill-stale-dev.mjs 8080 8090  → sweep an explicit lo..hi range
//
// Safety: only listeners whose owning process is node are killed; anything else
// on those ports is reported and left alone. Cross-platform (Windows netstat +
// taskkill, POSIX lsof + kill). Always exits 0 — a clean range is success.

import { execSync } from 'node:child_process';

const isWin = process.platform === 'win32';

// ── resolve the target port set from argv ────────────────────────────────────
const nums = process.argv.slice(2).map((a) => Number.parseInt(a, 10)).filter(Number.isFinite);
let ports;
if (nums.length === 0) {
  ports = range(8080, 8090);
} else if (nums.length === 1) {
  ports = [nums[0]];
} else {
  ports = range(Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1]));
}
const portSet = new Set(ports);

function range(lo, hi) {
  const out = [];
  for (let p = lo; p <= hi; p++) out.push(p);
  return out;
}

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return ''; // non-zero exit (e.g. no matches) is expected — treat as empty
  }
}

// ── discover { pid → Set<port> } for LISTENING sockets on the target ports ────
function listenersWin() {
  const byPid = new Map();
  for (const line of sh('netstat -ano -p tcp').split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!m) continue;
    const port = Number.parseInt(m[1], 10);
    const pid = Number.parseInt(m[2], 10);
    if (!portSet.has(port) || pid === 0) continue;
    if (!byPid.has(pid)) byPid.set(pid, new Set());
    byPid.get(pid).add(port);
  }
  return byPid;
}

function listenersPosix() {
  const byPid = new Map();
  for (const port of ports) {
    const out = sh(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`).trim();
    if (!out) continue;
    for (const pidStr of out.split(/\s+/)) {
      const pid = Number.parseInt(pidStr, 10);
      if (!Number.isFinite(pid) || pid === 0) continue;
      if (!byPid.has(pid)) byPid.set(pid, new Set());
      byPid.get(pid).add(port);
    }
  }
  return byPid;
}

// ── is this pid a node process? (only node/vite listeners are ours to kill) ──
function isNode(pid) {
  if (isWin) {
    const csv = sh(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`).toLowerCase();
    return csv.includes('node.exe');
  }
  const comm = sh(`ps -p ${pid} -o comm=`).toLowerCase();
  return comm.includes('node');
}

function kill(pid) {
  if (isWin) sh(`taskkill /PID ${pid} /F /T`);
  else {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

// ── sweep ────────────────────────────────────────────────────────────────────
const byPid = isWin ? listenersWin() : listenersPosix();

if (byPid.size === 0) {
  console.log(`[kill-stale-dev] ports ${ports[0]}-${ports[ports.length - 1]}: clean, nothing to kill`);
  process.exit(0);
}

let killed = 0;
for (const [pid, pset] of byPid) {
  const where = `pid ${pid} (port ${[...pset].sort((a, b) => a - b).join(', ')})`;
  if (isNode(pid)) {
    kill(pid);
    killed++;
    console.log(`[kill-stale-dev] killed node dev server — ${where}`);
  } else {
    console.log(`[kill-stale-dev] SKIPPED non-node listener — ${where} (left running)`);
  }
}
console.log(`[kill-stale-dev] done — ${killed} stale dev server(s) killed`);
process.exit(0);
