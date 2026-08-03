import { appendEvent, pendingJobs, updateJob, saveVerdict, getVerdict } from "@/lib/store";
import { selectProviders, collectEvidence } from "@/lib/providers";
import { evaluate } from "@/lib/genlayer";

export async function processJob(id:string){const jobs=await pendingJobs(50);const job=jobs.find(j=>j.id===id);if(!job)return null;if(new Date(job.expires_at)<new Date())return updateJob(id,"failed",{errorCode:"job_expired",errorMessage:"The processing deadline elapsed."});
  if(job.status==="payment_settled")return updateJob(id,"planning");
  if(job.status==="planning")return updateJob(id,"providers_selected");
  if(job.status==="providers_selected")return updateJob(id,"evidence_requested");
  if(job.status==="evidence_requested")return updateJob(id,"evidence_collected");
  if(job.status==="evidence_collected")return updateJob(id,"evidence_normalized");
  if(job.status==="evidence_normalized")return updateJob(id,"genlayer_submitted");
  if(job.status==="genlayer_submitted"||job.status==="genlayer_pending"){const providers=await selectProviders(job.request_json,job.max_providers);await appendEvent("providers.selected",{jobId:id,providerIds:providers.map((provider:any)=>provider.id)});const evidence=await collectEvidence(job.request_json,providers);await appendEvent("evidence.collected",{jobId:id,providerCount:evidence.length,costAtomic:evidence.reduce((sum:any,item:any)=>sum+Number(item.costAtomic||0),0)});const verdict=await evaluate(job.request_json,evidence);await appendEvent("genlayer.finalized",{jobId:id,decision:verdict.decision,confidence:verdict.confidence,transaction:verdict.genlayerTransaction});await saveVerdict(id,verdict);return updateJob(id,"verdict_finalized");}
  if(job.status==="verdict_finalized"&&await getVerdict(id))return updateJob(id,"response_ready");return job;}
export async function processBatch(limit=10){const jobs=await pendingJobs(limit);const results=[];for(const job of jobs){try{results.push(await processJob(job.id));}catch(error){results.push(await updateJob(job.id,"failed",{errorCode:"processing_failed",errorMessage:error instanceof Error?error.message:"Unknown processing error"}));}}return results;}
export async function runJobToCompletion(id:string){let job=await processJob(id);for(let step=0;step<10&&job&&!['response_ready','failed','refunded'].includes(job.status);step+=1){job=await processJob(id);}return job;}
