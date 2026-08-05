# Gen-X402 Testnet Gateway

> **Pay for Decisions, Not Outputs.**

Gen-X402 is a serverless decision layer for crypto applications and autonomous agents. A caller describes a decision, receives a free quote for two relevant x402 services, pays the exact quote in Base Sepolia USDC, and receives one GenLayer-anchored conclusion produced from both provider outputs.

This repository is the Base Sepolia validation deployment. It intentionally does not accept mainnet funds.

## Live Applications

| Application | URL | Purpose |
|---|---|---|
| Testnet Gateway | `https://gen-x402-testnet.vercel.app` | Landing page, human workflows, API keys, API, and documentation |
| Analytics | `https://gen-x402-analytics.vercel.app` | Read-only payment-to-verdict telemetry and traces |
| Admin | `https://gen-x402-admin.vercel.app` | Protected operational controls and diagnostics |
| OpenAPI | `https://gen-x402-testnet.vercel.app/api/openapi.json` | Machine-readable OpenAPI 3.1 contract |

## What Problem It Solves

An agent should not execute a treasury payment, select a service provider, approve another agent’s work, or classify token risk because one API returned a plausible-looking response. Gen-X402 separates **data acquisition** from **decision accountability**:

1. Route the request to two independent paid services.
2. Enforce a customer-approved spending ceiling before execution.
3. Validate that each provider returned coherent, usable evidence.
4. Submit only compact conclusions to GenLayer.
5. Return a single decision with agreements, conflicts, confidence, and provider-quality assessments.

The product is the final reasoned decision, not two disconnected API payloads.

## System Architecture

```text
Human wallet or agent payer
          │
          ├── POST /api/v1/quote ──────────────── free
          │          │
          │          └── provider ranking + live Base Sepolia preflight
          │
          └── POST /api/v1/<product> ──────────── x402 paid
                     │
                     ├── Base Sepolia USDC → control-contract treasury
                     ├── payment proof persisted and recorded on-chain
                     ├── capped CDP operations wallet pays provider A
                     ├── capped CDP operations wallet pays provider B
                     ├── outputs validated and compacted
                     ├── platform wallet submits compact evidence to GenLayer
                     └── GET /api/v1/jobs/:id returns final verdict
```

### Infrastructure

- **Frontend and API:** Next.js 16 serverless functions on Vercel.
- **State:** Cloudflare R2-compatible private object storage; no SQL database.
- **Customer payment:** x402 v2 exact payments in Base Sepolia USDC.
- **Upstream payment:** dedicated capped CDP API-key wallet.
- **Treasury and controls:** `GenX402Control` on Base Sepolia.
- **Decision consensus:** compact-evidence intelligent contract on GenLayer Studionet.
- **Background processing:** Vercel cron and poll-driven serverless continuation.
- **Operations:** separate protected analytics and admin deployments.

No VPS, local daemon, persistent worker, or developer computer is required in production.

## Financial Policy

Every quote is calculated from live provider prices.

```text
customerPrice = max(1 USDC, ceil(combinedProviderCost / 0.60))
operationalBudget = floor(customerPrice × 0.60)
genLayerReserve = ceil(customerPrice × 0.10)
protocolReserve = customerPrice - operationalBudget - genLayerReserve
```

Invariants:

- Customer minimum: **1 USDC**.
- Provider allocation: **60% maximum**.
- Protocol revenue/reserve: **30% minimum**.
- GenLayer allocation: **10% minimum**.
- The exact provider pair and provider cost are frozen into the quote.
- Unused provider allocation remains in the treasury.
- A provider purchase cannot exceed the quote’s operational budget.

## Products

| Product | Endpoint | Use case |
|---|---|---|
| Intelligence Gateway | `POST /api/v1/gateway` | General request routing across provider capabilities |
| Investigation | `POST /api/v1/investigate` | Wallet, token, protocol, transaction, repository, and risk investigation |
| Procurement | `POST /api/v1/procure` | Compare x402 or agent services and select the strongest provider |
| Decision | `POST /api/v1/decide` | Compact allow, deny, escalate, or risk decision for machine consumption |
| Quality Control | `POST /api/v1/quality-check` | Evaluate agent work against explicit acceptance criteria |

All product endpoints are x402-protected. API keys authenticate agents but never bypass per-call payment.

## API Quickstart

### 1. Create an API key

Humans can use:

```text
https://gen-x402-testnet.vercel.app/api-keys
```

Agents can self-enroll without a browser wallet.

#### Request a proof-of-work challenge

```bash
curl -sS https://gen-x402-testnet.vercel.app/api/v1/keys/challenge
```

The challenge expires after five minutes. Find a nonce where:

```text
sha256(challenge + ":" + nonce)
```

starts with the returned number of zero hexadecimal characters.

#### Node.js walletless-agent enrollment

```js
import { createHash } from "node:crypto";

const baseUrl = "https://gen-x402-testnet.vercel.app";
const challengeResponse = await fetch(baseUrl + "/api/v1/keys/challenge");
const { challenge, difficulty } = await challengeResponse.json();
const prefix = "0".repeat(difficulty);

let nonce = 0;
while (true) {
  const digest = createHash("sha256")
    .update(challenge + ":" + nonce)
    .digest("hex");
  if (digest.startsWith(prefix)) break;
  nonce += 1;
}

const response = await fetch(baseUrl + "/api/v1/keys", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    mode: "agent",
    owner: "0x1111111111111111111111111111111111111111",
    agent: "0x2222222222222222222222222222222222222222",
    challenge,
    nonce: String(nonce)
  })
});

const issued = await response.json();
if (!response.ok) throw new Error(issued.message ?? issued.error);

// issued.apiKey is displayed exactly once.
// Store it in an encrypted secret manager immediately.
console.log({ keyId: issued.keyId, expiresAt: issued.expiresAt });
```

The returned credential has the format `app_<base64url-json>.<base64url-hmac>`. Its readable payload contains only public binding metadata. The server signs it with HMAC-SHA256 using a dedicated server-only secret. The on-chain registry stores only owner, agent, policy, delegated account, chain, scopes, rate limit, active state, and current version. It never stores the raw key, token hash, HMAC signature, or signing secret.

Verify a stored key without making a payment:

```bash
curl -sS https://gen-x402-testnet.vercel.app/api/v1/keys/verify \
  -H "Authorization: Bearer $GEN_X402_API_KEY"
```

Rotate with `POST /api/v1/keys/rotate` and revoke with `POST /api/v1/keys/revoke`, using the same Bearer header. Rotation increments the authoritative version, so every prior token for that binding fails immediately. A lost raw key cannot be recovered.

### 2. Create a free quote

```bash
curl -sS https://gen-x402-testnet.vercel.app/api/v1/quote \
  -H "content-type: application/json" \
  --data '{
    "task": "Should this treasury approve the proposed vendor payment?",
    "subject": {
      "chainId": "eip155:84532",
      "address": "0x1111111111111111111111111111111111111111"
    },
    "context": {
      "amount": "2500 USDC",
      "invoiceId": "INV-2026-1042"
    },
    "acceptanceCriteria": [
      "Confirm the destination belongs to the named vendor",
      "Identify material exploit, sanctions, or scam evidence"
    ],
    "riskLevel": "high",
    "requestedPlan": "standard",
    "clientRequestId": "treasury-invoice-1042-v1"
  }'
```

The response freezes:

- Quote ID and 15-minute expiry.
- Product and normalized request hash.
- Two selected provider IDs, capabilities, hosts, prices, relevance, and preflight status.
- Combined provider cost.
- Exact customer USDC charge.
- Provider, GenLayer, and protocol allocations.
- Human-readable routing explanation.

### 3. Pay and execute with an x402 client

Install:

```bash
npm install @coinbase/cdp-sdk @x402/fetch
```

```js
import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";

const payer = new CdpX402Client({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET,
  environment: "development",
  walletConfig: { type: "eoa", accountName: "my-testnet-agent" },
  spendControls: { perRequest: "2.00 USDC", global: "10.00 USDC" }
});

const paidFetch = wrapFetchWithPayment(fetch, payer);
const response = await paidFetch(
  `https://gen-x402-testnet.vercel.app/api/v1/decide?quoteId=${quote.id}`,
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + process.env.GEN_X402_API_KEY
    },
    body: JSON.stringify(request)
  }
);

const accepted = await response.json();
```

Do not manually construct x402 headers. The payment client reads the `402 Payment Required` challenge, signs the Base Sepolia USDC authorization, and retries.

The paid request body must match the quote exactly. Any material change returns `quote_request_mismatch`.

### 4. Poll the job

```bash
curl -sS https://gen-x402-testnet.vercel.app/api/v1/jobs/$JOB_ID
```

Normal lifecycle:

```text
payment_pending
payment_settled
planning
providers_selected
evidence_requested
evidence_collected
evidence_normalized
genlayer_submitted
genlayer_pending
verdict_finalized
response_ready
```

Recovery and failure states:

```text
refund_pending
refunded
credited
failed
```

Poll every 3–5 seconds with exponential backoff. `202 Accepted` is not a verdict; wait for `response_ready` or a terminal failure state.

## Canonical Request Schema

| Field | Type | Rules |
|---|---|---|
| `task` | string | Required; 10–4,000 characters |
| `subject.chainId` | string | Optional; maximum 64 characters |
| `subject.address` | string | Optional; maximum 128 characters |
| `subject.url` | URL | Optional public URL; maximum 2,048 characters |
| `subject.repository` | string | Optional repository identifier |
| `context` | object | Optional structured facts; no secrets |
| `acceptanceCriteria` | string[] | Maximum 20 items; each 3–500 characters |
| `riskLevel` | enum | `low`, `medium`, or `high`; default `medium` |
| `requestedPlan` | enum | `quick`, `standard`, `deep`, or `quality` |
| `clientRequestId` | string | Required for execution; 8–128 characters |
| `callbackUrl` | URL | Optional; polling remains authoritative |

## Job Response

`GET /api/v1/jobs/:id` returns:

- `job`: payment, plan, status, budget, timestamps, and structured error state.
- `evidence`: normalized provider claims, recommendations, confidence, limitations, and cost.
- `execution`: GenLayer transaction, submission attempts, and checkpoint state.
- `verdict`: decision, confidence, score, summary, combined analysis, agreements, conflicts, provider assessments, reason codes, expiry, and GenLayer transaction.

Full upstream payloads remain in private telemetry. GenLayer receives only compact provider conclusions and supporting claims to avoid validator overload and timeout failures.

## Idempotency and Duplicate Protection

- `clientRequestId` identifies one logical caller request.
- The quote stores the normalized request hash.
- A settled quote creates at most one job.
- Replaying a settled quote returns the existing job with `duplicate: true`.
- Provider calls receive deterministic provider-specific idempotency keys.
- GenLayer submission is checkpointed and does not repeat after a recorded transaction.

## Error Reference

| Status | Error | Meaning |
|---|---|---|
| 400 | `invalid_json` | Request body is not valid JSON |
| 401 | `authorization_required` | Bearer authentication is missing |
| 401 | `invalid_authorization_scheme` | Authorization is not exactly `Bearer <token>` |
| 401 | `invalid_api_key_signature` | Token payload or signature was modified |
| 401 | `invalid_api_key_claims` | Token claims fail strict schema validation |
| 401 | `api_key_expired` | Token expiry has passed |
| 401 | `api_key_not_yet_valid` | Issued-at timestamp is unacceptably far in the future |
| 401 | `api_key_binding_not_found` | No authoritative metadata binding exists |
| 401 | `api_key_revoked` | Binding is inactive |
| 401 | `api_key_version_mismatch` | Binding was rotated and the token is stale |
| 401 | `api_key_binding_mismatch` | Public token claims differ from authoritative metadata |
| 402 | Payment Required | x402 payment authorization is required |
| 403 | `invalid_proof_of_work` | Agent enrollment challenge or nonce is invalid |
| 403 | `insufficient_scope` | Binding does not permit the requested operation |
| 429 | `rate_limit_exceeded` | Key, agent, owner, or IP exceeded its one-minute limit |
| 404 | `quote_not_found` | Quote does not exist or belongs to another product |
| 404 | `job_not_found` | Job ID is unknown |
| 409 | `quote_expired` | Quote passed its expiry |
| 409 | `quote_request_mismatch` | Execution body differs from quoted body |
| 422 | `invalid_request` | Schema validation failed |
| 428 | `quote_required` | A paid call was attempted without a quote ID |
| 503 | `provider_quorum_unavailable` | Two usable independent providers are unavailable |
| 503 | `payment_facilitator_not_configured` | CDP x402 server credentials are missing |
| 503 | `api_key_registry_unavailable` | Base Sepolia registry validation failed closed |
| 503 | `rate_limit_unavailable` | Distributed on-chain rate accounting could not complete |

## Security Boundaries

- The platform reporter is separate from the customer treasury.
- The operations wallet is separate, capped, and used only for upstream providers.
- Jobs remain locked until settlement metadata and the control-contract payment proof exist.
- Remote URLs reject private networks, credential-bearing URLs, redirects, unsupported ports, and oversized responses.
- Binary, empty, and incoherent provider outputs are rejected.
- The platform wallet—not the caller—submits evidence to GenLayer.
- Raw API keys are shown once and are never stored in Blob, logs, analytics, browser storage, URLs, or on-chain.
- HMAC verification uses Node.js `crypto`, a fixed SHA-256 algorithm, and constant-time signature comparison.
- On-chain rate buckets are HMAC-derived identifiers for key ID, agent, owner, and IP; raw identifiers are not written as rate-counter keys.
- Critical treasury actions are timelocked; emergency pause is immediate.
- The platform returns analysis and decisions but never signs or broadcasts the customer’s trade.

## Testnet Contracts

| Component | Address |
|---|---|
| Base Sepolia control and treasury | `0x42eB87cb7d1bb5A83cE15b4f2a34e1722Bd43f4b` |
| Base Sepolia API-key registry | `0xAf62B4FcE1b0FBf87BD0Dcf2A06A4434B9dCFf2c` |
| Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Platform reporter | `0x4a53cFB1CCFf805246C28aBd1Ec56F8B56F4D08E` |
| Admin | `0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E` |
| GenLayer compact judge | `0x2C0ab7014617160149707653eE0Faff578e29C88` |

GenLayer deployment transaction:

```text
0x08f111161f6bb9ed33dd6133354f5821d68b5c342a1e8565306c7a4a90d14c12
```

API-key registry deployment transaction:

```text
0x4cbbc233bc49389ae8fd03cd748150c74ef7d39280e474f4d68c38fa4d4752ff
```

## Environment Variables

```text
APP_URL
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
QUOTE_SIGNING_SECRET
X402_TREASURY_ADDRESS
CONTROL_CONTRACT_ADDRESS
API_KEY_REGISTRY_ADDRESS
API_KEY_SECRET
API_KEY_TTL_SECONDS
API_KEY_CLOCK_SKEW_SECONDS
PLATFORM_SIGNER_PRIVATE_KEY
BASE_USDC_ADDRESS
BASE_SEPOLIA_RPC_URL
X402_NETWORK
X402_FACILITATOR_URL
CDP_API_KEY_ID
CDP_API_KEY_SECRET
CDP_WALLET_SECRET
X402_PROVIDERS_JSON
CDP_DISCOVERY_URL
TESTNET_JOB_BUDGET_ATOMIC
TESTNET_DAILY_BUDGET_ATOMIC
GENLAYER_CONTRACT_ADDRESS
GENLAYER_SIGNER_PRIVATE_KEY
RESULT_SIGNING_SECRET
CRON_SECRET
DEMO_MODE
```

Secrets must exist only in Vercel environment variables or local ignored `.env` files.

## Validation

```bash
npm install
npm run typecheck
npm test
npm run contracts:lint
forge build
npm run build
```

## Operational Documentation

- `fix.md`: testnet fixes that must be carried into mainnet.
- `plan.md`: local ignored implementation plan.
- `risk.md`: local ignored operational risk register.
- `/docs`: full human-readable API documentation.
- `/api/openapi.json`: machine-readable OpenAPI 3.1 description.

## Testnet Notice

This application currently accepts Base Sepolia testnet USDC only. GenLayer decisions are anchored on Studionet. Testnet assets have no production value, and no mainnet payment should be sent to any address in this document.
