import { z } from "zod";

export const productTypes = ["gateway", "investigation", "procurement", "decision", "quality"] as const;
export type ProductType = (typeof productTypes)[number];

export const jobStatuses = [
  "created", "payment_pending", "payment_settled", "planning", "providers_selected",
  "evidence_requested", "evidence_collected", "evidence_normalized", "genlayer_submitted",
  "genlayer_pending", "verdict_finalized", "response_ready", "refund_pending", "refunded",
  "credited", "failed"
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const verdictValues = [
  "allow", "deny", "escalate", "supported", "unsupported", "pass", "fail",
  "low_risk", "medium_risk", "high_risk", "insufficient_evidence"
] as const;
export type VerdictValue = (typeof verdictValues)[number];

export const requestSchema = z.object({
  product: z.enum(productTypes),
  task: z.string().trim().min(10).max(4000),
  subject: z.object({
    chainId: z.string().max(64).optional(),
    address: z.string().max(128).optional(),
    url: z.string().url().max(2048).optional(),
    repository: z.string().max(2048).optional()
  }).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
  acceptanceCriteria: z.array(z.string().min(3).max(500)).max(20).default([]),
  riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
  requestedPlan: z.enum(["quick", "standard", "deep", "quality"]).optional(),
  clientRequestId: z.string().min(8).max(128),
  callbackUrl: z.string().url().max(2048).optional()
});
export type IntelligenceRequest = z.infer<typeof requestSchema>;

export const quoteRequestSchema = requestSchema.omit({ clientRequestId: true }).extend({
  clientRequestId: z.string().min(8).max(128).optional(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export type QuotedProvider = {
  id: string;
  name: string;
  category: string;
  sourceHost: string;
  priceAtomic: string;
  relevance: number;
  health: "live";
  preflightStatus: number;
};

export type IntelligenceQuote = {
  id: string;
  product: ProductType;
  request: IntelligenceRequest;
  requestHash: string;
  providers: QuotedProvider[];
  providerCostAtomic: string;
  operationalBudgetAtomic: string;
  genlayerReserveAtomic: string;
  revenueReserveAtomic: string;
  customerPriceAtomic: string;
  customerPriceUsdc: string;
  routingExplanation: string[];
  status: "open" | "settled" | "expired" | "canceled";
  createdAt: string;
  expiresAt: string;
  settledJobId?: string;
};

export type PricePlan = {
  id: "quick" | "standard" | "deep" | "procurement" | "quality";
  name: string;
  amountAtomic: string;
  amountUsdc: string;
  upstreamBudgetAtomic: string;
  maxProviders: number;
  maxRetries: number;
  timeoutMinutes: number;
};

export function calculateQuotePrice(providerCostAtomic: number) {
  const minimumAtomic = 1_000_000;
  const customerPriceAtomic = Math.max(minimumAtomic, Math.ceil(providerCostAtomic / 0.6));
  const operationalBudgetAtomic = Math.floor(customerPriceAtomic * 0.6);
  const genlayerReserveAtomic = Math.ceil(customerPriceAtomic * 0.1);
  const revenueReserveAtomic = customerPriceAtomic - operationalBudgetAtomic - genlayerReserveAtomic;
  if (providerCostAtomic > operationalBudgetAtomic) throw new Error("Provider cost exceeds the 60% operational ceiling");
  return { customerPriceAtomic, operationalBudgetAtomic, genlayerReserveAtomic, revenueReserveAtomic };
}

export function atomicToUsdc(atomic: number) {
  return (atomic / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export const pricePlans: Record<PricePlan["id"], PricePlan> = {
  quick: { id: "quick", name: "Quick Decision", amountAtomic: "10000", amountUsdc: "0.01", upstreamBudgetAtomic: "500000", maxProviders: 2, maxRetries: 1, timeoutMinutes: 3 },
  standard: { id: "standard", name: "Standard Investigation", amountAtomic: "30000", amountUsdc: "0.03", upstreamBudgetAtomic: "500000", maxProviders: 2, maxRetries: 2, timeoutMinutes: 8 },
  deep: { id: "deep", name: "Deep Investigation", amountAtomic: "50000", amountUsdc: "0.05", upstreamBudgetAtomic: "500000", maxProviders: 2, maxRetries: 3, timeoutMinutes: 15 },
  procurement: { id: "procurement", name: "Procurement Run", amountAtomic: "50000", amountUsdc: "0.05", upstreamBudgetAtomic: "500000", maxProviders: 2, maxRetries: 3, timeoutMinutes: 12 },
  quality: { id: "quality", name: "Quality Review", amountAtomic: "20000", amountUsdc: "0.02", upstreamBudgetAtomic: "500000", maxProviders: 2, maxRetries: 2, timeoutMinutes: 6 }
};

export function resolvePlan(input: IntelligenceRequest): PricePlan {
  if (input.requestedPlan) {
    if (input.requestedPlan === "quality") return pricePlans.quality;
    const requestedPlan: "quick" | "standard" | "deep" = input.requestedPlan;
    return pricePlans[requestedPlan];
  }
  if (input.product === "procurement") return pricePlans.procurement;
  if (input.product === "quality") return pricePlans.quality;
  if (input.product === "decision") return pricePlans.quick;
  return pricePlans.standard;
}

export type EvidenceClaim = { statement: string; value: unknown; confidence?: number };
export type EvidenceRecord = {
  id: string;
  providerId: string;
  providerName: string;
  providerCategory: string;
  sourceType: string;
  sourceHost: string;
  retrievedAt: string;
  rawResponseHash: string;
  blobUrl?: string;
  claims: EvidenceClaim[];
  facts: string[];
  recommendation?: string;
  confidence: number;
  limitations: string[];
  costAtomic: string;
  paymentReceipt?: string;
};

export type ProviderAssessment = {
  providerId: string;
  quality: number;
  useful: boolean;
  contribution: string;
};

export type Verdict = {
  decision: VerdictValue;
  confidence: number;
  score: number;
  summary: string;
  reasonCodes: string[];
  combinedAnalysis?: string;
  providerAssessments?: ProviderAssessment[];
  agreements?: string[];
  conflicts?: string[];
  evidenceDigest: string;
  expiresAt: string;
  genlayerNetwork: "studionet";
  genlayerTransaction?: string;
};
