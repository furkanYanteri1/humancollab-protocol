// Verify the independent witness cosignatures on humancollab's latest tree heads: each head's checkpoint must carry a
// valid log signature (pinned key in monitor/log-key.txt), and every cosignature line must verify against the witness
// key listed in GET /api/v1/log (C2SP tlog-cosignature, cosignature/v1, Ed25519). Node.js 20+, no dependencies.
// Pin the witness keys you trust yourself instead of taking them from the log, if you can.
// Usage: node verify-witnesses.mjs [heads to check, default 5]
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyCheckpoint } from "../monitor/verify.mjs";

const BASE = "https://humancollab.si";
const ORIGIN = "humancollab.si/log";
const LOG_KEY = readFileSync(new URL("../monitor/log-key.txt", import.meta.url), "utf8").trim();
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const { witnesses } = await (await fetch(`${BASE}/api/v1/log`)).json();
const keys = new Map(
  witnesses.map(({ name, vkey }) => {
    const [, , id, key] = /^([^+]+)\+([0-9a-f]{8})\+(\S+)$/.exec(vkey);
    const raw = Buffer.from(key, "base64");
    if (raw[0] !== 0x04) throw new Error(`${name}: not an Ed25519 cosignature key`);
    return [name, { id, key: createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw.subarray(1)]), format: "der", type: "spki" }) }];
  }),
);

const { heads } = await (await fetch(`${BASE}/api/v1/log/heads`)).json();
for (const head of heads.slice(0, Number(process.argv[2] ?? 5))) {
  const note = head.checkpoint;
  const { treeSize, rootHash } = verifyCheckpoint(note, LOG_KEY, ORIGIN);
  if (treeSize !== head.tree_size || rootHash !== head.root_hash) throw new Error(`head ${head.tree_size}: checkpoint does not match`);
  const body = note.slice(0, note.indexOf("\n\n") + 1);
  const cosigned = [];
  for (const line of note.slice(note.indexOf("\n\n") + 2, -1).split("\n")) {
    const m = /^— (\S+) (\S+)$/.exec(line);
    const w = m && keys.get(m[1]);
    if (!w) continue;
    const sig = Buffer.from(m[2], "base64");
    const time = sig.readBigUInt64BE(4);
    const ok = sig.length === 76 && sig.subarray(0, 4).toString("hex") === w.id &&
      verify(null, Buffer.from(`cosignature/v1\ntime ${time}\n${body}`), w.key, sig.subarray(12));
    if (!ok) throw new Error(`head ${treeSize}: invalid cosignature from ${m[1]}`);
    cosigned.push({ witness: m[1], at: new Date(Number(time) * 1000).toISOString() });
  }
  console.log({ tree_size: treeSize, root_hash: rootHash, cosignatures: cosigned });
}
