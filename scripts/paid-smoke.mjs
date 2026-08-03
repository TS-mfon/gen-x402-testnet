import { readFile } from "node:fs/promises";
import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [key, value.replace(/\\n/g, "\n")];
  }));
}
const credentials = parseEnv(await readFile("/home/sudodave/.env.build", "utf8"));
const client = new CdpX402Client({
  apiKeyId: credentials.CDP_API_KEY_ID,
  apiKeySecret: credentials.CDP_API_KEY_SECRET,
  walletSecret: credentials.CDP_WALLET_SECRET,
  environment: "development",
  walletConfig: { type: "eoa", accountName: "gen-x402-testnet-operations" },
  spendControls: { perRequest: "0.05 USDC", global: "0.10 USDC" },
});
const addresses = await client.getAddresses();
const paidFetch = wrapFetchWithPayment(fetch, client);
const clientRequestId = `paid-smoke-${Date.now()}`;
const response = await paidFetch("https://gen-x402-testnet.vercel.app/api/v1/decide", {
  method: "POST",
  headers: { "content-type": "application/json", "idempotency-key": clientRequestId },
  body: JSON.stringify({
    clientRequestId,
    task: "Decide whether the deployed Gen-X402 testnet gateway is operating on Base Sepolia only.",
    subject: { type: "protocol", id: "gen-x402-testnet" },
    context: { expectedNetwork: "eip155:84532", expectedAsset: "Base Sepolia USDC", validationRun: true },
    constraints: { maxProviders: 1, requireGenLayerFinality: true }
  }),
});
const body = await response.json().catch(async () => ({ text: await response.text() }));
console.log(JSON.stringify({ status: response.status, payer: addresses.evmAddress, paymentResponse: response.headers.get("payment-response") ?? response.headers.get("x-payment-response"), body }));
