import { createHmac } from "node:crypto";
import { getAddress, type Hex } from "viem";
import { ApiKeyTokenError, verifyApiKeyToken, type ApiKeyPayload, type ApiKeyScope } from "@/lib/api-key-token";

export type AuthoritativeApiKeyBinding = {
  owner: `0x${string}`;
  agent: `0x${string}`;
  policyId: Hex;
  delegatedAccount: `0x${string}`;
  chainId: number;
  version: number;
  rateLimitPerMinute: number;
  scopes: bigint;
  active: boolean;
};

export class ApiKeyVerificationError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function assertApiKeyBinding(input: {
  payload: ApiKeyPayload;
  binding: AuthoritativeApiKeyBinding | null;
  expectedPolicyHash: Hex;
  expectedScopes: bigint;
  requiredScope?: ApiKeyScope;
}) {
  const { payload, binding } = input;
  if (!binding) throw new ApiKeyVerificationError("api_key_binding_not_found");
  if (!binding.active) throw new ApiKeyVerificationError("api_key_revoked");
  if (binding.version !== payload.keyVersion) throw new ApiKeyVerificationError("api_key_version_mismatch");
  const delegatedAccount = payload.delegatedAccount ?? "0x0000000000000000000000000000000000000000";
  const mismatch = getAddress(binding.owner) !== getAddress(payload.owner)
    || getAddress(binding.agent) !== getAddress(payload.agent)
    || binding.policyId.toLowerCase() !== input.expectedPolicyHash.toLowerCase()
    || getAddress(binding.delegatedAccount) !== getAddress(delegatedAccount)
    || binding.chainId !== payload.chainId
    || binding.scopes !== input.expectedScopes;
  if (mismatch) throw new ApiKeyVerificationError("api_key_binding_mismatch");
  if (input.requiredScope && !payload.scopes.includes(input.requiredScope)) throw new ApiKeyVerificationError("insufficient_scope");
  return binding;
}

export async function verifyApiKeyAgainstRegistry(input: {
  token: string;
  secret: string;
  requiredScope?: ApiKeyScope;
  nowSeconds?: number;
  clockSkewSeconds?: number;
  bindingId: (payload: ApiKeyPayload) => Hex;
  policyHash: (policyId: string) => Hex;
  scopesToBitmap: (scopes: readonly ApiKeyScope[]) => bigint;
  loadBinding: (bindingId: Hex) => Promise<AuthoritativeApiKeyBinding | null>;
}) {
  let payload: ApiKeyPayload;
  try { payload = verifyApiKeyToken(input.token, input.secret, { nowSeconds: input.nowSeconds, clockSkewSeconds: input.clockSkewSeconds }); }
  catch (error) { if (error instanceof ApiKeyTokenError) throw new ApiKeyVerificationError(error.code); throw error; }
  const bindingId = input.bindingId(payload);
  let binding: AuthoritativeApiKeyBinding | null;
  try { binding = await input.loadBinding(bindingId); }
  catch { throw new ApiKeyVerificationError("api_key_registry_unavailable"); }
  assertApiKeyBinding({ payload, binding, expectedPolicyHash: input.policyHash(payload.policyId), expectedScopes: input.scopesToBitmap(payload.scopes), requiredScope: input.requiredScope });
  return { payload, binding: binding!, bindingId };
}

export function createRateLimitBuckets(secret: string, payload: Pick<ApiKeyPayload, "keyId" | "agent" | "owner">, ipAddress: string) {
  const bucket = (kind: string, value: string) => `0x${createHmac("sha256", secret).update(`${kind}:${value.toLowerCase()}`).digest("hex")}` as Hex;
  return [bucket("key", payload.keyId), bucket("agent", payload.agent), bucket("owner", payload.owner), bucket("ip", ipAddress)] as const;
}
