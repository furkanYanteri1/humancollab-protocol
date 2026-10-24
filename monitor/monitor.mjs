// Independent monitor for the humancollab transparency log. Node.js 20+, no dependencies.
// Fetches the signed checkpoint, verifies the signature with the pinned key, proves that the new tree extends the
// last one it saw (RFC 9162 consistency) and stores the checkpoint. Anyone can run it; a failure means the log
// was rewritten, forked or shrank.
// Usage: node monitor.mjs <state dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyCheckpoint, verifyConsistency } from "./verify.mjs";

const BASE = process.env.HUMANCOLLAB_URL ?? "https://humancollab.si";
const ORIGIN = "humancollab.si/log";
const VKEY = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "log-key.txt"), "utf8").trim();
const dir = process.argv[2];
if (!dir) throw new Error("usage: node monitor.mjs <state dir>");

const res = await fetch(`${BASE}/api/v1/log/checkpoint`);
if (!res.ok) throw new Error(`checkpoint: HTTP ${res.status}`);
const note = await res.text();
const now = verifyCheckpoint(note, VKEY, ORIGIN);

let previous = null;
try {
  previous = verifyCheckpoint(readFileSync(join(dir, "latest"), "utf8"), VKEY, ORIGIN);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

if (previous) {
  if (now.treeSize < previous.treeSize) throw new Error(`log shrank: ${previous.treeSize} -> ${now.treeSize}`);
  if (now.treeSize === previous.treeSize) {
    if (now.rootHash !== previous.rootHash) throw new Error(`fork at tree size ${now.treeSize}: two different roots`);
    console.log(`unchanged at tree size ${now.treeSize}`);
    process.exit(0);
  }
  if (previous.treeSize > 0) {
    const p = await (
      await fetch(`${BASE}/api/v1/log/consistency?first=${previous.treeSize}&second=${now.treeSize}`)
    ).json();
    if (p.first_root !== previous.rootHash || p.second_root !== now.rootHash) throw new Error("consistency proof roots do not match the checkpoints");
    if (!verifyConsistency(previous.treeSize, now.treeSize, previous.rootHash, now.rootHash, p.proof)) {
      throw new Error(`inconsistent history between tree sizes ${previous.treeSize} and ${now.treeSize}`);
    }
  }
}

mkdirSync(join(dir, "checkpoints"), { recursive: true });
writeFileSync(join(dir, "checkpoints", String(now.treeSize)), note);
writeFileSync(join(dir, "latest"), note);
console.log(`recorded tree size ${now.treeSize} root ${now.rootHash}`);
