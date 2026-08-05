import "server-only";
import { env } from "@/lib/env";
import { getObjectJson, listObjectKeys, objectStoreConfigured, putObjectJson } from "@/lib/object-store";
import type { IntelligenceQuote, IntelligenceRequest, JobStatus, PricePlan, Verdict } from "@/lib/domain";
import { testnetCatalog } from "@/lib/testnet-catalog";
import { decodeQuoteToken } from "@/lib/quote-token";

export type Job = {
  id: string;
  product: string;
  status: JobStatus;
  request_json: IntelligenceRequest;
  plan_id: string;
  quote_id?: string;
  price_atomic: string;
  upstream_budget_atomic: string;
  upstream_spent_atomic: string;
  max_providers: number;
  attempts: number;
  error_code?: string;
  error_message?: string;
  payment_transaction?: string;
  payment_network?: string;
  payment_payer?: string;
  payment_amount_atomic?: string;
  payment_settled_at?: string;
  payment_proof_transaction?: string;
  refund_transaction?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

type Stored<T> = { value: T; etag?: string };
const memory = globalThis as typeof globalThis & {
  __x402Jobs?: Map<string, Job>;
  __x402Verdicts?: Map<string, Verdict>;
  __x402Idempotency?: Map<string, string>;
  __x402Quotes?: Map<string, IntelligenceQuote>;
};
memory.__x402Jobs ??= new Map();
memory.__x402Verdicts ??= new Map();
memory.__x402Idempotency ??= new Map();
memory.__x402Quotes ??= new Map();

const usesObjectStore = objectStoreConfigured();
const namespace = "testnet";
const jobPath = (id: string) => `${namespace}/jobs/${id}/snapshot.json`;
const verdictPath = (id: string) => `${namespace}/jobs/${id}/verdict.json`;
const executionPath = (id: string) => `${namespace}/jobs/${id}/execution.json`;
const evidencePath = (id: string) => `${namespace}/jobs/${id}/evidence.json`;
const idempotencyPath = (key: string) => `${namespace}/idempotency/${key}.json`;
const budgetPath = (date: string) => `${namespace}/budgets/${date}.json`;
const quotePath = (id: string) => `${namespace}/quotes/${id}.json`;
const apiKeyPath = (id: string) => `${namespace}/admin/api-keys/${id}.json`;

async function readJson<T>(pathname: string): Promise<Stored<T> | null> {
  return getObjectJson<T>(pathname);
}

async function writeJson(pathname: string, value: unknown, etag?: string) {
  return putObjectJson(pathname, value, { etag });
}

async function appendAudit(jobId: string, event: string, payload: unknown = {}) {
  await appendEvent(event, { jobId, ...payload as Record<string, unknown> });
}

export async function appendEvent(event: string, payload: Record<string, unknown> = {}) {
  if (!usesObjectStore) return;
  await putObjectJson(`${namespace}/events/${Date.now()}-${crypto.randomUUID()}.json`, { event, payload, at: new Date().toISOString() }, { createOnly: true });
}

export type ApiKeyIndexRecord = {
  keyId: string;
  owner: string;
  scopes: string[];
  rateLimitPerMinute: number;
  expiresAt: string;
  transaction?: string;
  createdAt: string;
};

export async function saveApiKeyIndex(record: ApiKeyIndexRecord) {
  if (!usesObjectStore) return record;
  await writeJson(apiKeyPath(record.keyId), record);
  await appendEvent("api_key.issued", {
    keyId: record.keyId,
    owner: record.owner,
    scopes: record.scopes,
    rateLimitPerMinute: record.rateLimitPerMinute,
    expiresAt: record.expiresAt,
    transaction: record.transaction,
  });
  return record;
}

export async function listEvents(limit = 500) {
  if (!usesObjectStore) return [];
  const keys = await listObjectKeys(`${namespace}/events/`, limit);
  const events = await Promise.all(keys.map(async (key) => {
    const value = await readJson<{ event: string; payload: Record<string, unknown>; at: string }>(key);
    return value?.value ?? null;
  }));
  return events.filter((event): event is { event: string; payload: Record<string, unknown>; at: string } => Boolean(event)).sort((a, b) => b.at.localeCompare(a.at));
}

export async function consumeDailyBudget(amountAtomic: number) {
  if (!usesObjectStore) return { spentAtomic: amountAtomic, limitAtomic: env.TESTNET_DAILY_BUDGET_ATOMIC };
  const date = new Date().toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readJson<{ spentAtomic: number }>(budgetPath(date));
    const spentAtomic = current?.value.spentAtomic ?? 0;
    if (spentAtomic + amountAtomic > env.TESTNET_DAILY_BUDGET_ATOMIC) throw new Error("Daily testnet provider budget exhausted");
    try {
      await writeJson(budgetPath(date), { spentAtomic: spentAtomic + amountAtomic, updatedAt: new Date().toISOString() }, current?.etag);
      await appendEvent("budget.consumed", { date, amountAtomic, spentAtomic: spentAtomic + amountAtomic, limitAtomic: env.TESTNET_DAILY_BUDGET_ATOMIC });
      return { spentAtomic: spentAtomic + amountAtomic, limitAtomic: env.TESTNET_DAILY_BUDGET_ATOMIC };
    } catch {
      if (attempt === 2) throw new Error("Daily budget update failed after retries");
    }
  }
  throw new Error("Daily budget update failed");
}

export async function saveQuote(quote: IntelligenceQuote) {
  if (!usesObjectStore) { memory.__x402Quotes!.set(quote.id, quote); return quote; }
  await putObjectJson(quotePath(quote.id), quote, { createOnly: true });
  await appendEvent("quote.created", { quoteId: quote.id, product: quote.product, requestHash: quote.requestHash, providerIds: quote.providers.map(provider => provider.id), providerCostAtomic: quote.providerCostAtomic, customerPriceAtomic: quote.customerPriceAtomic, expiresAt: quote.expiresAt });
  return quote;
}

export async function getQuote(id: string) {
  const stateless = decodeQuoteToken(id);
  if (stateless) return stateless;
  if (!usesObjectStore) return memory.__x402Quotes!.get(id) ?? null;
  return (await readJson<IntelligenceQuote>(quotePath(id)))?.value ?? null;
}

export async function settleQuote(id: string, jobId: string) {
  const stateless = decodeQuoteToken(id);
  if (stateless) return { ...stateless, status: "settled" as const, settledJobId: jobId };
  if (!usesObjectStore) {
    const quote = memory.__x402Quotes!.get(id);
    if (!quote) throw new Error("quote_not_found");
    if (quote.status === "settled") return quote;
    const settled = { ...quote, status: "settled" as const, settledJobId: jobId };
    memory.__x402Quotes!.set(id, settled);
    return settled;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await readJson<IntelligenceQuote>(quotePath(id));
    if (!stored) throw new Error("quote_not_found");
    if (stored.value.status === "settled") return stored.value;
    if (new Date(stored.value.expiresAt) <= new Date()) throw new Error("quote_expired");
    const settled = { ...stored.value, status: "settled" as const, settledJobId: jobId };
    try {
      await writeJson(quotePath(id), settled, stored.etag);
      await appendEvent("quote.settled", { quoteId: id, jobId, customerPriceAtomic: settled.customerPriceAtomic });
      return settled;
    } catch {
      if (attempt === 2) throw new Error("quote_settlement_conflict");
    }
  }
  throw new Error("quote_settlement_conflict");
}

export async function createJob(input: IntelligenceRequest, plan: PricePlan, key: string, quote?: IntelligenceQuote) {
  if (!usesObjectStore) {
    const existingId = memory.__x402Idempotency!.get(key);
    if (existingId) return memory.__x402Jobs!.get(existingId)!;
    const now = new Date();
    const job: Job = {
      id: crypto.randomUUID(), product: input.product, status: "payment_pending", request_json: input,
      plan_id: plan.id, price_atomic: quote?.customerPriceAtomic ?? plan.amountAtomic, upstream_budget_atomic: quote?.operationalBudgetAtomic ?? plan.upstreamBudgetAtomic,
      quote_id: quote?.id,
      upstream_spent_atomic: "0", max_providers: plan.maxProviders, attempts: 0,
      created_at: now.toISOString(), updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + plan.timeoutMinutes * 60_000).toISOString()
    };
    memory.__x402Jobs!.set(job.id, job);
    memory.__x402Idempotency!.set(key, job.id);
    return job;
  }

  const idempotent = await readJson<{ jobId: string }>(idempotencyPath(key));
  if (idempotent) {
    const existing = await getJob(idempotent.value.jobId);
    if (existing) return existing;
  }
  const now = new Date();
  const job: Job = {
    id: crypto.randomUUID(), product: input.product, status: "payment_pending", request_json: input,
    plan_id: plan.id, price_atomic: quote?.customerPriceAtomic ?? plan.amountAtomic, upstream_budget_atomic: quote?.operationalBudgetAtomic ?? plan.upstreamBudgetAtomic,
    quote_id: quote?.id,
    upstream_spent_atomic: "0", max_providers: plan.maxProviders, attempts: 0,
    created_at: now.toISOString(), updated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + plan.timeoutMinutes * 60_000).toISOString()
  };
  await writeJson(jobPath(job.id), job);
  try {
    await putObjectJson(idempotencyPath(key), { jobId: job.id }, { createOnly: true });
  } catch {
    const winner = await readJson<{ jobId: string }>(idempotencyPath(key));
    if (winner) return (await getJob(winner.value.jobId)) ?? job;
  }
  await appendAudit(job.id, "job.created", { plan: plan.id, product: input.product });
  return job;
}

export async function getJob(id: string) {
  if (!usesObjectStore) return memory.__x402Jobs!.get(id) ?? null;
  return (await readJson<Job>(jobPath(id)))?.value ?? null;
}

export async function updateJob(id: string, status: JobStatus, extra: { errorCode?: string; errorMessage?: string } = {}) {
  if (!usesObjectStore) {
    const job = memory.__x402Jobs!.get(id);
    if (!job) return null;
    Object.assign(job, { status, error_code: extra.errorCode, error_message: extra.errorMessage, attempts: job.attempts + 1, updated_at: new Date().toISOString() });
    return job;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await readJson<Job>(jobPath(id));
    if (!stored) return null;
    const next = { ...stored.value, status, error_code: extra.errorCode, error_message: extra.errorMessage, attempts: stored.value.attempts + 1, updated_at: new Date().toISOString() };
    try {
      await writeJson(jobPath(id), next, stored.etag);
      await appendAudit(id, `job.${status}`, extra);
      return next;
    } catch {
      if (attempt === 2) throw new Error("Concurrent job update failed after retries");
    }
  }
  return null;
}

export async function savePaymentSettlement(id: string, settlement: { transaction: string; network: string; payer: string; amountAtomic: string }) {
  const paymentFields = {
    payment_transaction: settlement.transaction,
    payment_network: settlement.network,
    payment_payer: settlement.payer,
    payment_amount_atomic: settlement.amountAtomic,
    payment_settled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!usesObjectStore) {
    const job = memory.__x402Jobs!.get(id);
    if (!job) return null;
    Object.assign(job, paymentFields);
    return job;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await readJson<Job>(jobPath(id));
    if (!stored) return null;
    try {
      await writeJson(jobPath(id), { ...stored.value, ...paymentFields }, stored.etag);
      await appendAudit(id, "payment.receipt_saved", settlement);
      return { ...stored.value, ...paymentFields };
    } catch {
      if (attempt === 2) throw new Error("Payment settlement update failed after retries");
    }
  }
  return null;
}

export async function markPaymentProved(id: string, proofTransaction?: string) {
  const job = await getJob(id);
  if (!job) return null;
  if (job.status !== "payment_pending" && job.status !== "payment_settled") return job;
  if (!usesObjectStore) {
    job.status = "payment_settled";
    job.payment_proof_transaction = proofTransaction;
    job.updated_at = new Date().toISOString();
    return job;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await readJson<Job>(jobPath(id));
    if (!stored) return null;
    const next = { ...stored.value, status: "payment_settled" as const, payment_proof_transaction: proofTransaction, updated_at: new Date().toISOString() };
    try {
      await writeJson(jobPath(id), next, stored.etag);
      await appendAudit(id, "payment.proved", { proofTransaction });
      return next;
    } catch {
      if (attempt === 2) throw new Error("Payment proof update failed after retries");
    }
  }
  return null;
}

export async function markRefunded(id: string, refundTransaction: string) {
  const job = await getJob(id);
  if (!job) return null;
  if (!usesObjectStore) {
    job.status = "refunded";
    job.refund_transaction = refundTransaction;
    job.updated_at = new Date().toISOString();
    return job;
  }
  const stored = await readJson<Job>(jobPath(id));
  if (!stored) return null;
  const next = { ...stored.value, status: "refunded" as const, refund_transaction: refundTransaction, updated_at: new Date().toISOString() };
  await writeJson(jobPath(id), next, stored.etag);
  await appendAudit(id, "job.refunded", { refundTransaction });
  return next;
}

export async function pendingJobs(limit = 10) {
  if (!usesObjectStore) return [...memory.__x402Jobs!.values()].filter((job) => !["response_ready", "failed", "refunded"].includes(job.status)).slice(0, limit);
  const keys = await listObjectKeys(`${namespace}/jobs/`, Math.max(limit * 10, 100));
  const snapshots = keys.filter((key) => key.endsWith("/snapshot.json")).slice(0, limit * 3);
  const jobs = (await Promise.all(snapshots.map((key) => readJson<Job>(key)))).flatMap((entry) => entry ? [entry.value] : []);
  return jobs.filter((job) => !["response_ready", "failed", "refunded"].includes(job.status)).sort((left, right) => left.updated_at.localeCompare(right.updated_at)).slice(0, limit);
}

export async function saveVerdict(jobId: string, verdict: Verdict) {
  if (!usesObjectStore) { memory.__x402Verdicts!.set(jobId, verdict); return; }
  await writeJson(verdictPath(jobId), verdict);
  await appendAudit(jobId, "verdict.saved", { decision: verdict.decision, confidence: verdict.confidence });
}

export async function getVerdict(jobId: string) {
  if (!usesObjectStore) return memory.__x402Verdicts!.get(jobId) ?? null;
  return (await readJson<Verdict>(verdictPath(jobId)))?.value ?? null;
}

export type JobExecution = { transaction: string; evidenceDigest: string; submittedAt: string; submissionAttempt: number };
export async function saveExecution(jobId: string, execution: JobExecution) {
  if (!usesObjectStore) return;
  await writeJson(executionPath(jobId), execution);
  await appendAudit(jobId, "genlayer.submitted", execution);
}
export async function getExecution(jobId: string) {
  if (!usesObjectStore) return null;
  return (await readJson<JobExecution>(executionPath(jobId)))?.value ?? null;
}
export async function saveEvidence(jobId: string, evidence: unknown[]) {
  if (!usesObjectStore) return;
  await writeJson(evidencePath(jobId), evidence);
}
export async function getEvidence(jobId: string) {
  if (!usesObjectStore) return null;
  return (await readJson<unknown[]>(evidencePath(jobId)))?.value ?? null;
}

export async function listProviders() {
  if (!env.X402_PROVIDERS_JSON) return [...testnetCatalog];
  try { return JSON.parse(env.X402_PROVIDERS_JSON) as unknown[]; }
  catch { throw new Error("X402_PROVIDERS_JSON must be valid JSON"); }
}
