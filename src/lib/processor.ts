import { appendEvent, pendingJobs, updateJob, saveVerdict, getVerdict, getExecution, saveExecution, getEvidence, saveEvidence, getQuote, markRefunded } from "@/lib/store";
import { collectEvidence } from "@/lib/providers";
import { finalizeEvaluation, readFinalized, submitEvaluation } from "@/lib/genlayer";
import { sha256, stableJson } from "@/lib/hash";
import type { EvidenceRecord } from "@/lib/domain";
import { recordPaymentProof, refundJobProof, updateJobProof } from "@/lib/control";

const TERMINAL = ["response_ready", "failed", "refunded"];

function compactEvidence(evidence: unknown[]) {
  return evidence.map((item) => {
    const record = item as EvidenceRecord;
    return {
      provider_id: record.providerId,
      answer: record.recommendation ?? record.claims[0]?.statement ?? "No recommendation supplied",
      claims: record.claims.slice(0, 4).map(claim => ({ statement: String(claim.statement).slice(0, 500), confidence: Math.round(Number(claim.confidence ?? record.confidence / 100) * 100) / 100 })),
      recommendation: record.recommendation?.slice(0, 500),
      confidence: record.confidence,
      limitations: record.limitations.slice(0, 3).map(limit => limit.slice(0, 300)),
    };
  });
}

async function failJob(id: string, code: string, message: string) {
  await appendEvent("job.failed", { jobId: id, errorCode: code, errorMessage: message, refundRequired: true });
  const failed = await updateJob(id, "failed", { errorCode: code, errorMessage: message });
  if (failed?.payment_proof_transaction) {
    try {
      const refundTransaction = await refundJobProof(id);
      if (refundTransaction) return markRefunded(id, refundTransaction);
    } catch (error) {
      await appendEvent("refund.failed", { jobId: id, error: error instanceof Error ? error.message : "refund failed" });
    }
  }
  return failed;
}

export async function processJob(id: string) {
  const jobs = await pendingJobs(100);
  const job = jobs.find(candidate => candidate.id === id);
  if (!job) return null;
  if (job.status === "payment_pending" && job.quote_id && job.payment_transaction && job.payment_payer && job.payment_amount_atomic) {
    const quote = await getQuote(job.quote_id);
    if (!quote) return failJob(id, "quote_missing", "The settled payment has no recoverable quote. Manual reconciliation is required.");
    try {
      const proofTransaction = await recordPaymentProof({ jobId: id, quoteId: quote.id, requestHash: quote.requestHash as `0x${string}`, payer: job.payment_payer as `0x${string}`, customerAmount: BigInt(job.payment_amount_atomic) });
      if (!proofTransaction) return job;
      const { markPaymentProved } = await import("@/lib/store");
      return markPaymentProved(id, proofTransaction);
    } catch (error) {
      await appendEvent("payment.reconciliation_failed", { jobId: id, settlementTransaction: job.payment_transaction, error: error instanceof Error ? error.message : "payment proof reconciliation failed" });
      return job;
    }
  }
  if (new Date(job.expires_at) < new Date() && !["genlayer_submitted", "genlayer_pending", "verdict_finalized"].includes(job.status)) return failJob(id, "job_expired", "The processing deadline elapsed. A full refund is required.");

  if (job.status === "payment_settled") return updateJob(id, "planning");
  if (job.status === "planning") return updateJob(id, "providers_selected");
  if (job.status === "providers_selected") return updateJob(id, "evidence_requested");
  if (job.status === "evidence_requested") return updateJob(id, "evidence_collected");
  if (job.status === "evidence_collected") return updateJob(id, "evidence_normalized");
  if (job.status === "evidence_normalized") return updateJob(id, "genlayer_submitted");

  if (job.status === "genlayer_submitted" || job.status === "genlayer_pending") {
    const execution = await getExecution(id);
    const recovered = await readFinalized(job.request_json, execution?.transaction);
    if (recovered) {
      await appendEvent("genlayer.finalized", { jobId: id, decision: recovered.decision, confidence: recovered.confidence, transaction: recovered.genlayerTransaction });
      await saveVerdict(id, recovered);
      try { await updateJobProof({ jobId: id, evidenceHash: execution?.evidenceDigest as `0x${string}`, verdictHash: await sha256(stableJson(recovered)) as `0x${string}` }); } catch (error) { await appendEvent("control.proof_failed", { jobId: id, error: error instanceof Error ? error.message : "proof update failed" }); }
      return updateJob(id, "verdict_finalized");
    }

    if (execution) {
      const finalized = await finalizeEvaluation(job.request_json, execution.transaction);
      if (!finalized) return updateJob(id, "genlayer_pending");
      if (finalized.verdict) {
        await appendEvent("genlayer.finalized", { jobId: id, decision: finalized.verdict.decision, confidence: finalized.verdict.confidence, transaction: finalized.verdict.genlayerTransaction });
        await saveVerdict(id, finalized.verdict);
        try { await updateJobProof({ jobId: id, evidenceHash: execution.evidenceDigest as `0x${string}`, verdictHash: await sha256(stableJson(finalized.verdict)) as `0x${string}` }); } catch (error) { await appendEvent("control.proof_failed", { jobId: id, error: error instanceof Error ? error.message : "proof update failed" }); }
        return updateJob(id, "verdict_finalized");
      }
      if (execution.submissionAttempt >= 2) return failJob(id, "genlayer_consensus_failed", "GenLayer did not finalize after one automatic retry. A full refund is required.");
      await appendEvent("genlayer.retry", { jobId: id, previousTransaction: execution.transaction, submissionAttempt: execution.submissionAttempt + 1 });
    }

    let evidence = await getEvidence(id);
    if (!evidence) {
      if (!job.quote_id) return failJob(id, "quote_missing", "The paid job has no bound quote. A full refund is required.");
      const quote = await getQuote(job.quote_id);
      if (!quote) return failJob(id, "quote_missing", "The bound quote is unavailable. A full refund is required.");
      const registry = (await import("@/lib/store")).listProviders;
      const providers = await registry();
      const selected = quote.providers.map(quoted => (providers as any[]).find(provider => provider.id === quoted.id)).filter(Boolean);
      if (selected.length !== 2) return failJob(id, "provider_quorum_unavailable", "The quoted providers are no longer registered. A full refund is required.");
      await appendEvent("providers.selected", { jobId: id, quoteId: quote.id, providerIds: selected.map((provider: any) => provider.id), requiredEvidence: 2, selectionMode: "quote-bound" });
      try {
        evidence = await collectEvidence(job.request_json, selected, id, 2);
      } catch (error) {
        return failJob(id, "provider_quorum_unavailable", `${error instanceof Error ? error.message : "Provider collection failed"}. A full refund is required.`);
      }
      await saveEvidence(id, evidence);
      await appendEvent("evidence.collected", { jobId: id, providerCount: evidence.length, providerIds: evidence.map((item: any) => item.providerId), costAtomic: evidence.reduce((sum: number, item: any) => sum + Number(item.costAtomic || 0), 0) });
    }

    if (evidence.length < 2 || new Set(evidence.map((item: any) => item.providerId)).size < 2) return failJob(id, "provider_quorum_unavailable", "Two independent usable provider outputs were not collected. A full refund is required.");
    const compact = compactEvidence(evidence);
    const compactJson = stableJson(compact);
    if (Buffer.byteLength(compactJson) > 9_000) return failJob(id, "genlayer_payload_too_large", "The compact GenLayer payload exceeded its safety limit. A full refund is required.");
    const submissionAttempt = (execution?.submissionAttempt ?? 0) + 1;
    await appendEvent("genlayer.payload_prepared", { jobId: id, evidenceContentHash: await sha256(compactJson), evidenceBytes: Buffer.byteLength(compactJson), evidenceRecords: compact.length, contract: process.env.GENLAYER_CONTRACT_ADDRESS, method: "submit_case", argumentIndex: 3, providerIds: compact.map(item => item.provider_id), compact: true });
    const submitted = await submitEvaluation(job.request_json, compact);
    if (!submitted.transaction) return failJob(id, "genlayer_not_configured", "GenLayer reporter is not configured. A full refund is required.");
    await saveExecution(id, { transaction: submitted.transaction, evidenceDigest: submitted.evidenceDigest, submittedAt: new Date().toISOString(), submissionAttempt });
    return updateJob(id, "genlayer_pending");
  }

  if (job.status === "verdict_finalized" && await getVerdict(id)) return updateJob(id, "response_ready");
  return job;
}

export async function processBatch(limit = 10) {
  const jobs = await pendingJobs(limit);
  const results = [];
  for (const job of jobs) {
    try { results.push(await processJob(job.id)); }
    catch (error) { results.push(await failJob(job.id, "processing_failed", error instanceof Error ? error.message : "Unknown processing error")); }
  }
  return results;
}

export async function runJobToCompletion(id: string) {
  let job = await processJob(id);
  for (let step = 0; step < 12 && job && !TERMINAL.includes(job.status); step += 1) job = await processJob(id);
  return job;
}
