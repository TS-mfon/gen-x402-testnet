import "server-only";
import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { x402ResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { withX402 } from "@x402/next";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { PricePlan } from "@/lib/domain";

export const BASE_SEPOLIA = "eip155:84532" as const;
export const SUPPORTED_X402_NETWORKS = [BASE_SEPOLIA] as const;

function hasFacilitatorCredentials() {
  return Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET);
}

function createResourceServer() {
  const facilitator = createCdpFacilitatorClient({
    apiKeyId: env.CDP_API_KEY_ID,
    apiKeySecret: env.CDP_API_KEY_SECRET,
    baseUrl: env.X402_FACILITATOR_URL,
  });
  const server = new x402ResourceServer(facilitator);
  registerExactEvmScheme(server, { networks: [...SUPPORTED_X402_NETWORKS] });
  return server;
}

export function paidRoute(handler: (r: NextRequest) => Promise<NextResponse<unknown>>, plan: PricePlan, description: string) {
  if (env.DEMO_MODE === "true") return handler;
  if (!hasFacilitatorCredentials()) {
    return async () => NextResponse.json({
      error: "payment_facilitator_not_configured",
      message: "x402 payments require CDP_API_KEY_ID and CDP_API_KEY_SECRET in the Vercel environment.",
    }, { status: 503 });
  }
  const resourceServer = createResourceServer();
  return withX402(handler, {
    accepts: SUPPORTED_X402_NETWORKS.map((network) => ({
      scheme: "exact",
      price: `$${plan.amountUsdc}`,
      network,
      payTo: env.X402_TREASURY_ADDRESS as `0x${string}`,
    })),
    description,
    mimeType: "application/json",
  }, resourceServer);
}
