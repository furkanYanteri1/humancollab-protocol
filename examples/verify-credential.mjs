// Verify a humancollab business credential (W3C Verifiable Credential 2.0, Data Integrity eddsa-jcs-2022).
// The issuer key comes from did:web:humancollab.si (https://humancollab.si/.well-known/did.json); after fetching it
// once, credentials can be verified offline, without asking humancollab. Node.js 20+, no dependencies.
// Usage: node verify-credential.mjs <domain>
import { createHash, createPublicKey, verify } from "node:crypto";
import { fileURLToPath } from "node:url";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58btcDecode(s) {
  let n = BigInt(0);
  for (const c of s) {
    const v = BASE58.indexOf(c);
    if (v < 0) throw new Error("invalid base58");
    n = n * BigInt(58) + BigInt(v);
  }
  let hex = n === BigInt(0) ? "" : n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const zeros = s.length - s.replace(/^1+/, "").length;
  return Buffer.concat([Buffer.alloc(zeros), Buffer.from(hex, "hex")]);
}

// JSON Canonicalization Scheme (RFC 8785) for strings, integers, booleans, null, arrays and objects.
export function jcs(v) {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error("only integers are supported");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(jcs).join(",")}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(",")}}`;
}

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest();

// publicKeyMultibase: "z" + base58btc(0xed 0x01 || 32-byte Ed25519 public key)
export function verifyDataIntegrity(credential, publicKeyMultibase) {
  const { proof, ...document } = credential;
  if (proof?.type !== "DataIntegrityProof" || proof.cryptosuite !== "eddsa-jcs-2022") throw new Error("unsupported proof");
  if (proof.proofPurpose !== "assertionMethod") throw new Error("unexpected proof purpose");
  const { proofValue, ...options } = proof;
  const config = document["@context"] ? { ...options, "@context": document["@context"] } : options;
  const hashData = Buffer.concat([sha256(jcs(config)), sha256(jcs(document))]);
  const raw = base58btcDecode(publicKeyMultibase.slice(1));
  if (publicKeyMultibase[0] !== "z" || raw.length !== 34 || raw[0] !== 0xed || raw[1] !== 0x01) throw new Error("not an Ed25519 multikey");
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw.subarray(2)]),
    format: "der",
    type: "spki",
  });
  if (proofValue?.[0] !== "z") throw new Error("proofValue must be base58btc multibase");
  return verify(null, hashData, key, base58btcDecode(proofValue.slice(1)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const domain = process.argv[2];
  if (!domain) throw new Error("usage: node verify-credential.mjs <domain>");
  const vc = await (await fetch(`https://humancollab.si/api/v1/businesses/${domain}/credential`)).json();
  const did = await (await fetch("https://humancollab.si/.well-known/did.json")).json();
  const method = did.verificationMethod.find((m) => m.id === vc.proof?.verificationMethod);
  if (vc.issuer !== did.id || !method || !did.assertionMethod.includes(method.id)) throw new Error("unknown issuer key");
  const now = new Date();
  console.log({
    domain: vc.credentialSubject.domain,
    proof_valid: verifyDataIntegrity(vc, method.publicKeyMultibase),
    currently_valid: new Date(vc.validFrom) <= now && now < new Date(vc.validUntil),
    profile_version: vc.credentialSubject.profileVersion,
    log_index: vc.credentialSubject.logIndex,
    scope: vc.credentialSubject.scope,
  });
}
