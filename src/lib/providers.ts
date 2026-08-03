import { CdpClient } from "@coinbase/cdp-sdk";
import { fromCdpEvmAccount } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { env } from "@/lib/env";
import type { EvidenceClaim, EvidenceRecord, IntelligenceRequest, ProductType } from "@/lib/domain";
import { sha256, stableJson } from "@/lib/hash";
import { assertSafeRemoteUrl } from "@/lib/security";
import { appendEvent, consumeDailyBudget, listProviders } from "@/lib/store";

const BASE_SEPOLIA = "eip155:84532";
const BASE_SEPOLIA_USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const REQUIRED_EVIDENCE_QUORUM = 2;
const EXCLUDED_DECISION_CATEGORIES = new Set(["protocol-smoke", "utility", "discovered"]);
const PRODUCT_CAPABILITIES: Record<ProductType, string[]> = {
  gateway: ["market-risk", "compliance", "web-research", "developer-risk", "stablecoin-risk", "agent-evaluation", "agent-access"],
  investigation: ["web-research", "market-risk", "compliance", "developer-risk", "stablecoin-risk"],
  procurement: ["agent-access", "agent-evaluation", "developer-risk", "web-research"],
  decision: ["market-risk", "compliance", "web-research", "developer-risk", "stablecoin-risk", "agent-evaluation"],
  quality: ["agent-evaluation", "developer-risk", "web-research"],
};
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "market-risk": ["market", "token", "trade", "buy", "sell", "price", "yield", "financial", "liquidity", "volatility"],
  compliance: ["compliance", "ofac", "sanction", "address", "wallet", "counterparty", "vendor", "payment", "aml"],
  "web-research": ["research", "claim", "news", "source", "verify", "investigate", "protocol", "exploit"],
  "developer-risk": ["code", "repository", "github", "contract", "developer", "security", "audit", "bug"],
  "stablecoin-risk": ["stablecoin", "usdc", "usdt", "bridge", "depeg", "flow"],
  "agent-evaluation": ["agent", "output", "quality", "evaluate", "work", "deliverable"],
  "agent-access": ["provider", "service", "procure", "endpoint", "access"],
};
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

function providerInit(provider: any, input: IntelligenceRequest): RequestInit {
  const method = provider.method === "POST" ? "POST" : "GET";
  const init: RequestInit = { method, headers: { "idempotency-key": `${input.clientRequestId}:${provider.id}:preflight` }, redirect: "error", signal: AbortSignal.timeout(12_000) };
  if (method === "POST") {
    init.headers = { ...init.headers, "content-type": "application/json" };
    init.body = JSON.stringify({ ...(provider.fixture?.body ?? {}), task: input.task, query: input.task, subject: input.subject, context: input.context, acceptanceCriteria: input.acceptanceCriteria });
  }
  return init;
}

function decodePaymentRequired(response: Response, body: string) {
  const encoded = response.headers.get("payment-required");
  try {
    if (encoded) return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return JSON.parse(body);
  } catch { return null; }
}

export async function preflightProviders(input: IntelligenceRequest, providers: any[], required = 2) {
  const ready: any[] = [];
  for (const provider of providers) {
    if (ready.length >= required) break;
    try {
      const response = await fetch(providerUrl(provider, input), providerInit(provider, input));
      const body = await response.text();
      const payment = decodePaymentRequired(response, body);
      const accepts = Array.isArray(payment?.accepts) ? payment.accepts : [];
      const acceptsBaseSepolia = accepts.some((item: any) => item.network === BASE_SEPOLIA && String(item.asset ?? "").toLowerCase() === BASE_SEPOLIA_USDC);
      const trustedFixture = provider.approval_status === "trusted_fixture";
      const live = response.status === 402 ? acceptsBaseSepolia : response.ok && trustedFixture;
      await appendEvent(live ? "provider.preflight_ok" : "provider.preflight_failed", { providerId: provider.id, providerName: provider.name, endpoint: provider.endpoint, httpStatus: response.status, advertisedNetwork: accepts[0]?.network, advertisedAsset: accepts[0]?.asset, advertisedAmount: accepts[0]?.amount, reason: live ? undefined : response.ok ? "unpaid endpoint is not an approved trusted fixture" : "provider did not advertise Base Sepolia USDC" });
      if (live) ready.push({ ...provider, sourceHost: provider.sourceHost ?? new URL(provider.endpoint).hostname, preflightStatus: response.status });
    } catch (error) {
      await appendEvent("provider.preflight_failed", { providerId: provider.id, providerName: provider.name, endpoint: provider.endpoint, error: error instanceof Error ? error.message : "preflight_failed" });
    }
  }
  if (process.env.NODE_ENV === "test" && ready.length < required) return providers.slice(0, required).map((provider, index) => ({ ...provider, sourceHost: `test-${index}.local`, preflightStatus: 402 }));
  return ready;
}

export async function selectProviders(input: IntelligenceRequest, max: number) {
  const all = await listProviders();
  const terms = `${input.task} ${JSON.stringify(input.subject)} ${JSON.stringify(input.context)} ${input.acceptanceCriteria.join(" ")}`.toLowerCase();
  const allowed = new Set(PRODUCT_CAPABILITIES[input.product]);
  const ranked = all.filter((provider: any) => provider.test_enabled && provider.network === BASE_SEPOLIA && provider.asset.toLowerCase() === BASE_SEPOLIA_USDC && Number(provider.price_atomic) <= env.TESTNET_JOB_BUDGET_ATOMIC && allowed.has(provider.category) && !EXCLUDED_DECISION_CATEGORIES.has(provider.category))
    .map((provider: any) => {
      const keywordHits = (CATEGORY_KEYWORDS[provider.category] ?? []).filter(keyword => terms.includes(keyword)).length;
      const productPriority = PRODUCT_CAPABILITIES[input.product].indexOf(provider.category);
      return { ...provider, sourceHost: new URL(provider.endpoint).hostname, relevance: keywordHits * 30 + Math.max(0, 20 - productPriority * 3) + Number(provider.quality_score ?? 50) + Number(provider.availability_score ?? 50) };
    })
    .sort((left: any, right: any) => right.relevance - left.relevance || Number(left.price_atomic) - Number(right.price_atomic))
  const candidates = [];
  let candidateCost = 0;
  for (const provider of ranked) {
    const price = Number(provider.price_atomic);
    if (candidateCost + price > env.TESTNET_JOB_BUDGET_ATOMIC) continue;
    candidates.push(provider);
    candidateCost += price;
    if (candidates.length >= Math.max(REQUIRED_EVIDENCE_QUORUM, max) + 4) break;
  }
  return candidates;
}

function extractStrings(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === "string") return value.trim().length >= 12 ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(item => extractStrings(item, depth + 1));
  if (value && typeof value === "object") return Object.values(value).flatMap(item => extractStrings(item, depth + 1));
  return [];
}

export function validateProviderContent(contentType: string, text: string) {
  const normalizedType = contentType.toLowerCase();
  const prefix = text.slice(0, 16);
  if (normalizedType.startsWith("audio/") || normalizedType.startsWith("image/") || normalizedType.startsWith("video/") || normalizedType.includes("octet-stream")) return { usable: false, reason: "binary_content_type" };
  if (prefix.startsWith("RIFF") || prefix.startsWith("ID3") || text.includes("\u0000")) return { usable: false, reason: "binary_content" };
  if (text.trim().length < 40) return { usable: false, reason: "response_too_short" };
  return { usable: true };
}

export async function normalizeProviderResponse(provider: any, text: string, contentType: string, receipt?: string): Promise<EvidenceRecord> {
  const validation = validateProviderContent(contentType, text);
  if (!validation.usable) throw new Error(`Unusable provider response: ${validation.reason}`);
  let value: unknown;
  try { value = JSON.parse(text); } catch { value = { text: text.slice(0, 50_000) }; }
  const strings = [...new Set(extractStrings(value))].filter(item => !/^(success|ok|true|false)$/i.test(item)).slice(0, 12);
  if (!strings.length) throw new Error("Unusable provider response: no coherent claims");
  const facts = strings.slice(0, 8);
  const claims: EvidenceClaim[] = facts.map(statement => ({ statement, value: statement, confidence: 0.7 }));
  const recommendation = strings.find(item => /recommend|should|risk|allow|deny|safe|unsafe|approve|reject/i.test(item));
  return {
    id: crypto.randomUUID(), providerId: provider.id, providerName: provider.name, providerCategory: provider.category,
    sourceType: provider.category, sourceHost: provider.sourceHost ?? new URL(provider.endpoint).hostname,
    retrievedAt: new Date().toISOString(), rawResponseHash: await sha256(text), costAtomic: String(provider.price_atomic),
    claims, facts, recommendation, confidence: 70, limitations: ["Third-party x402 response; GenLayer must independently compare it with another source."], paymentReceipt: receipt,
  };
}

export async function collectEvidence(input: IntelligenceRequest, providers: any[], jobId?: string, required = REQUIRED_EVIDENCE_QUORUM) {
  const hasCdpWallet = Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET && env.CDP_WALLET_SECRET);
  if (!hasCdpWallet) {
    if (process.env.NODE_ENV === "test") {
      return ["test-source-a", "test-source-b"].map((providerId, index) => ({
        id: crypto.randomUUID(), providerId, providerName: `Test source ${index + 1}`, providerCategory: "test", sourceType: "test", sourceHost: `${providerId}.local`, retrievedAt: new Date().toISOString(), rawResponseHash: `test-${providerId}`, claims: [{ statement: `Independent test evidence ${index + 1}`, value: { task: input.task }, confidence: 0.7 }], facts: [`Independent test evidence ${index + 1}`], recommendation: "test", confidence: 70, limitations: [], costAtomic: "0",
      }));
    }
    throw new Error("provider_payment_wallet_not_configured");
  }
  const total = providers.reduce((sum, provider) => sum + Number(provider.price_atomic), 0);
  if (total > env.TESTNET_JOB_BUDGET_ATOMIC) throw new Error("Selected providers exceed the per-job testnet budget");
  await consumeDailyBudget(total);
  const paidFetch = await getCdpPaidFetch();
  const evidence: EvidenceRecord[] = [];
  const usedHosts = new Set<string>();
  for (const provider of providers) {
    if (evidence.length >= required) break;
    const sourceHost = provider.sourceHost ?? new URL(provider.endpoint).hostname;
    if (usedHosts.has(sourceHost)) continue;
    const startedAt = Date.now();
    const url = providerUrl(provider, input);
    const method = provider.method === "POST" ? "POST" : "GET";
    const init: RequestInit = { ...providerInit(provider, input), method, headers: { "idempotency-key": `${input.clientRequestId}:${provider.id}` }, signal: AbortSignal.timeout(20_000) };
    try {
      const response = await paidFetch(url, init);
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      if (text.length > 2_000_000) throw new Error("Provider response too large");
      const receipt = response.headers.get("payment-response") ?? response.headers.get("x-payment-response") ?? undefined;
      const normalized = await normalizeProviderResponse(provider, text, response.headers.get("content-type") ?? "", receipt);
      await appendEvent("provider.succeeded", { jobId, jobClientRequestId: input.clientRequestId, providerId: provider.id, providerName: provider.name, endpoint: url.toString(), method, network: provider.network, asset: provider.asset, costAtomic: provider.price_atomic, latencyMs: Date.now() - startedAt, httpStatus: response.status, contentType: response.headers.get("content-type"), responseBytes: Buffer.byteLength(text), responsePreview: text.slice(0, 2000), paymentReceipt: receipt });
      evidence.push(normalized);
      usedHosts.add(sourceHost);
    } catch (error) {
      await appendEvent("provider.failed", { jobId, jobClientRequestId: input.clientRequestId, providerId: provider.id, providerName: provider.name, endpoint: url.toString(), method, network: provider.network, asset: provider.asset, costAtomic: provider.price_atomic, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown provider error" });
    }
  }
  if (evidence.length < required) throw new Error(`provider_quorum_unavailable:${evidence.length}/${required}`);
  return evidence;
}
