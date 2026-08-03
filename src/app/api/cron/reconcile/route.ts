import { NextResponse } from "next/server";
import { authorized } from "@/lib/cron";
export async function GET(request:Request){if(!authorized(request))return NextResponse.json({error:"unauthorized"},{status:401});return NextResponse.json({ok:true,note:"x402 settlement reconciliation is receipt-driven; no database reconciliation required."});}
