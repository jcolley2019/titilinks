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
//   node scripts/kill-stale-dev.mjs 8085 --force → kill even a healthy server
//
// HOUSE.2 — "stale" means "not answering", NOT "not mine". Before killing a node
// listener the sweep probes it over HTTP; anything that answers is a dev server
// someone is using and is left alone. Killing a healthy server has already cost
// one false gate failure, so the probe is the default and --force is the escape.
//
// Safety: only listeners whose owning process is node are killed; anything else
// on those ports is reported and left alone. Cross-platform (Windows netstat +
// taskkill, POSIX lsof + kill).
//
// Exit codes: 0 normally (a clean range is success). 1 only in single-port
// (predev) mode when the port is already serving — so `npm run dev` stops with
// the reuse message instead of failing later on strictPort.

import { execSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';

const isWin = process.platform === 'win32';

// ── resolve the target port set from argv ────────────────────────────────────
const argv = process.argv.slice(2);
const force = argv.includes('--force');
const nums = argv.map((a) => Number.parseInt(a, 10)).filter(Number.isFinite);
const singlePort = nums.length === 1; // predev shape — the only mode that exits 1
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

// ── is this listener actually serving? (any HTTP answer ⇒ healthy, keep it) ──
// A refused connection, a timeout, or a socket hang-up ⇒ stale ⇒ safe to kill.
// localhost can resolve to ::1 on Windows while Vite binds IPv4 only, so a
// failed localhost probe is retried on 127.0.0.1 before condemning the process.
// node:http, not fetch: fetch's pooled sockets outlive the sweep and trip a
// libuv assertion when the process exits underneath them.
function probeHost(host, port) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    const req = httpRequest(
      { host, port, path: '/', method: 'GET', agent: false, timeout: 2000 },
      (res) => { res.destroy(); done(true); }, // ANY status — 200, 404, 500 — is an answer
    );
    req.on('timeout', () => { req.destroy(); done(false); });
    req.on('error', () => done(false));
    req.end();
  });
}

async function probe(port) {
  for (const host of ['localhost', '127.0.0.1']) {
    if (await probeHost(host, port)) return true;
  }
  return false;
}

async function servingPorts(list) {
  const out = [];
  for (const port of list) if (await probe(port)) out.push(port);
  return out;
}

// ── sweep ────────────────────────────────────────────────────────────────────
const byPid = isWin ? listenersWin() : listenersPosix();

if (byPid.size === 0) {
  console.log(`[kill-stale-dev] ports ${ports[0]}-${ports[ports.length - 1]}: clean, nothing to kill`);
  process.exit(0);
}

let killed = 0;
let healthy = 0;
for (const [pid, pset] of byPid) {
  const plist = [...pset].sort((a, b) => a - b);
  const where = `pid ${pid} (port ${plist.join(', ')})`;
  if (!isNode(pid)) {
    console.log(`[kill-stale-dev] SKIPPED non-node listener — ${where} (left running)`);
    continue;
  }
  const serving = force ? [] : await servingPorts(plist);
  if (serving.length > 0) {
    healthy++;
    for (const port of serving) {
      console.log(`[kill-stale-dev] port ${port} is already serving (PID ${pid}) — reuse it. Not killed.`);
    }
    console.log('[kill-stale-dev] it answers HTTP, so it is not stale. Pass --force to kill it anyway.');
    continue;
  }
  kill(pid);
  killed++;
  console.log(`[kill-stale-dev] killed node dev server — ${where}`);
}
console.log(`[kill-stale-dev] done — ${killed} stale dev server(s) killed`);

// predev shape + a live server = stop the run here, so `npm run dev` reports the
// reuse message rather than dying on strictPort a second later.
// exitCode (not process.exit) so the probe sockets finish closing on their own.
process.exitCode = healthy > 0 && singlePort ? 1 : 0;
