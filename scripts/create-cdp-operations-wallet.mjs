import { readFile, writeFile } from "node:fs/promises";
import { CdpClient } from "@coinbase/cdp-sdk";

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [key, value.replace(/\\n/g, "\n")];
  }));
}

const source = await readFile("/home/sudodave/.env.build", "utf8");
const credentials = parseEnv(source);
for (const key of ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"]) {
  if (!credentials[key]) throw new Error(`${key} is missing from /home/sudodave/.env.build`);
}
const cdp = new CdpClient({ apiKeyId: credentials.CDP_API_KEY_ID, apiKeySecret: credentials.CDP_API_KEY_SECRET, walletSecret: credentials.CDP_WALLET_SECRET });
const accountName = "gen-x402-testnet-operations";
const account = await cdp.evm.getOrCreateAccount({ name: accountName });
const faucetResults = {};
for (const token of ["eth", "usdc"]) {
  try {
    faucetResults[token] = await account.requestFaucet({
      network: "base-sepolia",
      token,
      idempotencyKey: `${accountName}-${token}`,
    });
  } catch (error) {
    faucetResults[token] = { error: error instanceof Error ? error.message : String(error) };
  }
}
await writeFile(new URL("../testnet-cdp-wallet.md", import.meta.url), `# CDP Testnet Operations Wallet\n\n- Address: ${account.address}\n- Account name: ${accountName}\n- Custody: CDP non-custodial API key wallet\n- Network: Base Sepolia only\n- ETH faucet: ${faucetResults.eth?.transactionHash ?? faucetResults.eth?.error ?? "not requested"}\n- USDC faucet: ${faucetResults.usdc?.transactionHash ?? faucetResults.usdc?.error ?? "not requested"}\n- Created or retrieved: ${new Date().toISOString()}\n`, { mode: 0o600 });
console.log(JSON.stringify({ address: account.address, faucetResults }));
