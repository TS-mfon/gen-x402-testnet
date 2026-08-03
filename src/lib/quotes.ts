import "server-only";
import { atomicToUsdc, calculateQuotePrice, type IntelligenceQuote, type IntelligenceRequest } from "@/lib/domain";
import { sha256, stableJson } from "@/lib/hash";
import { preflightProviders, selectProviders } from "@/lib/providers";
import { saveQuote } from "@/lib/store";

export async function createQuote(input: IntelligenceRequest): Promise<IntelligenceQuote> {
  const candidates = await selectProviders(input, 6);
  const providers = await preflightProviders(input, candidates, 2);
  if (providers.length < 2) throw new Error("provider_quorum_unavailable");
  const providerCostAtomic = providers.reduce((sum, provider) => sum + Number(provider.price_atomic), 0);
  const pricing = calculateQuotePrice(providerCostAtomic);
  const createdAt = new Date();
  const requestHash = await sha256(stableJson(input));
  const quote: IntelligenceQuote = {
    id: crypto.randomUUID(), product: input.product, request: input, requestHash,
    providers: providers.map(provider => ({ id: provider.id, name: provider.name, category: provider.category, sourceHost: provider.sourceHost, priceAtomic: String(provider.price_atomic), relevance: provider.relevance, health: "live", preflightStatus: provider.preflightStatus })),
    providerCostAtomic: String(providerCostAtomic), operationalBudgetAtomic: String(pricing.operationalBudgetAtomic),
    genlayerReserveAtomic: String(pricing.genlayerReserveAtomic), revenueReserveAtomic: String(pricing.revenueReserveAtomic),
    customerPriceAtomic: String(pricing.customerPriceAtomic), customerPriceUsdc: atomicToUsdc(pricing.customerPriceAtomic),
    routingExplanation: providers.map(provider => `${provider.name} matched ${provider.category}, passed live preflight, and ranked ${provider.relevance}.`),
    status: "open", createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + 15 * 60_000).toISOString(),
  };
  return saveQuote(quote);
}
