import { NextResponse } from "next/server";
import { quoteRequestSchema, requestSchema } from "@/lib/domain";
import { createQuote } from "@/lib/quotes";
import { apiKeyErrorResponse, authenticateApiRequestIfPresent } from "@/lib/api-keys";
import { objectStoreConfigured } from "@/lib/object-store";

export const maxDuration = 60;

export async function POST(request: Request) {
  try { await authenticateApiRequestIfPresent(request, "quotes:create"); }
  catch (error) { const failure = apiKeyErrorResponse(error); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const quoted = quoteRequestSchema.safeParse(json);
  if (!quoted.success) return NextResponse.json({ error: "invalid_request", issues: quoted.error.flatten() }, { status: 422 });
  const input = requestSchema.parse({ ...quoted.data, clientRequestId: quoted.data.clientRequestId ?? crypto.randomUUID() });
  try {
    const quote = await createQuote(input);
    const executionAvailable = objectStoreConfigured();
    return NextResponse.json({ quote, executionAvailable, executionStatus: executionAvailable ? "ready" : "durable_storage_not_configured", warning: executionAvailable ? undefined : "Payment is disabled until durable R2 storage is configured; this quote is informational only.", payment: { network: "eip155:84532", token: "USDC", amountAtomic: quote.customerPriceAtomic, amountUsdc: quote.customerPriceUsdc }, allocation: { providerMaximumAtomic: quote.operationalBudgetAtomic, genlayerReserveAtomic: quote.genlayerReserveAtomic, protocolReserveAtomic: quote.revenueReserveAtomic } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote simulation failed";
    return NextResponse.json({ error: message.startsWith("provider_quorum") ? "provider_quorum_unavailable" : "quote_failed", message }, { status: 503 });
  }
}
