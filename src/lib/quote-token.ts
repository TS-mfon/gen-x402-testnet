import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { IntelligenceQuote, ProductType, QuotedProvider } from "@/lib/domain";

type QuoteClaims = {
  version: 1;
  product: ProductType;
  requestHash: string;
  providers: QuotedProvider[];
  providerCostAtomic: string;
  operationalBudgetAtomic: string;
  genlayerReserveAtomic: string;
  revenueReserveAtomic: string;
  customerPriceAtomic: string;
  customerPriceUsdc: string;
  createdAt: string;
  expiresAt: string;
};

function secret() {
  const value = env.QUOTE_SIGNING_SECRET ?? env.RESULT_SIGNING_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error("quote_signing_secret_not_configured");
  return value;
}

function signature(payload: string) { return createHmac("sha256", secret()).update(payload).digest(); }

export function encodeQuoteToken(quote: Omit<IntelligenceQuote, "id">) {
  const claims: QuoteClaims = { version: 1, product: quote.product, requestHash: quote.requestHash, providers: quote.providers, providerCostAtomic: quote.providerCostAtomic, operationalBudgetAtomic: quote.operationalBudgetAtomic, genlayerReserveAtomic: quote.genlayerReserveAtomic, revenueReserveAtomic: quote.revenueReserveAtomic, customerPriceAtomic: quote.customerPriceAtomic, customerPriceUsdc: quote.customerPriceUsdc, createdAt: quote.createdAt, expiresAt: quote.expiresAt };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `q_${payload}.${signature(payload).toString("base64url")}`;
}

export function decodeQuoteToken(id: string): IntelligenceQuote | null {
  if (!id.startsWith("q_")) return null;
  const parts = id.slice(2).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const received = Buffer.from(parts[1], "base64url");
  const expected = signature(parts[0]);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as QuoteClaims;
    if (claims.version !== 1 || !Array.isArray(claims.providers) || !claims.product || !claims.requestHash || !claims.expiresAt) return null;
    return { id, ...claims, request: { product: claims.product, task: "Stateless signed quote", subject: {}, context: {}, acceptanceCriteria: [], riskLevel: "medium", clientRequestId: `quote-${claims.requestHash.slice(2, 18)}` }, routingExplanation: claims.providers.map(provider => `${provider.name} was selected and cryptographically frozen in this quote.`), status: new Date(claims.expiresAt) <= new Date() ? "expired" : "open" };
  } catch { return null; }
}
