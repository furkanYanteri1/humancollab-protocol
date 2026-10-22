// Verify that log entry <index> is included in the current humancollab transparency log (RFC 9162 2.1.3.2),
// and re-check the Ed25519 signature stored in the leaf. Node.js 20+, no dependencies.
// Usage: node verify-inclusion.mjs <index>
import { createHash, createPublicKey, verify } from "node:crypto";

const BASE = "https://humancollab.si";
const sha256 = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
const index = Number(process.argv[2] ?? 0);

const { tree_size } = await (await fetch(`${BASE}/api/v1/log`)).json();
if (index >= tree_size) throw new Error(`log has ${tree_size} entries`);
const [entry] = (await (await fetch(`${BASE}/api/v1/log/entries?start=${index}&count=1`)).json()).entries;
const proof = await (await fetch(`${BASE}/api/v1/log/proof?index=${index}&tree_size=${tree_size}`)).json();

// 1. The leaf hash is SHA-256(0x00 || leaf).
const leafHash = sha256(Buffer.from([0]), Buffer.from(entry.leaf, "utf8"));
if (leafHash.toString("hex") !== entry.leaf_hash) throw new Error("leaf hash mismatch");

// 2. The audit path leads from the leaf to the published root.
let fn = index, sn = tree_size - 1, r = leafHash;
for (const hex of proof.audit_path) {
  const p = Buffer.from(hex, "hex");
  if (sn === 0) throw new Error("proof too long");
  if (fn % 2 === 1 || fn === sn) {
    r = sha256(Buffer.from([1]), p, r);
    if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn >>= 1; sn >>= 1; }
  } else {
    r = sha256(Buffer.from([1]), r, p);
  }
  fn >>= 1; sn >>= 1;
}
if (sn !== 0 || r.toString("hex") !== proof.root_hash) throw new Error("inclusion proof failed");

// 3. The signature inside the leaf is valid for the signed payload.
const leaf = JSON.parse(entry.leaf);
const key = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(leaf.public_key, "base64")]),
  format: "der", type: "spki",
});
const ok = verify(null, Buffer.from(leaf.canonical, "utf8"), key, Buffer.from(leaf.signature, "base64"));
console.log({ index, tree_size, root_hash: proof.root_hash, kind: leaf.kind, included: true, signature_valid: ok });
