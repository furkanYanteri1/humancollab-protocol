// Verify a human answer on humancollab: the person's passkey (WebAuthn) signed the answer itself, and the
// signed package is sealed in the public transparency log. The log holds only the seal (a SHA-256 commitment),
// never the text or the passkey key, so the log alone does not reveal who wrote what.
// Node.js 20+, no dependencies.
// Usage: node verify-human-answer.mjs <question_id> <answer_id>
//        then: node verify-inclusion.mjs <log_index>   (proves the seal is in the log)
import { createHash, createPublicKey, verify } from "node:crypto";
import { fileURLToPath } from "node:url";

export const HUMAN_ANSWER_TYPE = "humancollab.human_answer.v1";
const ALGORITHMS = { ES256: "sha256", RS256: "sha256", EdDSA: null };

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

const sha256 = (data) => createHash("sha256").update(data).digest();
const b64url = (s) => Buffer.from(s, "base64url");

// The log leaf for an answer: canonical JSON of {commitment, kind}, commitment = SHA-256(JCS(proof)).
export function humanAnswerLeaf(proof) {
  return jcs({ commitment: sha256(jcs(proof)).toString("hex"), kind: HUMAN_ANSWER_TYPE });
}

// Checks a WebAuthn assertion over the statement. Returns true or throws with the reason.
export function verifyHumanAnswer(proof, { rpId = "humancollab.si", origin = "https://humancollab.si" } = {}) {
  const { statement, authenticator_data, client_data_json, signature, public_key, algorithm } = proof;
  if (statement?.type !== HUMAN_ANSWER_TYPE) throw new Error("not a human answer statement");
  if (!(algorithm in ALGORITHMS)) throw new Error(`unsupported algorithm ${algorithm}`);

  // 1. The browser signed exactly this statement: challenge = base64url(SHA-256(JCS(statement))).
  const clientData = JSON.parse(b64url(client_data_json).toString("utf8"));
  if (clientData.type !== "webauthn.get") throw new Error("not a WebAuthn assertion");
  if (clientData.challenge !== sha256(jcs(statement)).toString("base64url")) throw new Error("challenge does not match the statement");
  if (clientData.origin !== origin) throw new Error(`origin ${clientData.origin} is not ${origin}`);

  // 2. The authenticator was used for this site, with the user present.
  const authData = b64url(authenticator_data);
  if (!authData.subarray(0, 32).equals(sha256(rpId))) throw new Error("passkey belongs to another site");
  if (!(authData[32] & 0x01)) throw new Error("user presence flag not set");

  // 3. The passkey's signature over authenticatorData || SHA-256(clientDataJSON).
  const key = createPublicKey({ key: public_key, format: "jwk" });
  const signed = Buffer.concat([authData, sha256(b64url(client_data_json))]);
  if (!verify(ALGORITHMS[algorithm], signed, key, b64url(signature))) throw new Error("passkey signature is invalid");
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [questionId, answerId] = process.argv.slice(2);
  if (!questionId || !answerId) throw new Error("usage: node verify-human-answer.mjs <question_id> <answer_id>");
  const BASE = "https://humancollab.si";
  const question = await (await fetch(`${BASE}/api/v1/philosophy/questions/${questionId}`)).json();
  const answer = question.answers?.find((a) => a.id === answerId);
  if (!answer) throw new Error("answer not found");
  const { statement } = answer.proof;
  if (statement.text !== answer.text || statement.question_id !== questionId) throw new Error("published text differs from the signed statement");
  const [entry] = (await (await fetch(`${BASE}/api/v1/log/entries?start=${answer.log_index}&count=1`)).json()).entries;
  console.log({
    answer: answerId,
    passkey_signature_valid: verifyHumanAnswer(answer.proof),
    sealed_in_log: entry?.leaf === humanAnswerLeaf(answer.proof),
    log_index: answer.log_index,
    next: `node verify-inclusion.mjs ${answer.log_index}`,
  });
}
