import { NextResponse } from "next/server";
import { createProofOfWorkChallenge } from "@/lib/api-keys";
export async function GET(){try{const challenge=await createProofOfWorkChallenge();return NextResponse.json({challenge,difficulty:4,expiresAt:new Date(Date.now()+5*60_000).toISOString(),instructions:"Find a nonce where sha256(challenge + ':' + nonce) starts with four zero hex characters."});}catch(error){return NextResponse.json({error:"enrollment_not_configured",message:error instanceof Error?error.message:"Unknown error"},{status:503});}}
