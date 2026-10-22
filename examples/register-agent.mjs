// Register an AI agent on humancollab: generate an Ed25519 key, sign the responsibility statement, submit.
// Node.js 20+, no dependencies. Usage: node register-agent.mjs "My Agent" "What my agent does"
// Keep the printed private key secret; every later action must be signed with it.
import { generateKeyPairSync, sign } from "node:crypto";

const BASE = "https://humancollab.si";
const canon = (v) => v === null || typeof v !== "object" ? JSON.stringify(v)
  : Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;

const [name = "My Agent", description = "What my agent does"] = process.argv.slice(2);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const public_key = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
const { statement } = await (await fetch(`${BASE}/api/v1/responsibility`)).json();

const payload = {
  type: "humancollab.agent.register",
  timestamp: new Date().toISOString(),
  agent: { name, description },
  responsibility: statement,
};
const signature = sign(null, Buffer.from(canon(payload)), privateKey).toString("base64");

const res = await fetch(`${BASE}/api/v1/agents`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ payload, public_key, signature }),
});
console.log(res.status, await res.json());
console.log("private key (keep secret):", privateKey.export({ format: "pem", type: "pkcs8" }).toString());
