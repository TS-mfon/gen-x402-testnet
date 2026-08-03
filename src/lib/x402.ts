import "server-only";
import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { x402ResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { withX402 } from "@x402/next";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { PricePlan } from "@/lib/domain";
import { appendEvent, getJob, getQuote, markPaymentProved, savePaymentSettlement, settleQuote } from "@/lib/store";
import { recordPaymentProof } from "@/lib/control";

export const BASE_SEPOLIA = "eip155:84532" as const;
export const SUPPORTED_X402_NETWORKS = [BASE_SEPOLIA] as const;

function hasFacilitatorCredentials() {
  return Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET);
}

function createResourceServer() {
  const facilitator = createCdpFacilitatorClient({
    apiKeyId: env.CDP_API_KEY_ID,
    apiKeySecret: env.CDP_API_KEY_SECRET,
    baseUrl: env.X402_FACILITATOR_URL,
  });
  const server = new x402ResourceServer(facilitator);
  registerExactEvmScheme(server, { networks: [...SUPPORTED_X402_NETWORKS] });
  server.onAfterSettle(async (context: any) => {
    try {
      const responseBody = context.transportContext?.responseBody;
      let response: { jobId?: string } = {};
      try { response = responseBody ? JSON.parse(Buffer.from(responseBody).toString("utf8")) : {}; } catch { return; }
      if (!response.jobId || !context.result?.success) return;
      const job = await getJob(response.jobId);
      if (!job || !job.quote_id) return;
      const quote = await getQuote(job.quote_id);
      if (!quote) return;
      const result = context.result;
      const requirements = context.requirements;
      const payer = String(result.payer ?? context.paymentPayload?.payload?.authorization?.from ?? "");
      const amountAtomic = String(result.amount ?? requirements.amount ?? requirements.maxAmountRequired ?? quote.customerPriceAtomic);
      const settlement = { transaction: String(result.transaction), network: String(result.network ?? BASE_SEPOLIA), payer, amountAtomic };
      await savePaymentSettlement(job.id, settlement);
      await settleQuote(quote.id, job.id);
      let proofTransaction: string | undefined;
      if (/^0x[a-fA-F0-9]{40}$/.test(payer)) {
        try {
          proofTransaction = await recordPaymentProof({ jobId: job.id, quoteId: quote.id, requestHash: quote.requestHash as `0x${string}`, payer: payer as `0x${string}`, customerAmount: BigInt(amountAtomic) });
        } catch (error) {
          await appendEvent("control.payment_proof_failed", { jobId: job.id, quoteId: quote.id, error: error instanceof Error ? error.message : "payment proof failed" });
        }
      }
      await appendEvent("payment.settled", { jobId: job.id, quoteId: quote.id, payer, amountAtomic, transaction: result.transaction, network: result.network, controlProofTransaction: proofTransaction });
      if (!proofTransaction) {
        await appendEvent("payment.proof_pending", { jobId: job.id, quoteId: quote.id, settlementTransaction: result.transaction, reason: "control_contract_proof_not_confirmed" });
        return;
      }
      await markPaymentProved(job.id, proofTransaction);
    } catch (error) {
      console.error("x402_after_settle_recording_failed", error);
    }
  });
  return server;
}

export function paidRoute(handler: (r: NextRequest) => Promise<NextResponse<unknown>>, plan: PricePlan, description: string) {
  if (env.DEMO_MODE === "true") return handler;
  if (!hasFacilitatorCredentials()) {
    return async () => NextResponse.json({
      error: "payment_facilitator_not_configured",
      message: "x402 payments require CDP_API_KEY_ID and CDP_API_KEY_SECRET in the Vercel environment.",
    }, { status: 503 });
  }
  const resourceServer = createResourceServer();
  return withX402(handler, {
    accepts: SUPPORTED_X402_NETWORKS.map((network) => ({
      scheme: "exact",
      price: async (context: any) => {
        const quoteId = context.adapter.getQueryParam?.("quoteId");
        const quote = typeof quoteId === "string" ? await getQuote(quoteId) : null;
        if (!quote || quote.status !== "open" || new Date(quote.expiresAt) <= new Date()) return "$1.00";
        return `$${quote.customerPriceUsdc}`;
      },
      network,
      payTo: env.X402_TREASURY_ADDRESS as `0x${string}`,
    })),
    description,
    mimeType: "application/json",
  }, resourceServer);
}
