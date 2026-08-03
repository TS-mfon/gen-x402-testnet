import { NextResponse } from "next/server";
import { authorized } from "@/lib/cron";
import { pendingJobs } from "@/lib/store";
import { processJob } from "@/lib/processor";
export const maxDuration=60;
export async function GET(request:Request){if(!authorized(request))return NextResponse.json({error:"unauthorized"},{status:401});const pending=await pendingJobs(50);const candidates=pending.filter(job=>job.status==="payment_pending"&&job.payment_transaction);const reconciled=[];for(const job of candidates.slice(0,10)){reconciled.push(await processJob(job.id));}return NextResponse.json({ok:true,checked:candidates.length,reconciled:reconciled.map(job=>job&&({id:job.id,status:job.status,paymentProofTransaction:job.payment_proof_transaction}))});}
