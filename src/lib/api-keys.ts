import "server-only";
import { getAddress } from "viem";
import { env } from "@/lib/env";
import { bindingIdFor, consumeApiKeyRateLimit, createApiKeyBinding, policyHash, readApiKeyBinding, revokeApiKeyBinding, rotateApiKeyBinding, scopesToBitmap } from "@/lib/api-key-registry";
import { API_KEY_SCOPES, ApiKeyTokenError, createApiKeyToken, parseBearerAuthorization, verifyApiKeyToken, type ApiKeyPayload, type ApiKeyScope } from "@/lib/api-key-token";
import { ApiKeyVerificationError, verifyApiKeyAgainstRegistry } from "@/lib/api-key-verifier";
import { sha256 } from "@/lib/hash";

export class ApiKeyAuthError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

function secret() {
  if (!env.API_KEY_SECRET) throw new ApiKeyAuthError("api_key_not_configured", 503);
  return env.API_KEY_SECRET;
}

function mapTokenError(error: unknown): never {
  if (error instanceof ApiKeyAuthError) throw error;
  if (error instanceof ApiKeyTokenError) {
    const status = error.code === "api_key_secret_invalid" || error.code === "api_key_secret_too_short" ? 503 : 401;
    throw new ApiKeyAuthError(error.code, status);
  }
  throw error;
}

export type IssueApiKeyInput = {
  owner: string;
  agent?: string;
  policyId?: string;
  delegatedAccount?: string | null;
  scopes?: ApiKeyScope[];
  rateLimitPerMinute?: number;
};

function basePayload(input: IssueApiKeyInput, keyVersion: number) {
  return {
    keyVersion,
    owner: getAddress(input.owner),
    agent: getAddress(input.agent ?? input.owner),
    policyId: input.policyId ?? "gen-x402:testnet:default",
    delegatedAccount: input.delegatedAccount ? getAddress(input.delegatedAccount) : null,
    chainId: 84532,
    scopes: input.scopes ?? [...API_KEY_SCOPES],
    ttlSeconds: env.API_KEY_TTL_SECONDS,
  };
}

export async function issueApiKey(input: IssueApiKeyInput) {
  try {
    const created = createApiKeyToken(basePayload(input, 1), secret());
    const registry = await createApiKeyBinding(created.payload, input.rateLimitPerMinute ?? 20);
    return issuanceResponse(created.token, created.payload, input.rateLimitPerMinute ?? 20, registry.transaction);
  } catch (error) { mapTokenError(error); }
}

export async function verifyApiKey(value: string, requiredScope?: ApiKeyScope) {
  try {
    return await verifyApiKeyAgainstRegistry({ token: value, secret: secret(), requiredScope, clockSkewSeconds: env.API_KEY_CLOCK_SKEW_SECONDS, bindingId: bindingIdFor, policyHash, scopesToBitmap, loadBinding: readApiKeyBinding });
  } catch (error) {
    if (error instanceof ApiKeyVerificationError) {
      const status = error.code === "insufficient_scope" ? 403 : error.code === "api_key_registry_unavailable" ? 503 : 401;
      throw new ApiKeyAuthError(error.code, status);
    }
    mapTokenError(error);
  }
}

export async function verifyAuthorization(value: string | null, requiredScope?: ApiKeyScope) {
  try { return await verifyApiKey(parseBearerAuthorization(value), requiredScope); }
  catch (error) { mapTokenError(error); }
}

export async function authenticateApiRequest(request: Request, requiredScope: ApiKeyScope) {
  const verified = await verifyAuthorization(request.headers.get("authorization"), requiredScope);
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const ipAddress = forwarded.split(",")[0]?.trim() || "unknown";
  try { await consumeApiKeyRateLimit(verified.payload, ipAddress); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("RATE_LIMIT_EXCEEDED")) throw new ApiKeyAuthError("rate_limit_exceeded", 429);
    throw new ApiKeyAuthError("rate_limit_unavailable", 503);
  }
  return verified;
}

export async function authenticateApiRequestIfPresent(request: Request, requiredScope: ApiKeyScope) {
  if (!request.headers.has("authorization") && request.headers.get("x-client-type") !== "agent") return null;
  return authenticateApiRequest(request, requiredScope);
}

export function apiKeyErrorResponse(error: unknown) {
  if (error instanceof ApiKeyAuthError) return { error: error.code, status: error.status };
  return { error: "api_key_verification_failed", status: 503 };
}

export async function rotateApiKey(value: string) {
  const verified = await verifyApiKey(value);
  const rotated = await rotateApiKeyBinding(verified.bindingId, verified.binding.version);
  const created = createApiKeyToken({
    keyVersion: rotated.version,
    owner: verified.payload.owner,
    agent: verified.payload.agent,
    policyId: verified.payload.policyId,
    delegatedAccount: verified.payload.delegatedAccount,
    chainId: verified.payload.chainId,
    scopes: verified.payload.scopes,
    ttlSeconds: env.API_KEY_TTL_SECONDS,
  }, secret());
  return issuanceResponse(created.token, created.payload, verified.binding.rateLimitPerMinute, rotated.transaction);
}

export async function revokeApiKey(value: string) {
  const verified = await verifyApiKey(value);
  const transaction = await revokeApiKeyBinding(verified.bindingId);
  return { revoked: true, keyId: verified.payload.keyId, bindingId: verified.bindingId, transaction };
}

function issuanceResponse(apiKey: string, payload: ApiKeyPayload, rateLimitPerMinute: number, transaction: string) {
  return {
    apiKey,
    keyId: payload.keyId,
    keyVersion: payload.keyVersion,
    owner: payload.owner,
    agent: payload.agent,
    policyId: payload.policyId,
    delegatedAccount: payload.delegatedAccount,
    chainId: payload.chainId,
    scopes: payload.scopes,
    rateLimitPerMinute,
    issuedAt: new Date(payload.issuedAt * 1000).toISOString(),
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    transaction,
    warning: "This API key is shown once. It cannot be recovered; rotate it if lost.",
  };
}

export async function verifyProofOfWork(challenge: string, nonce: string, difficulty = 4) {
  const [issued, random, signature] = challenge.split(".");
  if (!issued || !random || !signature || !env.RESULT_SIGNING_SECRET) return false;
  const issuedAt = Number(issued);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 5 * 60_000 || issuedAt > Date.now() + 30_000) return false;
  const expected = await sha256(`${issued}.${random}.${env.RESULT_SIGNING_SECRET}`);
  if (expected.slice(2) !== signature) return false;
  const digest = (await sha256(`${challenge}:${nonce}`)).slice(2);
  return digest.startsWith("0".repeat(difficulty));
}

export async function createProofOfWorkChallenge() {
  if (!env.RESULT_SIGNING_SECRET) throw new Error("RESULT_SIGNING_SECRET is required for agent enrollment");
  const issuedAt = Date.now();
  const random = crypto.randomUUID();
  const signature = (await sha256(`${issuedAt}.${random}.${env.RESULT_SIGNING_SECRET}`)).slice(2);
  return `${issuedAt}.${random}.${signature}`;
}
