import "server-only";
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "@/lib/env";

const abi = [
  { type: "function", name: "recordPayment", stateMutability: "nonpayable", inputs: [{name:"jobId",type:"bytes32"},{name:"quoteId",type:"bytes32"},{name:"requestHash",type:"bytes32"},{name:"payer",type:"address"},{name:"customerAmount",type:"uint256"}], outputs: [] },
  { type: "function", name: "setApiKey", stateMutability: "nonpayable", inputs: [{name:"keyId",type:"bytes32"},{name:"keyHash",type:"bytes32"},{name:"ownerHash",type:"bytes32"},{name:"scopes",type:"uint256"},{name:"rateLimitPerMinute",type:"uint32"},{name:"expiresAt",type:"uint64"},{name:"active",type:"bool"}], outputs: [] },
  { type: "function", name: "updateJobProof", stateMutability: "nonpayable", inputs: [{name:"jobId",type:"bytes32"},{name:"evidenceHash",type:"bytes32"},{name:"verdictHash",type:"bytes32"}], outputs: [] },
  { type: "function", name: "refundJob", stateMutability: "nonpayable", inputs: [{name:"jobId",type:"bytes32"}], outputs: [] },
] as const;

function clients() {
  if (!env.GENLAYER_SIGNER_PRIVATE_KEY) return null;
  const key = (env.GENLAYER_SIGNER_PRIVATE_KEY.startsWith("0x") ? env.GENLAYER_SIGNER_PRIVATE_KEY : `0x${env.GENLAYER_SIGNER_PRIVATE_KEY}`) as Hex;
  const account = privateKeyToAccount(key);
  return { account, wallet: createWalletClient({ account, chain: baseSepolia, transport: http(env.BASE_SEPOLIA_RPC_URL) }), publicClient: createPublicClient({ chain: baseSepolia, transport: http(env.BASE_SEPOLIA_RPC_URL) }) };
}

export function bytes32Id(value: string) { return keccak256(stringToHex(value)); }

export async function recordPaymentProof(input: { jobId: string; quoteId: string; requestHash: Hex; payer: `0x${string}`; customerAmount: bigint }) {
  const configured = clients(); if (!configured) return undefined;
  const hash = await configured.wallet.writeContract({ account: configured.account, address: env.CONTROL_CONTRACT_ADDRESS as `0x${string}`, abi, functionName: "recordPayment", args: [bytes32Id(input.jobId), bytes32Id(input.quoteId), input.requestHash, input.payer, input.customerAmount] });
  await configured.publicClient.waitForTransactionReceipt({ hash }); return hash;
}

export async function registerApiKeyProof(input: { keyId: string; keyHash: Hex; ownerHash: Hex; scopes: bigint; rateLimit: number; expiresAt: number }) {
  const configured = clients(); if (!configured) return undefined;
  const hash = await configured.wallet.writeContract({ account: configured.account, address: env.CONTROL_CONTRACT_ADDRESS as `0x${string}`, abi, functionName: "setApiKey", args: [bytes32Id(input.keyId), input.keyHash, input.ownerHash, input.scopes, input.rateLimit, BigInt(input.expiresAt), true] });
  await configured.publicClient.waitForTransactionReceipt({ hash }); return hash;
}

export async function updateJobProof(input: { jobId: string; evidenceHash: Hex; verdictHash: Hex }) {
  const configured = clients(); if (!configured) return undefined;
  const hash = await configured.wallet.writeContract({ account: configured.account, address: env.CONTROL_CONTRACT_ADDRESS as `0x${string}`, abi, functionName: "updateJobProof", args: [bytes32Id(input.jobId), input.evidenceHash, input.verdictHash] });
  await configured.publicClient.waitForTransactionReceipt({ hash }); return hash;
}

export async function refundJobProof(jobId: string) {
  const configured = clients(); if (!configured) return undefined;
  const hash = await configured.wallet.writeContract({ account: configured.account, address: env.CONTROL_CONTRACT_ADDRESS as `0x${string}`, abi, functionName: "refundJob", args: [bytes32Id(jobId)] });
  await configured.publicClient.waitForTransactionReceipt({ hash }); return hash;
}
