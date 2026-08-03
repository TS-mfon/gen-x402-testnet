# Gen-X402 Testnet Gateway

A database-free, serverless Base Sepolia validation environment for crypto agents. Customers pay fixed testnet USDC fees through x402. The gateway can purchase approved Base Sepolia upstream x402 services from a bounded operations wallet, normalize evidence, and submit a constrained verdict case to GenLayer Studionet.

Target deployment: `https://gen-x402-testnet.vercel.app`

## Products

- Crypto Investigation Agent
- Agent Procurement Gateway
- Pay-Per-Decision API
- Agent Quality-Control Gateway
- Unified x402 Intelligence Gateway

## Architecture

- Next.js 16 on Vercel
- Vercel Blob for private job snapshots, idempotency records, verdicts, and append-only audit events
- `@x402/next` for seller payment enforcement
- `@x402/fetch` for upstream paid service calls
- GenLayer Studionet intelligent contract for bounded consensus verdicts
- No SQL database, VPS, local daemon, or persistent worker

## Local validation

```bash
npm install
cp .env.example .env.local
# Set DEMO_MODE=true only for unpaid local testing
npm run typecheck
npm test
npm run build
```

## Testnet configuration

1. Create a Vercel Blob store and connect it to the project.
2. Configure a Base Sepolia USDC treasury recipient.
3. Fund a separate low-balance operations wallet for upstream x402 purchases.
4. Set `X402_PROVIDERS_JSON` to an approved provider list; discovered endpoints must not be used until validated.
5. The current Studionet judge is deployed at `0x3dB29d17DC0c54f57bcfe744d240b75E4003Bf7C`; configure the private reporter key from the ignored `pk.md` file in Vercel.
6. Set `CRON_SECRET`, leave `DEMO_MODE=false`, and deploy.

## API

```text
POST /api/v1/gateway
POST /api/v1/investigate
POST /api/v1/procure
POST /api/v1/decide
POST /api/v1/quality-check
GET  /api/v1/jobs/:id
```

Each POST returns an x402 payment requirement when no valid payment is supplied. After payment settlement it returns `202 Accepted` and a polling URL.

## Security boundaries

- The revenue treasury never calls upstream providers; a separate named CDP operations wallet handles capped provider payments.
- The operations wallet is separate and should hold only a capped budget.
- External URLs reject private networks, credential-bearing URLs, redirects, unsupported ports, and oversized responses.
- GenLayer receives normalized evidence and hashes, not customer private keys or financial authority.
- The platform returns advice and machine-readable decisions; it does not broadcast customer transactions.

## Paid beta notice

Customer payments use Base Sepolia testnet USDC only. GenLayer verdicts are anchored on Studionet and are validation outputs; no mainnet funds are accepted by this deployment.
