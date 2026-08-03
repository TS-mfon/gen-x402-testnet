import "server-only";
import { get, list, put } from "@vercel/blob";
import { env } from "@/lib/env";
import type { IntelligenceRequest, JobStatus, PricePlan, Verdict } from "@/lib/domain";
import { testnetCatalog } from "@/lib/testnet-catalog";

export type Job = {
  id: string;
  product: string;
  status: JobStatus;
  request_json: IntelligenceRequest;
  plan_id: string;
  price_atomic: string;
  upstream_budget_atomic: string;
  upstream_spent_atomic: string;
  max_providers: number;
  attempts: number;
  error_code?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

type Stored<T> = { value: T; etag?: string };
const memory = globalThis as typeof globalThis & {
  __x402Jobs?: Map<string, Job>;
  __x402Verdicts?: Map<string, Verdict>;
  __x402Idempotency?: Map<string, string>;
};
memory.__x402Jobs ??= new Map();
memory.__x402Verdicts ??= new Map();
memory.__x402Idempotency ??= new Map();

const usesBlob = Boolean(env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const namespace = "testnet";
const jobPath = (id: string) => `${namespace}/jobs/${id}/snapshot.json`;
const verdictPath = (id: string) => `${namespace}/jobs/${id}/verdict.json`;
const executionPath = (id: string) => `${namespace}/jobs/${id}/execution.json`;
const evidencePath = (id: string) => `${namespace}/jobs/${id}/evidence.json`;
const idempotencyPath = (key: string) => `${namespace}/idempotency/${key}.json`;
const budgetPath = (date: string) => `${namespace}/budgets/${date}.json`;

async function readJson<T>(pathname: string): Promise<Stored<T> | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result?.stream) return null;
  const text = await new Response(result.stream).text();
  return { value: JSON.parse(text) as T, etag: result.blob.etag };
}

async function writeJson(pathname: string, value: unknown, etag?: string) {
  return put(pathname, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    ...(etag ? { ifMatch: etag } : {})
  });
}

async function appendAudit(jobId: string, event: string, payload: unknown = {}) {
  await appendEvent(event, { jobId, ...payload as Record<string, unknown> });
}

export async function appendEvent(event: string, payload: Record<string, unknown> = {}) {
  if (!usesBlob) return;
  await put(`${namespace}/events/${Date.now()}-${crypto.randomUUID()}.json`, JSON.stringify({ event, payload, at: new Date().toISOString() }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
    cacheControlMaxAge: 0
  });
}

export async function listEvents(limit = 500) {
  if (!usesBlob) return [];
  const result = await list({ prefix: `${namespace}/events/`, limit });
  const events = await Promise.all(result.blobs.map(async (blob) => {
    const value = await readJson<{ event: string; payload: Record<string, unknown>; at: string }>(blob.pathname);
    return value?.value ?? null;
  }));
  return events.filter((event): event is { event: string; payload: Record<string, unknown>; at: string } => Boolean(event)).sort((a, b) => b.at.localeCompare(a.at));
}

export async function consumeDailyBudget(amountAtomic: number) {
  if (!usesBlob) return { spentAtomic: amountAtomic, limitAtomic: env.TESTNET_DAILY_BUDGET_ATOMIC };
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

export async function createJob(input: IntelligenceRequest, plan: PricePlan, key: string) {
  if (!usesBlob) {
    const existingId = memory.__x402Idempotency!.get(key);
    if (existingId) return memory.__x402Jobs!.get(existingId)!;
    const now = new Date();
    const job: Job = {
      id: crypto.randomUUID(), product: input.product, status: "payment_settled", request_json: input,
      plan_id: plan.id, price_atomic: plan.amountAtomic, upstream_budget_atomic: plan.upstreamBudgetAtomic,
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
    id: crypto.randomUUID(), product: input.product, status: "payment_settled", request_json: input,
    plan_id: plan.id, price_atomic: plan.amountAtomic, upstream_budget_atomic: plan.upstreamBudgetAtomic,
    upstream_spent_atomic: "0", max_providers: plan.maxProviders, attempts: 0,
    created_at: now.toISOString(), updated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + plan.timeoutMinutes * 60_000).toISOString()
  };
  await writeJson(jobPath(job.id), job);
  try {
    await put(idempotencyPath(key), JSON.stringify({ jobId: job.id }), {
      access: "private", addRandomSuffix: false, allowOverwrite: false,
      contentType: "application/json", cacheControlMaxAge: 0
    });
  } catch {
    const winner = await readJson<{ jobId: string }>(idempotencyPath(key));
    if (winner) return (await getJob(winner.value.jobId)) ?? job;
  }
  await appendAudit(job.id, "job.created", { plan: plan.id, product: input.product });
  return job;
}

export async function getJob(id: string) {
  if (!usesBlob) return memory.__x402Jobs!.get(id) ?? null;
  return (await readJson<Job>(jobPath(id)))?.value ?? null;
}

export async function updateJob(id: string, status: JobStatus, extra: { errorCode?: string; errorMessage?: string } = {}) {
  if (!usesBlob) {
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

export async function pendingJobs(limit = 10) {
  if (!usesBlob) return [...memory.__x402Jobs!.values()].filter((job) => !["response_ready", "failed", "refunded"].includes(job.status)).slice(0, limit);
  const result = await list({ prefix: `${namespace}/jobs/`, limit: Math.max(limit * 10, 100) });
  const snapshots = result.blobs.filter((blob) => blob.pathname.endsWith("/snapshot.json")).slice(0, limit * 3);
  const jobs = (await Promise.all(snapshots.map((blob) => readJson<Job>(blob.pathname)))).flatMap((entry) => entry ? [entry.value] : []);
  return jobs.filter((job) => !["response_ready", "failed", "refunded"].includes(job.status)).sort((left, right) => left.updated_at.localeCompare(right.updated_at)).slice(0, limit);
}

export async function saveVerdict(jobId: string, verdict: Verdict) {
  if (!usesBlob) { memory.__x402Verdicts!.set(jobId, verdict); return; }
  await writeJson(verdictPath(jobId), verdict);
  await appendAudit(jobId, "verdict.saved", { decision: verdict.decision, confidence: verdict.confidence });
}

export async function getVerdict(jobId: string) {
  if (!usesBlob) return memory.__x402Verdicts!.get(jobId) ?? null;
  return (await readJson<Verdict>(verdictPath(jobId)))?.value ?? null;
}

export type JobExecution = { transaction: string; evidenceDigest: string; submittedAt: string; submissionAttempt: number };
export async function saveExecution(jobId: string, execution: JobExecution) {
  if (!usesBlob) return;
  await writeJson(executionPath(jobId), execution);
  await appendAudit(jobId, "genlayer.submitted", execution);
}
export async function getExecution(jobId: string) {
  if (!usesBlob) return null;
  return (await readJson<JobExecution>(executionPath(jobId)))?.value ?? null;
}
export async function saveEvidence(jobId: string, evidence: unknown[]) {
  if (!usesBlob) return;
  await writeJson(evidencePath(jobId), evidence);
}
export async function getEvidence(jobId: string) {
  if (!usesBlob) return null;
  return (await readJson<unknown[]>(evidencePath(jobId)))?.value ?? null;
}

export async function listProviders() {
  if (!env.X402_PROVIDERS_JSON) return [...testnetCatalog];
  try { return JSON.parse(env.X402_PROVIDERS_JSON) as unknown[]; }
  catch { throw new Error("X402_PROVIDERS_JSON must be valid JSON"); }
}
