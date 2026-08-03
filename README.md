# Gen-X402 Testnet Gateway

**Pay for Decisions, Not Outputs.**

Gen-X402 is a database-free, serverless Base Sepolia validation environment for crypto agents. A client first receives an exact quote for two relevant x402 providers. After the client pays testnet USDC, the treasury records the settlement, a bounded platform wallet purchases both provider responses, and GenLayer compares and combines their compact conclusions into one decision.

- Gateway: `https://gen-x402-testnet.vercel.app`
- Analytics: `https://gen-x402-analytics.vercel.app`
- Planned admin deployment: `https://gen-x402-admin.vercel.app`

## Products

- Crypto Investigation Agent
- Agent Procurement Gateway
- Pay-Per-Decision API
- Agent Quality-Control Gateway
- Unified x402 Intelligence Gateway

## Architecture

- Next.js 16 serverless functions on Vercel
- Private Vercel Blob objects for job snapshots, evidence, verdicts, idempotency, and audit events
- `@x402/next` for customer payment enforcement
- `@x402/fetch` and a dedicated CDP operations wallet for upstream provider payments
- Base Sepolia control contract for treasury custody, allocation ceilings, payment proofs, job hashes, API-key hashes, pause controls, timelocks, and refunds
- GenLayer Studionet intelligent contract for two-source comparison and consensus
- No SQL database, VPS, local daemon, or persistent worker

## Decision Lifecycle

1. Submit the intended request to `POST /api/v1/quote` without payment.
2. The gateway ranks registered providers by product capability, request relevance, availability, quality, and price.
3. Candidate providers are preflighted. A live provider must advertise Base Sepolia USDC through x402 unless it is explicitly configured as a trusted fixture.
4. The quote freezes two providers, both prices, customer amount, allocation, request hash, and a 15-minute expiry.
5. Repeat the identical request against the paid product endpoint with the quote ID.
6. x402 verifies and settles customer USDC directly to the control-contract treasury.
7. The settlement hook records payer, amount, settlement transaction, quote, request hash, and job before execution is unlocked.
8. The platform operations wallet pays the two quoted upstream providers.
9. The gateway rejects binary, empty, or incoherent outputs and requires two independent usable responses.
10. Only compact provider conclusions, claims, confidence, and limitations are sent to GenLayer.
11. GenLayer compares agreements and conflicts, combines the evidence, and finalizes a verdict.
12. A paid job that cannot complete attempts a full treasury refund.

## Pricing Policy

- Minimum customer charge: **1 USDC**.
- Maximum provider allocation: **60%** of customer payment.
- Minimum GenLayer reserve: **10%**.
- Minimum protocol reserve/revenue: **30%**.
- Customer price: `max(1 USDC, quoted provider cost / 0.60)`.
- Unused operational allocation remains in the treasury.
- Execution uses the exact provider pair and costs fixed in the quote.

## API Documentation

### Create a Quote

`POST /api/v1/quote`

```json
{
  "product": "decision",
  "task": "Should this autonomous agent approve the proposed vendor payment?",
  "subject": {
    "chainId": "eip155:84532",
    "address": "0x0000000000000000000000000000000000000000"
  },
  "context": {},
  "acceptanceCriteria": ["Use two independent sources"],
  "riskLevel": "medium",
  "clientRequestId": "client-generated-unique-id"
}
```

The response includes:

- Exact provider pair and routing explanation
- Individual and combined provider cost
- Customer USDC amount
- Operational, GenLayer, and protocol allocations
- Request hash
- Quote ID and expiry

### Execute a Paid Request

```text
POST /api/v1/gateway
POST /api/v1/investigate
POST /api/v1/procure
POST /api/v1/decide
POST /api/v1/quality-check
```

Append `?quoteId=<quote-id>` or send `X-Quote-Id: <quote-id>`. The JSON body must match the quoted request exactly. Without a valid payment the route returns an x402 `402 Payment Required` challenge. After settlement it returns `202 Accepted` and a polling URL.

### Poll a Job

`GET /api/v1/jobs/:id`

The JSON response includes:

- Job and payment state
- Quote ID and customer price
- Normalized provider records
- Provider claims, recommendations, confidence, limitations, and costs
- GenLayer submission transaction and attempt count
- Final GenLayer verdict

The web interface offers both a rendered human view and raw JSON for agents and debugging.

### API-Key Enrollment

Human or wallet-backed enrollment:

`POST /api/v1/keys`

Walletless agent enrollment:

1. `GET /api/v1/keys/challenge`
2. Find a nonce satisfying the returned proof-of-work difficulty.
3. Submit `mode`, agent identifier, challenge, and nonce to `POST /api/v1/keys`.

The API secret is shown once and cannot be recovered. Only the key hash and owner hash are registered on-chain.

Agent request headers:

```text
X-Client-Type: agent
X-API-Key: <key-id>.<one-time-secret>
X-Quote-Id: <quote-id>
```

### Idempotency and Duplicate Protection

- `clientRequestId` identifies the logical request.
- A paid quote is bound to one request hash.
- Replaying a settled quote returns the existing job.
- Provider calls use provider-specific idempotency keys.
- GenLayer submission is checkpointed and allows one automatic retry only.

## Testnet Contracts

- Base Sepolia control and treasury: `0x42eB87cb7d1bb5A83cE15b4f2a34e1722Bd43f4b`
- Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Platform reporter: `0x4a53cFB1CCFf805246C28aBd1Ec56F8B56F4D08E`
- Admin: `0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E`

The compact-evidence GenLayer contract must be redeployed before the next paid end-to-end smoke test. Do not use the older deployment for production validation.

## Required Vercel Configuration

```text
BLOB_READ_WRITE_TOKEN
X402_TREASURY_ADDRESS=0x42eB87cb7d1bb5A83cE15b4f2a34e1722Bd43f4b
CONTROL_CONTRACT_ADDRESS=0x42eB87cb7d1bb5A83cE15b4f2a34e1722Bd43f4b
BASE_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
X402_NETWORK=eip155:84532
CDP_API_KEY_ID
CDP_API_KEY_SECRET
CDP_WALLET_SECRET
GENLAYER_CONTRACT_ADDRESS
GENLAYER_SIGNER_PRIVATE_KEY
RESULT_SIGNING_SECRET
CRON_SECRET
APP_URL
DEMO_MODE=false
```

## Local Validation

```bash
npm install
npm run typecheck
npm test
npm run contracts:lint
forge build
npm run build
```

## Security Boundaries

- The platform reporter is not the customer treasury.
- A separate capped CDP operations wallet pays providers.
- Jobs remain locked until successful x402 settlement metadata is persisted and proved.
- External URLs reject private networks, credential-bearing URLs, redirects, unsupported ports, and oversized responses.
- Full provider responses stay in private telemetry; GenLayer receives compact decision evidence.
- The platform returns decisions and evidence, but never signs or broadcasts customer trading actions.
- Critical treasury actions are timelocked; emergency pause is immediate.

## Migration Notes

See `fix.md` for the testnet-to-mainnet correction checklist. Local operational risks are documented in ignored `risk.md`. Local execution planning is documented in ignored `plan.md`.

## Paid Beta Notice

Customer payments use Base Sepolia testnet USDC only. GenLayer verdicts are anchored on Studionet and are validation outputs. This deployment accepts no mainnet funds.
