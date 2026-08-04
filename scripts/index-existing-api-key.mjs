import { readFile } from "node:fs/promises";

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

const runtime = parseEnv(await readFile(".env.local", "utf8"));
const key = parseEnv(await readFile(".env.api-key", "utf8"));
if (!runtime.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is missing from .env.local");
if (!key.GEN_X402_KEY_ID || !key.GEN_X402_KEY_OWNER) throw new Error("API key metadata is missing from .env.api-key");
process.env.BLOB_READ_WRITE_TOKEN = runtime.BLOB_READ_WRITE_TOKEN;

const { put } = await import("@vercel/blob");
const record = {
  keyId: key.GEN_X402_KEY_ID,
  owner: key.GEN_X402_KEY_OWNER,
  scopes: ["quotes:create", "jobs:create", "jobs:read:own", "providers:read"],
  rateLimitPerMinute: 20,
  expiresAt: key.GEN_X402_KEY_EXPIRES_AT,
  transaction: key.GEN_X402_KEY_TRANSACTION,
  createdAt: new Date().toISOString(),
};

await put(`testnet/admin/api-keys/${record.keyId}.json`, JSON.stringify(record), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0 });
await put(`testnet/events/${Date.now()}-${crypto.randomUUID()}.json`, JSON.stringify({ event: "api_key.issued", payload: record, at: new Date().toISOString() }), { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json", cacheControlMaxAge: 0 });
console.log(JSON.stringify({ indexed: true, keyId: record.keyId, owner: record.owner, expiresAt: record.expiresAt, transaction: record.transaction }, null, 2));
