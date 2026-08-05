import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "@/lib/env";

const events = {
  payment: parseAbiItem("event PaymentRecorded(bytes32 indexed jobId, bytes32 indexed quoteId, address indexed payer, uint256 customerAmount, uint256 genlayerReserve)"),
  spend: parseAbiItem("event ProviderBudgetReleased(bytes32 indexed jobId, address indexed operationsWallet, uint256 amount, uint256 totalProviderSpent)"),
  proof: parseAbiItem("event JobProofUpdated(bytes32 indexed jobId, bytes32 evidenceHash, bytes32 verdictHash)"),
  refund: parseAbiItem("event JobRefunded(bytes32 indexed jobId, address indexed payer, uint256 amount)"),
};

export async function GET() {
  try {
    const client = createPublicClient({ chain: baseSepolia, transport: http(env.BASE_SEPOLIA_RPC_URL) });
    const latest = await client.getBlockNumber();
    const fromBlock = latest > 1900n ? latest - 1900n : 0n;
    const address = env.CONTROL_CONTRACT_ADDRESS as `0x${string}`;
    const [payments, spends, proofs, refunds] = await Promise.all([
      client.getLogs({ address, event: events.payment, fromBlock, toBlock: latest }),
      client.getLogs({ address, event: events.spend, fromBlock, toBlock: latest }),
      client.getLogs({ address, event: events.proof, fromBlock, toBlock: latest }),
      client.getLogs({ address, event: events.refund, fromBlock, toBlock: latest }),
    ]);
    const blocks = new Map<bigint, string>();
    for (const blockNumber of new Set([...payments, ...spends, ...proofs, ...refunds].map(log => log.blockNumber).filter((value): value is bigint => typeof value === "bigint"))) {
      const block = await client.getBlock({ blockNumber }); blocks.set(blockNumber, new Date(Number(block.timestamp) * 1000).toISOString());
    }
    const at = (blockNumber: bigint | null) => blockNumber ? blocks.get(blockNumber) ?? new Date().toISOString() : new Date().toISOString();
    const normalized = [
      ...payments.map(log => ({ event: "payment.settled", at: at(log.blockNumber), payload: { jobId: log.args.jobId, quoteId: log.args.quoteId, payer: log.args.payer, amountAtomic: log.args.customerAmount?.toString(), genlayerReserveAtomic: log.args.genlayerReserve?.toString(), transaction: log.transactionHash, network: "eip155:84532" } })),
      ...spends.map(log => ({ event: "provider.budget_released", at: at(log.blockNumber), payload: { jobId: log.args.jobId, operationsWallet: log.args.operationsWallet, amountAtomic: log.args.amount?.toString(), totalProviderSpentAtomic: log.args.totalProviderSpent?.toString(), transaction: log.transactionHash } })),
      ...proofs.map(log => ({ event: "genlayer.finalized", at: at(log.blockNumber), payload: { jobId: log.args.jobId, evidenceHash: log.args.evidenceHash, verdictHash: log.args.verdictHash, controlTransaction: log.transactionHash } })),
      ...refunds.map(log => ({ event: "job.refunded", at: at(log.blockNumber), payload: { jobId: log.args.jobId, payer: log.args.payer, amountAtomic: log.args.amount?.toString(), transaction: log.transactionHash } })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return NextResponse.json({ events: normalized, jobs: [], generatedAt: new Date().toISOString(), source: "base-sepolia-control-contract", fromBlock: fromBlock.toString(), toBlock: latest.toString() }, { headers: { "Cache-Control": "public, max-age=15" } });
  } catch { return NextResponse.json({ error: "onchain_telemetry_unavailable" }, { status: 503 }); }
}
