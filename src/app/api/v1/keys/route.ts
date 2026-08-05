import { NextResponse } from "next/server";
import { z } from "zod";
import { API_KEY_SCOPES } from "@/lib/api-key-token";
import { apiKeyErrorResponse, issueApiKey, verifyProofOfWork } from "@/lib/api-keys";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const schema = z.object({
  mode: z.enum(["wallet", "agent"]).default("wallet"),
  owner: address,
  agent: address.optional(),
  policyId: z.string().min(1).max(128).optional(),
  delegatedAccount: address.nullable().optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
  rateLimitPerMinute: z.number().int().min(1).max(120).optional(),
  challenge: z.string().optional(),
  nonce: z.string().optional(),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };

export async function POST(request: Request) {
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 422 });
  if (parsed.data.mode === "agent" && (!parsed.data.challenge || !parsed.data.nonce || !await verifyProofOfWork(parsed.data.challenge, parsed.data.nonce))) {
    return NextResponse.json({ error: "invalid_proof_of_work" }, { status: 403 });
  }
  try {
    const result = await issueApiKey(parsed.data);
    return NextResponse.json(result, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    const failure = apiKeyErrorResponse(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: noStoreHeaders });
  }
}
