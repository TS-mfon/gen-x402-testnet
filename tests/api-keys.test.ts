import { describe, expect, it } from "vitest";
import { keccak256, stringToHex, type Hex } from "viem";
import { API_KEY_PREFIX, ApiKeyTokenError, createApiKeyToken, decodeApiKeySecret, parseBearerAuthorization, verifyApiKeyToken } from "@/lib/api-key-token";
import { ApiKeyVerificationError, createRateLimitBuckets, verifyApiKeyAgainstRegistry, type AuthoritativeApiKeyBinding } from "@/lib/api-key-verifier";
import { redactSensitive } from "@/lib/redact";

const secret = Buffer.alloc(32, 7).toString("base64url");
const now = 1_800_000_000;
const owner = "0x1111111111111111111111111111111111111111" as const;
const agent = "0x2222222222222222222222222222222222222222" as const;
const delegatedAccount = "0x3333333333333333333333333333333333333333" as const;
const policyId = "gen-x402:testnet:default";
const scopes = ["jobs:create", "jobs:read:own"] as const;
const policyHash = (value: string) => keccak256(stringToHex(value));
const scopesToBitmap = (values: readonly string[]) => values.reduce((bitmap, value) => bitmap | (value === "jobs:create" ? 2n : value === "jobs:read:own" ? 4n : 0n), 0n);
const bindingId = () => `0x${"ab".repeat(32)}` as Hex;

function token(version = 1, overrides: Record<string, unknown> = {}) {
  return createApiKeyToken({ keyVersion: version, owner, agent, policyId, delegatedAccount, chainId: 84532, scopes: [...scopes], ttlSeconds: 3600, ...overrides } as never, secret, now);
}

function binding(overrides: Partial<AuthoritativeApiKeyBinding> = {}): AuthoritativeApiKeyBinding {
  return { owner, agent, policyId: policyHash(policyId), delegatedAccount, chainId: 84532, version: 1, rateLimitPerMinute: 20, scopes: 6n, active: true, ...overrides };
}

async function verify(overrides: { raw?: string; state?: AuthoritativeApiKeyBinding | null; loader?: () => Promise<AuthoritativeApiKeyBinding | null>; requiredScope?: "jobs:create" | "quotes:create" } = {}) {
  return verifyApiKeyAgainstRegistry({ token: overrides.raw ?? token().token, secret, requiredScope: overrides.requiredScope, nowSeconds: now + 1, clockSkewSeconds: 0, bindingId, policyHash, scopesToBitmap: scopesToBitmap as never, loadBinding: overrides.loader ?? (async () => overrides.state === undefined ? binding() : overrides.state) });
}

describe("stateless API keys", () => {
  it("creates the required opaque-looking signed format and verifies it", () => {
    const created = token();
    expect(created.token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(verifyApiKeyToken(created.token, secret, { nowSeconds: now + 1 }).keyId).toBe(created.payload.keyId);
    expect(JSON.stringify(created.payload)).not.toContain(secret);
  });

  it("rejects payload and signature tampering", () => {
    const created = token();
    const [payload, signature] = created.token.slice(API_KEY_PREFIX.length).split(".");
    expect(() => verifyApiKeyToken(`${API_KEY_PREFIX}${payload.slice(0, -1)}A.${signature}`, secret, { nowSeconds: now })).toThrowError(ApiKeyTokenError);
    expect(() => verifyApiKeyToken(`${API_KEY_PREFIX}${payload}.${signature.slice(0, -1)}A`, secret, { nowSeconds: now })).toThrowError("invalid_api_key_signature");
  });

  it.each(["", "wrong_value", "app_missing", "app_a.b.c", "app_!.abc", "app_abc.!", "app_.abc", "app_abc."])("rejects malformed token %s", raw => {
    expect(() => verifyApiKeyToken(raw, secret, { nowSeconds: now })).toThrow(ApiKeyTokenError);
  });

  it("rejects invalid JSON and strict claim changes after valid signing", () => {
    const crypto = require("node:crypto") as typeof import("node:crypto");
    for (const payload of ["not-json", JSON.stringify({ type: "agent" })]) {
      const encoded = Buffer.from(payload).toString("base64url");
      const signature = crypto.createHmac("sha256", decodeApiKeySecret(secret)).update(encoded).digest("base64url");
      expect(() => verifyApiKeyToken(`app_${encoded}.${signature}`, secret, { nowSeconds: now })).toThrow("invalid_api_key_claims");
    }
  });

  it("rejects expired and future-issued keys", () => {
    const expired = createApiKeyToken({ keyVersion: 1, owner, agent, policyId, delegatedAccount, chainId: 84532, scopes: [...scopes], ttlSeconds: 60 }, secret, now - 120);
    expect(() => verifyApiKeyToken(expired.token, secret, { nowSeconds: now, clockSkewSeconds: 0 })).toThrow("api_key_expired");
    const future = token(1, { ttlSeconds: 3600 });
    expect(() => verifyApiKeyToken(future.token, secret, { nowSeconds: now - 60, clockSkewSeconds: 0 })).toThrow("api_key_not_yet_valid");
  });

  it("requires exact Bearer authorization", () => {
    const raw = token().token;
    expect(parseBearerAuthorization(`Bearer ${raw}`)).toBe(raw);
    expect(() => parseBearerAuthorization(null)).toThrow("authorization_required");
    expect(() => parseBearerAuthorization(`bearer ${raw}`)).toThrow("invalid_authorization_scheme");
    expect(() => parseBearerAuthorization(`Bearer  ${raw}`)).toThrow("invalid_authorization_scheme");
  });

  it("rejects short signing secrets", () => expect(() => createApiKeyToken({ keyVersion: 1, owner, agent, policyId, delegatedAccount, chainId: 84532, scopes: [...scopes] }, "short", now)).toThrow("api_key_secret_too_short"));

  it("validates authoritative state and required scopes", async () => {
    await expect(verify({ requiredScope: "jobs:create" })).resolves.toBeTruthy();
    await expect(verify({ requiredScope: "quotes:create" })).rejects.toMatchObject({ code: "insufficient_scope" });
  });

  it.each([
    ["missing binding", null, "api_key_binding_not_found"],
    ["revocation", binding({ active: false }), "api_key_revoked"],
    ["rotation", binding({ version: 2 }), "api_key_version_mismatch"],
    ["owner mismatch", binding({ owner: "0x4444444444444444444444444444444444444444" }), "api_key_binding_mismatch"],
    ["agent mismatch", binding({ agent: "0x4444444444444444444444444444444444444444" }), "api_key_binding_mismatch"],
    ["policy mismatch", binding({ policyId: `0x${"cd".repeat(32)}` }), "api_key_binding_mismatch"],
    ["chain mismatch", binding({ chainId: 1 }), "api_key_binding_mismatch"],
    ["delegation mismatch", binding({ delegatedAccount: "0x4444444444444444444444444444444444444444" }), "api_key_binding_mismatch"],
    ["scope mismatch", binding({ scopes: 2n }), "api_key_binding_mismatch"],
  ])("rejects %s", async (_, state, code) => expect(verify({ state: state as AuthoritativeApiKeyBinding | null })).rejects.toMatchObject({ code }));

  it("fails closed when the registry cannot be read", async () => {
    await expect(verify({ loader: async () => { throw new Error("rpc down"); } })).rejects.toEqual(new ApiKeyVerificationError("api_key_registry_unavailable"));
  });

  it("creates independent non-reversible rate buckets for key, agent, owner, and IP", () => {
    const created = token().payload;
    const buckets = createRateLimitBuckets(secret, created, "203.0.113.9");
    expect(new Set(buckets).size).toBe(4);
    expect(buckets.join(" ")).not.toContain(created.keyId);
    expect(buckets.join(" ")).not.toContain(owner.slice(2));
    expect(buckets.join(" ")).not.toContain("203.0.113.9");
  });

  it("redacts credentials and signing secrets recursively", () => {
    const raw = token().token;
    const redacted = JSON.stringify(redactSensitive({ authorization: `Bearer ${raw}`, nested: { apiKey: raw, API_KEY_SECRET: secret }, safe: "ok" }));
    expect(redacted).not.toContain(raw);
    expect(redacted).not.toContain(secret);
    expect(redacted).toContain("[REDACTED]");
  });
});
