import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getAddress } from "viem";
import { z } from "zod";

export const API_KEY_PREFIX = "app_";
export const API_KEY_SCHEMA_VERSION = 1;
export const API_KEY_DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
export const API_KEY_SCOPES = ["quotes:create", "jobs:create", "jobs:read:own", "providers:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value => getAddress(value));

export const apiKeyPayloadSchema = z.object({
  type: z.literal("agent"),
  schemaVersion: z.literal(API_KEY_SCHEMA_VERSION),
  keyId: z.string().uuid(),
  keyVersion: z.number().int().positive(),
  owner: addressSchema,
  agent: addressSchema,
  policyId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9:_./-]+$/),
  delegatedAccount: addressSchema.nullable(),
  chainId: z.number().int().positive(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length).refine(scopes => new Set(scopes).size === scopes.length),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict().refine(payload => payload.expiresAt > payload.issuedAt, { message: "expiresAt must be after issuedAt" });

export type ApiKeyPayload = z.infer<typeof apiKeyPayloadSchema>;

export type CreateApiKeyPayloadInput = Omit<ApiKeyPayload, "type" | "schemaVersion" | "keyId" | "issuedAt" | "expiresAt"> & {
  ttlSeconds?: number;
};

export class ApiKeyTokenError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function decodeApiKeySecret(value: string): Buffer {
  const trimmed = value.trim();
  let secret: Buffer;
  if (/^(?:0x)?[0-9a-fA-F]{64,}$/.test(trimmed)) secret = Buffer.from(trimmed.replace(/^0x/, ""), "hex");
  else {
    try { secret = Buffer.from(trimmed, "base64url"); }
    catch { throw new ApiKeyTokenError("api_key_secret_invalid"); }
  }
  if (secret.length < 32) throw new ApiKeyTokenError("api_key_secret_too_short");
  return secret;
}

function signEncodedPayload(encodedPayload: string, secret: Buffer) {
  return createHmac("sha256", secret).update(encodedPayload, "utf8").digest();
}

export function createApiKeyToken(input: CreateApiKeyPayloadInput, secretValue: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const ttlSeconds = input.ttlSeconds ?? API_KEY_DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) throw new ApiKeyTokenError("api_key_ttl_invalid");
  const payload = apiKeyPayloadSchema.parse({
    type: "agent",
    schemaVersion: API_KEY_SCHEMA_VERSION,
    keyId: randomUUID(),
    keyVersion: input.keyVersion,
    owner: input.owner,
    agent: input.agent,
    policyId: input.policyId,
    delegatedAccount: input.delegatedAccount,
    chainId: input.chainId,
    scopes: [...input.scopes].sort(),
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + ttlSeconds,
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signEncodedPayload(encodedPayload, decodeApiKeySecret(secretValue)).toString("base64url");
  return { token: `${API_KEY_PREFIX}${encodedPayload}.${signature}`, payload };
}

export function verifyApiKeyToken(token: string, secretValue: string, options: { nowSeconds?: number; clockSkewSeconds?: number } = {}) {
  if (!token.startsWith(API_KEY_PREFIX)) throw new ApiKeyTokenError("malformed_api_key");
  const body = token.slice(API_KEY_PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new ApiKeyTokenError("malformed_api_key");
  const [encodedPayload, encodedSignature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(encodedPayload) || !/^[A-Za-z0-9_-]+$/.test(encodedSignature)) throw new ApiKeyTokenError("malformed_api_key");
  let receivedSignature: Buffer;
  try { receivedSignature = Buffer.from(encodedSignature, "base64url"); }
  catch { throw new ApiKeyTokenError("malformed_api_key"); }
  const expectedSignature = signEncodedPayload(encodedPayload, decodeApiKeySecret(secretValue));
  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) throw new ApiKeyTokenError("invalid_api_key_signature");
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")); }
  catch { throw new ApiKeyTokenError("invalid_api_key_claims"); }
  const parsed = apiKeyPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new ApiKeyTokenError("invalid_api_key_claims");
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 30;
  if (parsed.data.issuedAt > now + skew) throw new ApiKeyTokenError("api_key_not_yet_valid");
  if (parsed.data.expiresAt <= now - skew) throw new ApiKeyTokenError("api_key_expired");
  return parsed.data;
}

export function parseBearerAuthorization(value: string | null) {
  if (!value) throw new ApiKeyTokenError("authorization_required");
  const match = /^Bearer ([^\s]+)$/.exec(value);
  if (!match) throw new ApiKeyTokenError("invalid_authorization_scheme");
  return match[1];
}
