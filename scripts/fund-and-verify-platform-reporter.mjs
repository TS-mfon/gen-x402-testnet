import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClient } from 'genlayer-js';
import { TransactionStatus } from 'genlayer-js/types';
import { privateKeyToAccount } from 'viem/accounts';

const envBuild=await readFile(path.join(os.homedir(),'.env.build'),'utf8');
const deployerRaw=envBuild.split(/\r?\n/).find(line=>line.trim().toLowerCase().startsWith('private key:'))?.split(':').slice(1).join(':').trim();
const reporterRaw=(await readFile(new URL('../pk.md',import.meta.url),'utf8')).match(/Private key:\s*(0x[0-9a-fA-F]{64})/)?.[1];
if(!deployerRaw||!reporterRaw)throw new Error('Required keys are missing');
const deployer=privateKeyToAccount(deployerRaw.startsWith('0x')?deployerRaw:`0x${deployerRaw}`);
const reporter=privateKeyToAccount(reporterRaw);
const endpoint='https://studio.genlayer.com/api';
const deployerClient=createClient({endpoint,account:deployer});
const reporterClient=createClient({endpoint,account:reporter});
let reporterBalance=await reporterClient.getBalance({address:reporter.address});
console.log(`Reporter balance before: ${reporterBalance}`);
if(reporterBalance===0n){
  const deployerBalance=await deployerClient.getBalance({address:deployer.address});
  console.log(`Deployer balance before: ${deployerBalance}`);
  const amount=1000000000000000000n;
  if(deployerBalance<=amount)throw new Error('Deployer has insufficient Studionet balance');
  const fundingHash=await deployerClient.sendTransaction({account:deployer,to:reporter.address,value:amount});
  console.log(`Funding transaction: ${fundingHash}`);
  await deployerClient.waitForTransactionReceipt({hash:fundingHash,status:TransactionStatus.FINALIZED,interval:3000,retries:120});
  reporterBalance=await reporterClient.getBalance({address:reporter.address});
  console.log(`Reporter balance after: ${reporterBalance}`);
}
const address='0x3dB29d17DC0c54f57bcfe744d240b75E4003Bf7C';
const caseId=`platform-verification-${Date.now()}`;
const hash=await reporterClient.writeContract({account:reporter,address,functionName:'submit_case',args:[caseId,'decision','Should a test agent proceed with a harmless verification request?','[]','0x'+'11'.repeat(32),'low'],value:0n});
console.log(`Reporter transaction: ${hash}`);
const receipt=await reporterClient.waitForTransactionReceipt({hash,status:TransactionStatus.FINALIZED,interval:3000,retries:120});
console.log(`Final status: ${receipt.statusName??receipt.status}`);
const stored=await reporterClient.readContract({address,functionName:'get_case',args:[caseId],jsonSafeReturn:true});
console.log(`Stored case: ${String(stored).slice(0,500)}`);
