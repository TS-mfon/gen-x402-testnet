import { NextResponse } from "next/server";
import { apiKeyErrorResponse, revokeApiKey } from "@/lib/api-keys";
import { parseBearerAuthorization } from "@/lib/api-key-token";

export async function POST(request: Request) {
  try {
    const result = await revokeApiKey(parseBearerAuthorization(request.headers.get("authorization")));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = apiKeyErrorResponse(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }
}
