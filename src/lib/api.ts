import { after, NextRequest, NextResponse } from "next/server";
import { requestSchema, resolvePlan, type ProductType } from "@/lib/domain";
import { sha256, stableJson } from "@/lib/hash";
import { appendEvent, createJob } from "@/lib/store";
import { runJobToCompletion } from "@/lib/processor";

export function productHandler(product: ProductType) {
  return async (request: NextRequest) => {
    let json: unknown;
    try { json = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    const parsed = requestSchema.safeParse({ ...(json as object), product });
    if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 422 });
    const plan = resolvePlan(parsed.data);
    const idempotencyKey = await sha256(stableJson({ product, clientRequestId: parsed.data.clientRequestId }));
    const job = await createJob(parsed.data, plan, idempotencyKey);
    await appendEvent("payment.settled", { jobId: job.id, product, plan: plan.id, priceAtomic: plan.amountAtomic, clientRequestId: parsed.data.clientRequestId });
    after(() => runJobToCompletion(job.id));
    return NextResponse.json({ jobId: job.id, status: job.status, product, plan: plan.id, paid: true, pollUrl: `/api/v1/jobs/${job.id}`, beta: "GenLayer Studionet-anchored paid beta" }, { status: 202 });
  };
}
