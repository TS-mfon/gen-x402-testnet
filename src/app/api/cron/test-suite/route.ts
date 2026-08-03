import { NextResponse } from "next/server";
import { authorized } from "@/lib/cron";
import { requestSchema } from "@/lib/domain";
import { collectEvidence, selectProviders } from "@/lib/providers";
import { evaluate } from "@/lib/genlayer";
import { appendEvent } from "@/lib/store";

export const maxDuration = 60;
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const suiteId = `scheduled-${new Date().toISOString().slice(0, 10)}`;
  const input = requestSchema.parse({ product: "investigation", task: "Assess the operational health of the Base Sepolia x402 provider ecosystem and return a bounded test verdict.", context: { source: "scheduled-test-suite", network: "eip155:84532" }, riskLevel: "low", clientRequestId: suiteId });
  await appendEvent("suite.started", { suiteId });
  try {
    const providers = await selectProviders(input, 2);
    const evidence = await collectEvidence(input, providers);
    const verdict = await evaluate(input, evidence);
    await appendEvent("suite.completed", { suiteId, providerIds: providers.map((provider: any) => provider.id), evidenceCount: evidence.length, decision: verdict.decision, confidence: verdict.confidence, transaction: verdict.genlayerTransaction });
    return NextResponse.json({ ok: true, suiteId, providers: providers.map((provider: any) => provider.id), verdict });
  } catch (error) {
    await appendEvent("suite.failed", { suiteId, error: error instanceof Error ? error.message : "Unknown suite error" });
    return NextResponse.json({ ok: false, suiteId, error: error instanceof Error ? error.message : "Unknown suite error" }, { status: 500 });
  }
}
