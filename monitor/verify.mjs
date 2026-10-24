// Verification helpers for the humancollab transparency log. Node.js 20+, no dependencies.
// - Signed checkpoints: C2SP tlog-checkpoint body in a C2SP signed note (Ed25519).
// - Consistency proofs: RFC 9162 section 2.1.4.2.
import { createHash, createPublicKey, verify } from "node:crypto";

const sha256 = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
const node = (left, right) => sha256(Buffer.from([1]), left, right);
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// "<name>+<key id hex>+<base64(0x01 || public key)>"
export function parseVerifierKey(vkey) {
  const [name, id, encoded] = vkey.trim().split("+");
  const raw = Buffer.from(encoded ?? "", "base64");
  if (!name || !/^[0-9a-f]{8}$/.test(id ?? "") || raw.length !== 33 || raw[0] !== 0x01) {
    throw new Error("invalid verifier key");
  }
  const publicKey = raw.subarray(1);
  const expected = sha256(Buffer.from(`${name}\n`, "utf8"), Buffer.from([0x01]), publicKey).subarray(0, 4);
  if (expected.toString("hex") !== id) throw new Error("verifier key id does not match the key");
  return { name, keyId: Buffer.from(id, "hex"), publicKey };
}

// Verifies a signed note against one verifier key and returns the signed text.
export function verifyNote(note, vkey) {
  const { name, keyId, publicKey } = parseVerifierKey(vkey);
  const split = note.indexOf("\n\n");
  if (split < 0 || !note.endsWith("\n")) throw new Error("malformed note");
  const text = note.slice(0, split + 1);
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, publicKey]), format: "der", type: "spki" });
  for (const line of note.slice(split + 2, -1).split("\n")) {
    const m = /^— (\S+) (\S+)$/.exec(line);
    if (!m || m[1] !== name) continue;
    const sig = Buffer.from(m[2], "base64");
    if (sig.length !== 68 || !sig.subarray(0, 4).equals(keyId)) continue;
    if (verify(null, Buffer.from(text, "utf8"), key, sig.subarray(4))) return text;
  }
  throw new Error("no valid signature for this key");
}

// Returns {origin, treeSize, rootHash (hex)} of a verified checkpoint.
export function verifyCheckpoint(note, vkey, origin) {
  const [o, size, root] = verifyNote(note, vkey).split("\n");
  if (origin && o !== origin) throw new Error(`unexpected origin ${o}`);
  if (!/^(0|[1-9][0-9]*)$/.test(size)) throw new Error("invalid tree size");
  const rootHash = Buffer.from(root, "base64");
  if (rootHash.length !== 32) throw new Error("invalid root hash");
  return { origin: o, treeSize: Number(size), rootHash: rootHash.toString("hex") };
}

// RFC 9162 2.1.4.2: true if the tree of size `second` (root secondRoot) extends the tree of size `first`.
export function verifyConsistency(first, second, firstRoot, secondRoot, proofHex) {
  const fr0 = Buffer.from(firstRoot, "hex");
  const sr0 = Buffer.from(secondRoot, "hex");
  const path = proofHex.map((h) => Buffer.from(h, "hex"));
  if (first < 1 || first > second) return false;
  if (first === second) return path.length === 0 && fr0.equals(sr0);
  if ((first & (first - 1)) === 0) path.unshift(fr0);
  if (path.length === 0) return false;
  let fn = first - 1;
  let sn = second - 1;
  while (fn & 1) {
    fn >>= 1;
    sn >>= 1;
  }
  let fr = path[0];
  let sr = path[0];
  for (const c of path.slice(1)) {
    if (sn === 0) return false;
    if (fn & 1 || fn === sn) {
      fr = node(c, fr);
      sr = node(c, sr);
      while (!(fn & 1) && fn !== 0) {
        fn >>= 1;
        sn >>= 1;
      }
    } else {
      sr = node(sr, c);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && fr.equals(fr0) && sr.equals(sr0);
}
