import { CdpClient } from "@coinbase/cdp-sdk";
import { fromCdpEvmAccount } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { env } from "@/lib/env";
import type { IntelligenceRequest } from "@/lib/domain";
import { sha256, stableJson } from "@/lib/hash";
import { assertSafeRemoteUrl } from "@/lib/security";
import { appendEvent, consumeDailyBudget, listProviders } from "@/lib/store";

const BASE_SEPOLIA = "eip155:84532";
const BASE_SEPOLIA_USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
let cdpPaidFetchPromise: Promise<typeof fetch> | undefined;

function getCdpPaidFetch() {
  if (!cdpPaidFetchPromise) cdpPaidFetchPromise = (async () => {
    const cdp = new CdpClient({ apiKeyId: env.CDP_API_KEY_ID, apiKeySecret: env.CDP_API_KEY_SECRET, walletSecret: env.CDP_WALLET_SECRET });
    const account = await cdp.evm.getOrCreateAccount({ name: "gen-x402-testnet-operations" });
    const client = new x402Client();
    registerExactEvmScheme(client, { signer: fromCdpEvmAccount(account), networks: [BASE_SEPOLIA] });
    return wrapFetchWithPayment(fetch, client) as typeof fetch;
  })();
  return cdpPaidFetchPromise;
}

function providerUrl(provider: any, input: IntelligenceRequest) {
  let endpoint = provider.endpoint as string;
  const pathValues = { ...(provider.fixture?.path ?? {}), ...(input.subject.address ? { address: input.subject.address } : {}) };
  for (const [key, value] of Object.entries(pathValues)) endpoint = endpoint.replace(`:${key}`, encodeURIComponent(String(value)));
  const url = assertSafeRemoteUrl(endpoint);
  for (const [key, value] of Object.entries(provider.fixture?.query ?? {})) url.searchParams.set(key, String(value));
  return url;
}

export async function selectProviders(input: IntelligenceRequest, max: number) {
  const all = await listProviders();
  const terms = `${input.task} ${JSON.stringify(input.context)}`.toLowerCase();
  return all.filter((provider: any) => provider.test_enabled && provider.network === BASE_SEPOLIA && provider.asset.toLowerCase() === BASE_SEPOLIA_USDC && Number(provider.price_atomic) <= env.TESTNET_JOB_BUDGET_ATOMIC)
    .map((provider: any) => ({ ...provider, relevance: (terms.includes(provider.category) ? 40 : 0) + Number(provider.quality_score ?? 50) + Number(provider.availability_score ?? 50) }))
    .sort((left: any, right: any) => right.relevance - left.relevance || Number(left.price_atomic) - Number(right.price_atomic))
    .slice(0, Math.min(max, 2));
}

export async function collectEvidence(input: IntelligenceRequest, providers: any[]) {
  const hasCdpWallet = Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET && env.CDP_WALLET_SECRET);
  if (!hasCdpWallet) return [{ id: crypto.randomUUID(), providerId: "gateway", retrievedAt: new Date().toISOString(), rawResponseHash: await sha256(stableJson(input)), costAtomic: "0", claims: [{ statement: "CDP testnet operations wallet is not configured", value: { task: input.task }, confidence: 0 }] }];
  const total = providers.reduce((sum, provider) => sum + Number(provider.price_atomic), 0);
  if (total > env.TESTNET_JOB_BUDGET_ATOMIC) throw new Error("Selected providers exceed the per-job testnet budget");
  await consumeDailyBudget(total);
  const paidFetch = await getCdpPaidFetch();
  const evidence = [];
  for (const provider of providers) {
    const startedAt = Date.now();
    const url = providerUrl(provider, input);
    const method = provider.method === "POST" ? "POST" : "GET";
    const init: RequestInit = { method, headers: { "idempotency-key": `${input.clientRequestId}:${provider.id}` }, signal: AbortSignal.timeout(20_000) };
    if (method === "POST") {
      init.headers = { ...init.headers, "content-type": "application/json" };
      init.body = JSON.stringify(provider.fixture?.body ?? { task: input.task, subject: input.subject, context: input.context });
    }
    try {
      const response = await paidFetch(url, init);
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      if (text.length > 2_000_000) throw new Error("Provider response too large");
      let value: unknown;
      try { value = JSON.parse(text); } catch { value = { text: text.slice(0, 50_000) }; }
      const receipt = response.headers.get("payment-response") ?? response.headers.get("x-payment-response") ?? undefined;
      await appendEvent("provider.succeeded", { providerId: provider.id, endpoint: provider.endpoint, costAtomic: provider.price_atomic, latencyMs: Date.now() - startedAt, paymentReceipt: receipt });
      evidence.push({ id: crypto.randomUUID(), providerId: provider.id, retrievedAt: new Date().toISOString(), rawResponseHash: await sha256(text), costAtomic: String(provider.price_atomic), claims: [{ statement: `Response from ${provider.name}`, value, confidence: .8 }], paymentReceipt: receipt });
    } catch (error) {
      await appendEvent("provider.failed", { providerId: provider.id, endpoint: provider.endpoint, costAtomic: provider.price_atomic, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown provider error" });
    }
  }
  if (evidence.length) return evidence;
  return [{ id: crypto.randomUUID(), providerId: "gateway", retrievedAt: new Date().toISOString(), rawResponseHash: await sha256(stableJson(input)), costAtomic: "0", claims: [{ statement: "No paid testnet provider returned usable evidence", value: { task: input.task }, confidence: .1 }] }];
}
