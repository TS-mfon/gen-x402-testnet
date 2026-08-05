import { after, NextRequest, NextResponse } from "next/server";
import { requestSchema, resolvePlan, type ProductType } from "@/lib/domain";
import { sha256, stableJson } from "@/lib/hash";
import { createJob, getJob, getQuote } from "@/lib/store";
import { apiKeyErrorResponse, authenticateApiRequest } from "@/lib/api-keys";

export function productHandler(product: ProductType) {
  return async (request: NextRequest) => {
    if (request.headers.has("authorization") || request.headers.get("x-client-type") === "agent") {
      try { await authenticateApiRequest(request, "jobs:create"); }
      catch (error) { const failure = apiKeyErrorResponse(error); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
    }
    let json: unknown;
    try { json = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    const parsed = requestSchema.safeParse({ ...(json as object), product });
    if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 422 });
    const quoteId = new URL(request.url).searchParams.get("quoteId") ?? request.headers.get("x-quote-id");
    if (!quoteId) return NextResponse.json({ error: "quote_required", message: "Simulate the request and provide quoteId before paying." }, { status: 428 });
    const quote = await getQuote(quoteId);
    if (!quote || quote.product !== product) return NextResponse.json({ error: "quote_not_found" }, { status: 404 });
    if (quote.status === "settled" && quote.settledJobId) {
      const existing = await getJob(quote.settledJobId);
      if (existing) return NextResponse.json({ jobId: existing.id, status: existing.status, product, plan: existing.plan_id, paid: true, pollUrl: `/api/v1/jobs/${existing.id}`, duplicate: true }, { status: 202 });
    }
    if (new Date(quote.expiresAt) <= new Date()) return NextResponse.json({ error: "quote_expired", message: "This quote has expired. Run simulation again." }, { status: 409 });
    const requestHash = await sha256(stableJson(parsed.data));
    if (requestHash !== quote.requestHash) return NextResponse.json({ error: "quote_request_mismatch", message: "The paid request does not match the simulated request." }, { status: 409 });
    const plan = resolvePlan(parsed.data);
    const idempotencyKey = await sha256(stableJson({ product, clientRequestId: parsed.data.clientRequestId }));
    const job = await createJob(parsed.data, plan, idempotencyKey, quote);
    return NextResponse.json({ jobId: job.id, status: job.status, product, plan: plan.id, paid: true, settlement: "pending_receipt", pollUrl: `/api/v1/jobs/${job.id}`, beta: "GenLayer Studionet-anchored paid beta" }, { status: 202 });
  };
}
