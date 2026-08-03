import "server-only";
import { z } from "zod";

const schema = z.object({
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  X402_TREASURY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).default("0x42eB87cb7d1bb5A83cE15b4f2a34e1722Bd43f4b"),
  BASE_USDC_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  X402_NETWORK: z.literal("eip155:84532").default("eip155:84532"),
  X402_FACILITATOR_URL: z.string().url().default("https://api.cdp.coinbase.com/platform/v2/x402"),
  CDP_API_KEY_ID: z.string().optional(),
  CDP_API_KEY_SECRET: z.string().optional(),
  CDP_WALLET_SECRET: z.string().optional(),
  GENLAYER_CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  GENLAYER_SIGNER_PRIVATE_KEY: z.string().optional(),
  CONTROL_CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).default("0x42eB87cb7d1bb5A83cE15b4f2a34e1722Bd43f4b"),
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
  X402_PROVIDERS_JSON: z.string().optional(),
  CDP_DISCOVERY_URL: z.string().url().default("https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?network=eip155:84532"),
  TESTNET_DAILY_BUDGET_ATOMIC: z.coerce.number().int().positive().default(5_000_000),
  TESTNET_JOB_BUDGET_ATOMIC: z.coerce.number().int().positive().default(500_000),
  RESULT_SIGNING_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEMO_MODE: z.enum(["true", "false"]).default("false")
});

export const env = schema.parse({
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  X402_TREASURY_ADDRESS: process.env.X402_TREASURY_ADDRESS,
  BASE_USDC_ADDRESS: process.env.BASE_USDC_ADDRESS,
  X402_NETWORK: process.env.X402_NETWORK,
  X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL,
  CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
  CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET,
  CDP_WALLET_SECRET: process.env.CDP_WALLET_SECRET,
  GENLAYER_CONTRACT_ADDRESS: process.env.GENLAYER_CONTRACT_ADDRESS,
  GENLAYER_SIGNER_PRIVATE_KEY: process.env.GENLAYER_SIGNER_PRIVATE_KEY,
  CONTROL_CONTRACT_ADDRESS: process.env.CONTROL_CONTRACT_ADDRESS,
  BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL,
  X402_PROVIDERS_JSON: process.env.X402_PROVIDERS_JSON,
  CDP_DISCOVERY_URL: process.env.CDP_DISCOVERY_URL,
  TESTNET_DAILY_BUDGET_ATOMIC: process.env.TESTNET_DAILY_BUDGET_ATOMIC,
  TESTNET_JOB_BUDGET_ATOMIC: process.env.TESTNET_JOB_BUDGET_ATOMIC,
  RESULT_SIGNING_SECRET: process.env.RESULT_SIGNING_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  APP_URL: process.env.APP_URL,
  DEMO_MODE: process.env.DEMO_MODE
});
