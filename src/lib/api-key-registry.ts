import "server-only";
import { createPublicClient, createWalletClient, encodeAbiParameters, getAddress, http, keccak256, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { env } from "@/lib/env";
import type { ApiKeyPayload } from "@/lib/api-key-token";
import { createRateLimitBuckets, type AuthoritativeApiKeyBinding } from "@/lib/api-key-verifier";

const registryAbi = [
  { type: "function", name: "bindings", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{name:"owner",type:"address"},{name:"agent",type:"address"},{name:"policyId",type:"bytes32"},{name:"delegatedAccount",type:"address"},{name:"chainId",type:"uint64"},{name:"version",type:"uint32"},{name:"rateLimitPerMinute",type:"uint32"},{name:"scopes",type:"uint256"},{name:"active",type:"bool"}] },
  { type: "function", name: "setBinding", stateMutability: "nonpayable", inputs: [{name:"owner",type:"address"},{name:"agent",type:"address"},{name:"policyId",type:"bytes32"},{name:"delegatedAccount",type:"address"},{name:"chainId",type:"uint64"},{name:"scopes",type:"uint256"},{name:"rateLimitPerMinute",type:"uint32"}], outputs: [{name:"bindingId",type:"bytes32"}] },
  { type: "function", name: "rotateBinding", stateMutability: "nonpayable", inputs: [{name:"bindingId",type:"bytes32"}], outputs: [{name:"nextVersion",type:"uint32"}] },
  { type: "function", name: "revokeBinding", stateMutability: "nonpayable", inputs: [{name:"bindingId",type:"bytes32"}], outputs: [] },
  { type: "function", name: "consumeRateLimits", stateMutability: "nonpayable", inputs: [{name:"bindingId",type:"bytes32"},{name:"buckets",type:"bytes32[4]"},{name:"window",type:"uint64"}], outputs: [] },
] as const;

const zeroAddress = "0x0000000000000000000000000000000000000000" as const;
export const scopeBits = { "quotes:create": 1n, "jobs:create": 2n, "jobs:read:own": 4n, "providers:read": 8n } as const;

export type ApiKeyBinding = AuthoritativeApiKeyBinding;

function registryAddress() {
  if (!env.API_KEY_REGISTRY_ADDRESS) throw new Error("API_KEY_REGISTRY_ADDRESS is not configured");
  return env.API_KEY_REGISTRY_ADDRESS as `0x${string}`;
}

function signerKey() {
  const value = env.PLATFORM_SIGNER_PRIVATE_KEY ?? env.GENLAYER_SIGNER_PRIVATE_KEY;
  if (!value) throw new Error("PLATFORM_SIGNER_PRIVATE_KEY is not configured");
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function publicClient() { return createPublicClient({ chain: baseSepolia, transport: http(env.BASE_SEPOLIA_RPC_URL) }); }
function writeClients() {
  const account = privateKeyToAccount(signerKey());
  return { account, wallet: createWalletClient({ account, chain: baseSepolia, transport: http(env.BASE_SEPOLIA_RPC_URL) }), publicClient: publicClient() };
}

export function policyHash(policyId: string) { return keccak256(stringToHex(policyId)); }
export function scopesToBitmap(scopes: readonly (keyof typeof scopeBits)[]) { return scopes.reduce((value, scope) => value | scopeBits[scope], 0n); }
export function bindingIdFor(input: Pick<ApiKeyPayload, "owner" | "agent" | "policyId" | "delegatedAccount" | "chainId">) {
  return keccak256(encodeAbiParameters(
    [{type:"address"},{type:"address"},{type:"bytes32"},{type:"address"},{type:"uint64"}],
    [getAddress(input.owner), getAddress(input.agent), policyHash(input.policyId), input.delegatedAccount ? getAddress(input.delegatedAccount) : zeroAddress, BigInt(input.chainId)],
  ));
}

export async function readApiKeyBinding(bindingId: Hex): Promise<ApiKeyBinding | null> {
  const stored = await publicClient().readContract({ address: registryAddress(), abi: registryAbi, functionName: "bindings", args: [bindingId] });
  const [owner, agent, policyId, delegatedAccount, chainId, version, rateLimitPerMinute, scopes, active] = stored;
  if (owner.toLowerCase() === zeroAddress) return null;
  return { owner, agent, policyId, delegatedAccount, chainId: Number(chainId), version: Number(version), rateLimitPerMinute: Number(rateLimitPerMinute), scopes: BigInt(scopes), active };
}

async function writeRegistry(functionName: "setBinding" | "rotateBinding" | "revokeBinding" | "consumeRateLimits", args: readonly unknown[]) {
  const clients = writeClients();
  const hash = await clients.wallet.writeContract({ account: clients.account, address: registryAddress(), abi: registryAbi, functionName, args } as never);
  await clients.publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  return hash;
}

export async function createApiKeyBinding(payload: ApiKeyPayload, rateLimitPerMinute: number) {
  const bindingId = bindingIdFor(payload);
  const transaction = await writeRegistry("setBinding", [payload.owner, payload.agent, policyHash(payload.policyId), payload.delegatedAccount ?? zeroAddress, BigInt(payload.chainId), scopesToBitmap(payload.scopes), rateLimitPerMinute]);
  return { bindingId, version: 1, transaction };
}

export async function rotateApiKeyBinding(bindingId: Hex, currentVersion: number) {
  const transaction = await writeRegistry("rotateBinding", [bindingId]);
  return { version: currentVersion + 1, transaction };
}

export async function revokeApiKeyBinding(bindingId: Hex) { return writeRegistry("revokeBinding", [bindingId]); }

export async function consumeApiKeyRateLimit(payload: ApiKeyPayload, ipAddress: string) {
  const bindingId = bindingIdFor(payload);
  if (!env.API_KEY_SECRET) throw new Error("API_KEY_SECRET is not configured");
  const buckets = createRateLimitBuckets(env.API_KEY_SECRET, payload, ipAddress);
  const window = BigInt(Math.floor(Date.now() / 60_000));
  return writeRegistry("consumeRateLimits", [bindingId, buckets, window]);
}
