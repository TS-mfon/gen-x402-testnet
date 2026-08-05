import { NextResponse } from "next/server";
import { apiKeyErrorResponse, rotateApiKey } from "@/lib/api-keys";
import { parseBearerAuthorization } from "@/lib/api-key-token";

export async function POST(request: Request) {
  try {
    const result = await rotateApiKey(parseBearerAuthorization(request.headers.get("authorization")));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
  } catch (error) {
    const failure = apiKeyErrorResponse(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }
}
