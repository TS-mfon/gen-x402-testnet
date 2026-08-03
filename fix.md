# Testnet Fixes and Production Migration Checklist

This file records corrections validated in the Base Sepolia testnet branch. Apply each item to the mainnet project only after the corresponding testnet smoke test passes.

## Payment and pricing

- [x] Replace static authorization pricing with quote-first simulation.
- [x] Enforce a minimum customer charge of 1 USDC.
- [x] Calculate customer price so quoted provider cost never exceeds 60%.
- [x] Reserve at least 10% for GenLayer and at least 30% for protocol revenue.
- [x] Bind payment to quote ID, request hash, provider pair, price, and expiry.
- [x] Keep jobs locked in `payment_pending` until x402 settlement succeeds.
- [x] Capture x402 payer, network, amount, and transaction from settlement metadata.
- [x] Record the payment/job/quote link through the Base Sepolia control contract.
- [x] Prevent duplicate jobs with request idempotency and settled-quote reuse.
- [x] Fix browser payment payload serialization by converting `bigint` values before JSON serialization.

## Provider execution

- [x] Select a replacement candidate pool instead of only two providers.
- [x] Require two independent provider hosts and two usable outputs.
- [x] Reject audio, image, video, binary, empty, and incoherent provider responses.
- [x] Require a live Base Sepolia USDC x402 challenge unless a provider is an explicitly trusted fixture.
- [x] Reuse the exact provider pair quoted to the customer.
- [x] Enforce per-job and daily provider-spend ceilings.
- [ ] Verify at least two stable public Base Sepolia providers in repeated live tests.
- [ ] Persist provider registry changes on-chain through the admin dashboard.

## GenLayer

- [x] Send compact conclusions, claims, confidence, and limitations instead of entire raw responses.
- [x] Limit the compact evidence payload to 9 KB.
- [x] Require evidence from two providers before submission.
- [x] Allow only one automatic GenLayer retry.
- [x] Handle canceled and non-finalized GenLayer transactions without duplicate submissions.
- [x] Save evidence and verdict hashes to the Base Sepolia control contract.
- [ ] Redeploy the compact-payload intelligent contract on Studionet. Blocked on the shared Studionet RPC rate limit (`500 requests/hour`; retry window reported as approximately one hour on August 3, 2026).
- [ ] Update `GENLAYER_CONTRACT_ADDRESS` in Vercel.
- [ ] Complete one live payment-to-final-verdict smoke test.

## Refunds and reconciliation

- [x] Mark every post-payment terminal failure as refund-required.
- [x] Attempt an on-chain full refund through `refundJob` after a proved payment fails.
- [x] Persist refund transaction IDs and refund audit events.
- [ ] Fund the control contract with enough testnet USDC to absorb provider-loss refunds.
- [ ] Add a scheduled reconciliation pass for failed refund attempts and unproved settlements.

## API and agent access

- [x] Add one-time API-key issuance for wallet owners.
- [x] Add proof-of-work enrollment for walletless agents.
- [x] Store only API-key hashes and owner hashes on-chain.
- [x] Require `X-API-Key` when `X-Client-Type: agent` is used.
- [ ] Add signed timestamp and nonce headers for agent requests.
- [ ] Add replay storage and per-key rate limiting without a database.
- [ ] Add admin revocation and scope editing transactions.

## Frontend and analytics

- [x] Add quote simulation before payment authorization.
- [x] Add human rendered and agent JSON job output modes.
- [x] Split analytics into overview, jobs, payments, providers, audit, and wallet pages.
- [x] Add payment-to-verdict node tracing.
- [x] Contain long audit and lifecycle payloads in scrollable viewers.
- [x] Add rendered/JSON toggles to trace, provider, and audit payloads.
- [x] Use “Open GenLayer explorer” wording instead of Studio wording.
- [x] Add operational charts and financial KPIs.
- [ ] Read live Base Sepolia treasury and wallet balances on analytics pages.
- [x] Deploy and verify the separate admin Vercel project at `https://gen-x402-admin.vercel.app`.
- [x] Deploy the redesigned analytics Vercel project at `https://gen-x402-analytics.vercel.app`.
- [ ] Deploy the updated gateway only after the compact GenLayer contract address is available.

## Deployment

- [x] Deploy `GenX402Control` on Base Sepolia.
- [x] Separate the platform reporter from customer treasury funds.
- [x] Keep `plan.md`, `risk.md`, wallet files, and private keys ignored.
- [ ] Configure production Vercel environment variables for the control contract and treasury.
- [ ] Run gateway, analytics, admin, Solidity, and GenLayer validation in CI.
- [ ] Execute paid smoke tests before promoting any testnet behavior to mainnet.
