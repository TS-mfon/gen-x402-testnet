import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import { privateKeyToAccount } from "viem/accounts";

const envBuild = await readFile(path.join(os.homedir(), ".env.build"), "utf8");
const deployerRaw = envBuild.split(/\r?\n/).find((line) => line.trim().toLowerCase().startsWith("private key:"))?.split(":").slice(1).join(":").trim();
if (!deployerRaw) throw new Error("No 'private key:' entry found in ~/.env.build");
const deployerKey = (deployerRaw.startsWith("0x") ? deployerRaw : `0x${deployerRaw}`);
if (!/^0x[0-9a-fA-F]{64}$/.test(deployerKey)) throw new Error("Invalid deployment private key in ~/.env.build");

const walletFile = await readFile(new URL("../pk.md", import.meta.url), "utf8");
const reporter = walletFile.match(/Address:\s*(0x[0-9a-fA-F]{40})/)?.[1];
if (!reporter) throw new Error("Platform reporter address missing from pk.md");

const code = await readFile(new URL("../contracts/genlayer/IntelligenceGateway.py", import.meta.url), "utf8");
const account = privateKeyToAccount(deployerKey);
const endpoint = "https://studio.genlayer.com/api";
const client = createClient({ endpoint, account });

console.log(`Deploying IntelligenceGateway from ${account.address}`);
console.log(`Authorizing platform reporter ${reporter}`);
const hash = await client.deployContract({ account, code, args: [reporter] });
console.log(`Deployment transaction: ${hash}`);
const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 3000, retries: 120 });
const raw = receipt;
const leader = raw.consensus_data?.leader_receipt?.find((entry) => entry?.mode === "leader") ?? raw.consensus_data?.leader_receipt?.[0];
if (leader && leader.execution_result !== "SUCCESS") throw new Error(`Deployment execution failed: ${leader.execution_result}`);
const address = raw.txDataDecoded?.contractAddress ?? raw.txDataDecoded?.contract_address ?? raw.tx_data_decoded?.contractAddress ?? raw.tx_data_decoded?.contract_address ?? raw.data?.contractAddress ?? raw.data?.contract_address;
if (!address) throw new Error(`Finalized deployment did not return a contract address: ${JSON.stringify(receipt).slice(0, 1000)}`);
const deployment = { network: "studionet", endpoint, contract: address, transactionHash: hash, deployer: account.address, platformReporter: reporter, deployedAt: new Date().toISOString() };
await writeFile(new URL("../deployment.genlayer.json", import.meta.url), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`IntelligenceGateway: ${address}`);
