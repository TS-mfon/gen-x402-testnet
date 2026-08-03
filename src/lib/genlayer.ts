import "server-only";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { Hex } from "viem";
import { env } from "@/lib/env";
import { sha256, stableJson } from "@/lib/hash";
import type { IntelligenceRequest, Verdict } from "@/lib/domain";

function configuredClient() {
  if (!env.GENLAYER_CONTRACT_ADDRESS || !env.GENLAYER_SIGNER_PRIVATE_KEY) return null;
  const key=(env.GENLAYER_SIGNER_PRIVATE_KEY.startsWith("0x")?env.GENLAYER_SIGNER_PRIVATE_KEY:`0x${env.GENLAYER_SIGNER_PRIVATE_KEY}`) as Hex;
  const account=createAccount(key);
  return { account, client:createClient({chain:studionet,account}) };
}
function verdictFromStored(stored:string, transaction?:string):Verdict|null {
  if (!stored) return null;
  const parsed=JSON.parse(stored) as {evidence_digest:string;result:{decision:Verdict["decision"];confidence:number;score:number;combined_analysis?:string;provider_assessments?:Verdict["providerAssessments"];agreements?:string[];conflicts?:string[];reason_codes?:string[]}};
  return {decision:parsed.result.decision,confidence:parsed.result.confidence,score:parsed.result.score,summary:parsed.result.combined_analysis || `GenLayer validators finalized ${parsed.result.decision.replaceAll("_"," ")}.`,combinedAnalysis:parsed.result.combined_analysis,providerAssessments:parsed.result.provider_assessments,agreements:parsed.result.agreements,conflicts:parsed.result.conflicts,reasonCodes:parsed.result.reason_codes?.length?parsed.result.reason_codes:["GENLAYER_FINALIZED"],evidenceDigest:parsed.evidence_digest,expiresAt:new Date(Date.now()+15*60_000).toISOString(),genlayerNetwork:"studionet",genlayerTransaction:transaction};
}
export async function readFinalized(input:IntelligenceRequest,transaction?:string){
  const configured=configuredClient(); if(!configured)return null;
  const stored=await configured.client.readContract({address:env.GENLAYER_CONTRACT_ADDRESS as `0x${string}`,functionName:"get_case",args:[input.clientRequestId],jsonSafeReturn:true}) as string;
  return verdictFromStored(stored,transaction);
}
export async function submitEvaluation(input:IntelligenceRequest,evidence:unknown[]){
  const digest=await sha256(stableJson({input,evidence})); const configured=configuredClient();
  if(!configured)return {transaction:undefined,evidenceDigest:digest};
  const transaction=await configured.client.writeContract({account:configured.account,address:env.GENLAYER_CONTRACT_ADDRESS as `0x${string}`,functionName:"submit_case",args:[input.clientRequestId,input.product,input.task,stableJson(evidence),digest,input.riskLevel],value:BigInt(0)}) as string;
  return {transaction,evidenceDigest:digest};
}
export async function finalizeEvaluation(input:IntelligenceRequest,transaction:string){
  const configured=configuredClient(); if(!configured)return null;
  const tx=await configured.client.getTransaction({hash:transaction as Hex & {length:66}});
  if(tx.statusName===TransactionStatus.READY_TO_FINALIZE){await configured.client.finalizeTransaction({account:configured.account,txId:transaction as Hex & {length:66}});return null;}
  if(tx.statusName===TransactionStatus.CANCELED)return { verdict: null, failed: true };
  if(tx.statusName!==TransactionStatus.FINALIZED)return null;
  const verdict=await readFinalized(input,transaction);
  return verdict ? { verdict, failed: false } : { verdict: null, failed: true };
}
