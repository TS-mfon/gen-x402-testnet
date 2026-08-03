import { NextResponse } from "next/server";
import { processBatch } from "@/lib/processor";
import { authorized } from "@/lib/cron";
export const maxDuration=60;
export async function GET(request:Request){if(!authorized(request))return NextResponse.json({error:"unauthorized"},{status:401});const jobs=await processBatch(10);return NextResponse.json({processed:jobs.length,jobs:jobs.map(job=>job&&({id:job.id,status:job.status}))});}
