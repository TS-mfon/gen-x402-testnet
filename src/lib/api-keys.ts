import "server-only";
import { createPublicClient, http, keccak256, stringToHex, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "@/lib/env";
import { bytes32Id, registerApiKeyProof } from "@/lib/control";
import { sha256 } from "@/lib/hash";

const keyAbi = [{ type: "function", name: "apiKeys", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{name:"keyHash",type:"bytes32"},{name:"ownerHash",type:"bytes32"},{name:"expiresAt",type:"uint64"},{name:"rateLimitPerMinute",type:"uint32"},{name:"scopes",type:"uint256"},{name:"active",type:"bool"}] }] as const;

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `gx_test_${Buffer.from(bytes).toString("base64url")}`;
}

export async function issueApiKey(owner: string, rateLimit = 10) {
  const keyId = crypto.randomUUID();
  const secret = randomSecret();
  const keyHash = await sha256(`${keyId}:${secret}`) as Hex;
  const ownerHash = await sha256(owner.toLowerCase()) as Hex;
  const expiresAt = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
  const transaction = await registerApiKeyProof({ keyId, keyHash, ownerHash, scopes: 0b11111n, rateLimit, expiresAt });
  return { keyId, secret, apiKey: `${keyId}.${secret}`, owner, scopes: ["quotes:create", "jobs:create", "jobs:read:own", "providers:read"], rateLimitPerMinute: rateLimit, expiresAt: new Date(expiresAt * 1000).toISOString(), transaction, warning: "This API key is shown once. Save it now; it cannot be recovered." };
}

export async function verifyApiKey(value: string) {
  const separator = value.indexOf(".");
  if (separator < 1) return null;
  const keyId = value.slice(0, separator); const secret = value.slice(separator + 1);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(env.BASE_SEPOLIA_RPC_URL) });
  const stored = await publicClient.readContract({ address: env.CONTROL_CONTRACT_ADDRESS as `0x${string}`, abi: keyAbi, functionName: "apiKeys", args: [bytes32Id(keyId)] });
  const [storedHash, ownerHash, expiresAt, rateLimit, scopes, active] = stored;
  const candidate = await sha256(`${keyId}:${secret}`);
  if (!active || storedHash.toLowerCase() !== candidate.toLowerCase() || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return null;
  return { keyId, ownerHash, expiresAt: Number(expiresAt), rateLimit: Number(rateLimit), scopes: BigInt(scopes) };
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
