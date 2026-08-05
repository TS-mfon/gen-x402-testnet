import { NextResponse } from "next/server";
import { apiKeyErrorResponse, verifyAuthorization } from "@/lib/api-keys";

export async function GET(request: Request) {
  try {
    const verified = await verifyAuthorization(request.headers.get("authorization"));
    return NextResponse.json({
      active: true,
      keyId: verified.payload.keyId,
      keyVersion: verified.payload.keyVersion,
      owner: verified.payload.owner,
      agent: verified.payload.agent,
      policyId: verified.payload.policyId,
      expiresAt: new Date(verified.payload.expiresAt * 1000).toISOString(),
      rateLimitPerMinute: verified.binding.rateLimitPerMinute,
      scopes: verified.payload.scopes,
      network: "eip155:84532",
      paymentRequiredPerDecision: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = apiKeyErrorResponse(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }
}
