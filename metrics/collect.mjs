// Daily snapshot of the service's public numbers, for later evaluation. Node.js 20+, no dependencies.
// Reads only public endpoints and appends one JSON line per day to <dir>/metrics.jsonl. Anyone can run it.
// Usage: node collect.mjs <state dir>
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.HUMANCOLLAB_URL ?? "https://humancollab.si";
const dir = process.argv[2];
if (!dir) throw new Error("usage: node collect.mjs <state dir>");

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
};

const [stats, log, heads] = await Promise.all([get("/api/v1/stats"), get("/api/v1/log"), get("/api/v1/log/heads")]);
const latest = heads.heads?.[0];
const line = {
  collected_at: new Date().toISOString(),
  counts: stats.counts,
  ai_visits_30d: stats.ai_visits_30d.map(({ agent, visits, verified_by_ip_range }) => ({ agent, visits, verified_by_ip_range })),
  log: { tree_size: log.tree_size, root_hash: log.root_hash },
  latest_head: latest && { tree_size: latest.tree_size, created_at: latest.created_at, has_ots_receipt: Boolean(latest.ots_receipt) },
};
mkdirSync(dir, { recursive: true });
appendFileSync(join(dir, "metrics.jsonl"), JSON.stringify(line) + "\n");
console.log(`tree_size ${line.log.tree_size}, ${line.ai_visits_30d.length} clients`);
