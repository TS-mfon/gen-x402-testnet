import { NextResponse } from "next/server";
import { authorized } from "@/lib/cron";
import { appendEvent, listProviders } from "@/lib/store";

export const maxDuration = 60;
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const providers = await listProviders();
  const results = [];
  for (const provider of providers.slice(0, 20) as any[]) {
    const startedAt = Date.now();
    try {
      const response = await fetch(provider.endpoint.replace(":symbol", "BTC"), { method: provider.method === "POST" ? "POST" : "GET", headers: provider.method === "POST" ? { "content-type": "application/json" } : undefined, body: provider.method === "POST" ? JSON.stringify(provider.fixture?.body ?? {}) : undefined, redirect: "manual", signal: AbortSignal.timeout(10_000) });
      const encoded = response.headers.get("payment-required");
      let challenge: any = null;
      if (encoded) { try { challenge = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { challenge = null; } }
      const accepted = challenge?.accepts?.find((item: any) => item.network === "eip155:84532");
      const ok = response.status === 402 && accepted?.asset?.toLowerCase() === "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
      const payload = { providerId: provider.id, status: response.status, latencyMs: Date.now() - startedAt, ok, advertisedAmount: accepted?.amount, advertisedPayTo: accepted?.payTo };
      await appendEvent(ok ? "provider.health_ok" : "provider.health_failed", payload);
      results.push(payload);
    } catch (error) {
      const payload = { providerId: provider.id, latencyMs: Date.now() - startedAt, ok: false, error: error instanceof Error ? error.message : "Unknown error" };
      await appendEvent("provider.health_failed", payload);
      results.push(payload);
    }
  }
  return NextResponse.json({ checked: results.length, healthy: results.filter(result => result.ok).length, results });
}
