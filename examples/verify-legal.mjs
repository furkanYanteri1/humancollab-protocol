// Verify that humancollab's legal texts (terms, privacy, acceptable use) are exactly the versions sealed in the public
// log: download the plain text, hash it, rebuild the seal leaf and compare it with the log entry. Node.js 20+, no
// dependencies. Every version stays at its own address (/legal/<name>/<version>.md), so old seals stay checkable.
// Check the entry's inclusion in the tree with verify-inclusion.mjs <log_index>.
// Usage: node verify-legal.mjs
import { createHash } from "node:crypto";

const BASE = "https://humancollab.si";
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// Canonical JSON (keys sorted, no whitespace) for string-only objects, as in SPEC section 2.
const jcs = (o) => `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(o[k])}`).join(",")}}`;

const { documents } = await (await fetch(`${BASE}/api/v1/legal`)).json();
for (const d of documents) {
  const text = await (await fetch(d.current.url)).text();
  const hash = sha256(text);
  if (hash !== d.current.sha256) throw new Error(`${d.document}: text hash ${hash} differs from published ${d.current.sha256}`);
  if (d.current.log_index === null) {
    console.log({ document: d.document, version: d.current.version, sha256: hash, sealed: false, note: "seal is written within the hour" });
    continue;
  }
  const [entry] = (await (await fetch(`${BASE}/api/v1/log/entries?start=${d.current.log_index}&count=1`)).json()).entries;
  const expected = jcs({
    document: d.document,
    kind: "humancollab.legal_document.v1",
    sha256: hash,
    url: d.current.url,
    version: d.current.version,
  });
  if (entry.leaf !== expected) throw new Error(`${d.document}: log entry ${d.current.log_index} is not this seal`);
  console.log({ document: d.document, version: d.current.version, sha256: hash, sealed: true, log_index: d.current.log_index });
}
