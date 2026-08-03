import "server-only";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { Hex } from "viem";
import { env } from "@/lib/env";
import { sha256, stableJson } from "@/lib/hash";
import type { IntelligenceRequest, Verdict } from "@/lib/domain";

export async function evaluate(input:IntelligenceRequest,evidence:unknown[]):Promise<Verdict>{
  const digest=await sha256(stableJson({input,evidence}));
  if(env.GENLAYER_CONTRACT_ADDRESS&&env.GENLAYER_SIGNER_PRIVATE_KEY){
    const key=(env.GENLAYER_SIGNER_PRIVATE_KEY.startsWith("0x")?env.GENLAYER_SIGNER_PRIVATE_KEY:`0x${env.GENLAYER_SIGNER_PRIVATE_KEY}`) as Hex;const account=createAccount(key);const client=createClient({chain:studionet,account});
    const tx=await client.writeContract({account,address:env.GENLAYER_CONTRACT_ADDRESS as `0x${string}`,functionName:"submit_case",args:[input.clientRequestId,input.product,input.task,stableJson(evidence),digest,input.riskLevel],value:BigInt(0)}) as string;
    await client.waitForTransactionReceipt({hash:tx as Hex & {length:66},status:TransactionStatus.FINALIZED,interval:3000,retries:15});
    const stored=await client.readContract({address:env.GENLAYER_CONTRACT_ADDRESS as `0x${string}`,functionName:"get_case",args:[input.clientRequestId],jsonSafeReturn:true}) as string;
    const parsed=JSON.parse(stored) as {result:{decision:Verdict["decision"];confidence:number;score:number}};
    return {decision:parsed.result.decision,confidence:parsed.result.confidence,score:parsed.result.score,summary:`GenLayer validators finalized ${parsed.result.decision.replaceAll("_"," ")}.`,reasonCodes:["GENLAYER_FINALIZED"],evidenceDigest:digest,expiresAt:new Date(Date.now()+15*60_000).toISOString(),genlayerNetwork:"studionet",genlayerTransaction:tx};
  }
  return {decision:"insufficient_evidence",confidence:0,score:0,summary:"GenLayer reporter is not configured.",reasonCodes:["GENLAYER_NOT_CONFIGURED"],evidenceDigest:digest,expiresAt:new Date(Date.now()+5*60_000).toISOString(),genlayerNetwork:"studionet"};
}
