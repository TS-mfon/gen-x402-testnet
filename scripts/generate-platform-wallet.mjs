import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";

const privateKey = `0x${randomBytes(32).toString("hex")}`;
const account = privateKeyToAccount(privateKey);
const body = `# Platform Transaction Signer\n\n- Network: GenLayer Studionet\n- Address: ${account.address}\n- Private key: ${privateKey}\n- Created: ${new Date().toISOString()}\n\nKeep this file secret. It is ignored by git.\n`;
await writeFile(new URL("../pk.md", import.meta.url), body, { mode: 0o600 });
console.log(account.address);
