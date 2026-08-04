import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";

export async function GET(request: Request) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) return NextResponse.json({ error: "api_key_required" }, { status: 401 });

  try {
    const key = await verifyApiKey(apiKey);
    if (!key) return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
    return NextResponse.json({
      active: true,
      keyId: key.keyId,
      expiresAt: new Date(key.expiresAt * 1000).toISOString(),
      rateLimitPerMinute: key.rateLimit,
      scopesBitmap: key.scopes.toString(),
      network: "eip155:84532",
      paymentRequiredPerDecision: true,
    });
  } catch (error) {
    return NextResponse.json({
      error: "api_key_verification_failed",
      message: error instanceof Error ? error.message : "Unable to read the on-chain key registry",
    }, { status: 503 });
  }
}
