import { NextResponse } from "next/server";
import { listProviders } from "@/lib/store";
import { apiKeyErrorResponse, authenticateApiRequestIfPresent } from "@/lib/api-keys";
export async function GET(request: Request){try{await authenticateApiRequestIfPresent(request,"providers:read");}catch(error){const failure=apiKeyErrorResponse(error);return NextResponse.json({error:failure.error},{status:failure.status});}return NextResponse.json({providers:await listProviders(),policy:"Curated providers plus validated Bazaar discovery"});}
