import Link from "next/link";
import "./docs.css";

const baseUrl = "https://gen-x402-testnet.vercel.app";

const requestExample = `{
  "task": "Should this treasury approve the proposed vendor payment?",
  "subject": {
    "chainId": "eip155:84532",
    "address": "0x1111111111111111111111111111111111111111"
  },
  "context": {
    "amount": "2500 USDC",
    "vendor": "Example Infrastructure Ltd",
    "invoiceId": "INV-2026-1042"
  },
  "acceptanceCriteria": [
    "Confirm the destination is associated with the named vendor",
    "Identify material sanctions, exploit, or scam evidence"
  ],
  "riskLevel": "high",
  "requestedPlan": "standard",
  "clientRequestId": "treasury-invoice-1042-v1"
}`;

const agentEnrollment = `import { createHash } from "node:crypto";

const baseUrl = "${baseUrl}";
const agentIdentity = "did:key:z6Mk...your-durable-agent-identity";

const challengeResponse = await fetch(baseUrl + "/api/v1/keys/challenge");
const challengeBody = await challengeResponse.json();
if (!challengeResponse.ok) {
  throw new Error(challengeBody.message ?? challengeBody.error);
}

const { challenge, difficulty } = challengeBody;
const prefix = "0".repeat(difficulty);
let nonce = 0;

while (true) {
  const digest = createHash("sha256")
    .update(challenge + ":" + nonce)
    .digest("hex");
  if (digest.startsWith(prefix)) break;
  nonce += 1;
}

const issueResponse = await fetch(baseUrl + "/api/v1/keys", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    mode: "agent",
    owner: process.env.OWNER_ADDRESS,
    agent: process.env.AGENT_ADDRESS,
    challenge,
    nonce: String(nonce)
  })
});

const issued = await issueResponse.json();
if (!issueResponse.ok) throw new Error(issued.message ?? issued.error);

// Persist issued.apiKey in an encrypted secret manager immediately.
// Never print it to logs, prompts, traces, or source control.
console.log({ keyId: issued.keyId, expiresAt: issued.expiresAt });`;

const cdpClient = `import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";

const payer = new CdpX402Client({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET,
  environment: "development",
  walletConfig: { type: "eoa", accountName: "my-testnet-agent" },
  spendControls: {
    perRequest: "2.00 USDC",
    global: "10.00 USDC"
  }
});

const paidFetch = wrapFetchWithPayment(fetch, payer);`;

const paidExecution = `const request = ${requestExample};

const quoteResponse = await fetch(baseUrl + "/api/v1/quote", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request)
});
const quoteBody = await quoteResponse.json();
if (!quoteResponse.ok) throw new Error(quoteBody.message ?? quoteBody.error);

const response = await paidFetch(
  baseUrl + "/api/v1/decide?quoteId=" + quoteBody.quote.id,
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
if (response.status !== 202) throw new Error(JSON.stringify(accepted));
console.log(accepted.jobId, accepted.pollUrl);`;

const endpoints = [
  ["/api/v1/gateway", "General router for requests spanning multiple intelligence categories."],
  ["/api/v1/investigate", "Crypto evidence, wallet, protocol, token, transaction, and risk investigation."],
  ["/api/v1/procure", "Compare and select x402 providers or agent services for a requirement."],
  ["/api/v1/decide", "Return a compact machine-readable allow, deny, escalate, or risk decision."],
  ["/api/v1/quality-check", "Evaluate an agent deliverable against explicit acceptance criteria."],
];

const errors = [
  ["400", "invalid_json", "Send parseable JSON with Content-Type: application/json."],
  ["401", "authorization_required", "Add Authorization: Bearer <api-key>."],
  ["401", "invalid_api_key_signature", "The credential is malformed or has been modified."],
  ["401", "api_key_version_mismatch", "Rotate clients to the latest key version."],
  ["401", "api_key_revoked", "The authoritative binding is inactive."],
  ["403", "insufficient_scope", "Use a binding that permits the requested operation."],
  ["429", "rate_limit_exceeded", "Back off until the next one-minute window."],
  ["402", "Payment Required", "Use an x402 client funded with Base Sepolia USDC."],
  ["403", "invalid_proof_of_work", "Request a new challenge and solve it before expiry."],
  ["404", "quote_not_found", "Create a new quote for the same product endpoint."],
  ["404", "job_not_found", "Use the job ID returned by the paid request."],
  ["409", "quote_expired", "Simulate again; do not pay an expired quote."],
  ["409", "quote_request_mismatch", "Send the exact body used to create the quote."],
  ["422", "invalid_request", "Correct the fields listed in the returned validation issues."],
  ["428", "quote_required", "Call POST /api/v1/quote and supply its quote ID."],
  ["503", "provider_quorum_unavailable", "Two usable providers are unavailable; retry later."],
  ["503", "payment_facilitator_not_configured", "Deployment configuration error; do not retry payment."],
  ["503", "api_key_registry_unavailable", "The on-chain registry could not be validated; authentication fails closed."],
];

function Code({ children }: { children: string }) {
  return <pre className="docs-code"><code>{children}</code></pre>;
}

function Method({ children, paid = false }: { children: React.ReactNode; paid?: boolean }) {
  return <span className={`method ${paid ? "paid" : ""}`}>{children}</span>;
}

export default function Page() {
  return <main className="section docs-page">
    <div className="phase-line"><span>PROTOCOL REFERENCE</span><i />API V1 / BASE SEPOLIA</div>
    <header className="docs-hero">
      <div>
        <span className="eyebrow">GEN-X402 DEVELOPER DOCUMENTATION</span>
        <h1>Build agents that pay for decisions.</h1>
        <p>Complete integration reference for quote simulation, autonomous API-key enrollment, x402 payment, two-provider execution, GenLayer consensus, polling, idempotency, errors, and operational safety.</p>
        <div className="docs-actions">
          <a className="tech-button primary-action" href="/api/openapi.json" target="_blank" rel="noreferrer">OPENAPI 3.1 JSON ↗</a>
          <Link className="tech-button" href="/api-keys">CREATE KEY IN UI</Link>
        </div>
      </div>
      <div className="module-readout">
        <span>BASE URL</span><b>GEN-X402-TESTNET.VERCEL.APP</b>
        <span>PAYMENT</span><b>BASE SEPOLIA USDC</b>
        <span>PROTOCOL</span><b>X402 V2 / EXACT</b>
        <span>VERDICT</span><b>GENLAYER STUDIONET</b>
      </div>
    </header>

    <div className="docs-layout">
      <aside className="docs-nav">
        <b>DOCUMENTATION</b>
        <a href="#quickstart">Quickstart</a>
        <a href="#architecture">Architecture</a>
        <a href="#authentication">API keys</a>
        <a href="#agent-enrollment">Agent key creation</a>
        <a href="#x402">x402 payment</a>
        <a href="#requests">Request schema</a>
        <a href="#products">Products</a>
        <a href="#quotes">Quotes</a>
        <a href="#execution">Paid execution</a>
        <a href="#jobs">Jobs and verdicts</a>
        <a href="#errors">Errors</a>
        <a href="#security">Security</a>
        <a href="#contracts">Contracts</a>
      </aside>

      <article className="docs-content">
        <section id="quickstart">
          <span className="docs-index">01 / QUICKSTART</span>
          <h2>Integration in five operations</h2>
          <ol className="docs-steps">
            <li><b>Create an API key.</b><span>Use the connected-wallet UI or let a walletless agent solve the enrollment proof of work.</span></li>
            <li><b>Simulate the request.</b><span>Call <code>POST /api/v1/quote</code> without payment to freeze provider selection and price.</span></li>
            <li><b>Pay and execute.</b><span>Repeat the exact request against the matching product endpoint through an x402-compatible client.</span></li>
            <li><b>Store the job ID.</b><span>A successful paid request returns <code>202 Accepted</code> and a polling URL.</span></li>
            <li><b>Poll for consensus.</b><span>Read provider evidence and the finalized GenLayer verdict from the job endpoint.</span></li>
          </ol>
          <div className="docs-callout warning"><b>Authentication is not payment</b><p>An API key authenticates an agent. It never bypasses x402. Every decision call remains independently paid.</p></div>
        </section>

        <section id="architecture">
          <span className="docs-index">02 / ARCHITECTURE</span>
          <h2>Payment-to-verdict lifecycle</h2>
          <div className="lifecycle-row">{["FREE QUOTE", "CUSTOMER USDC", "TREASURY", "2 × PROVIDERS", "COMPACT EVIDENCE", "GENLAYER", "VERDICT"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b></div>)}</div>
          <p>The gateway ranks relevant services, preflights Base Sepolia support, freezes two providers in a 15-minute quote, settles customer USDC to the control-contract treasury, pays the frozen providers from the capped platform operations wallet, validates and compacts both outputs, and asks GenLayer to compare agreements, conflicts, quality, and confidence.</p>
          <div className="docs-grid">
            <div className="docs-stat"><span>PROVIDER CEILING</span><b>60%</b><p>Maximum customer-payment allocation for upstream x402 services.</p></div>
            <div className="docs-stat"><span>PROTOCOL RESERVE</span><b>≥30%</b><p>Minimum retained revenue plus unused operational funds.</p></div>
            <div className="docs-stat"><span>GENLAYER RESERVE</span><b>≥10%</b><p>Minimum allocation reserved for consensus execution.</p></div>
          </div>
          <p>No SQL database, VPS, local process, or persistent worker is required. Quotes are signed stateless tokens; private R2-compatible object storage holds jobs, evidence, verdicts, idempotency records, budgets, and audit events.</p>
        </section>

        <section id="authentication">
          <span className="docs-index">03 / AUTHENTICATION</span>
          <h2>API key model</h2>
          <p>Keys use <code>app_&lt;base64url-json-payload&gt;.&lt;base64url-hmac&gt;</code>. The readable payload contains only public metadata. Base Sepolia stores owner, agent, policy, delegated account, chain, scopes, rate limit, active state, and current version—never the bearer token or HMAC secret.</p>
          <table className="docs-table"><thead><tr><th>Header</th><th>Required</th><th>Purpose</th></tr></thead><tbody>
            <tr><td><code>Authorization</code></td><td>Agent calls</td><td><code>Bearer app_…</code>; the raw credential is shown once and never stored.</td></tr>
            <tr><td><code>X-Quote-Id</code></td><td>Paid execution</td><td>Links execution to the frozen quote. The <code>quoteId</code> query parameter is also accepted.</td></tr>
            <tr><td><code>Content-Type</code></td><td>POST requests</td><td>Must be <code>application/json</code>.</td></tr>
          </tbody></table>
          <h3>Verify a stored key without payment</h3>
          <Code>{`curl -sS ${baseUrl}/api/v1/keys/verify -H "Authorization: Bearer $GEN_X402_API_KEY"`}</Code>
          <p>A valid key returns public binding metadata, expiry, scopes, rate limit, network, and <code>paymentRequiredPerDecision: true</code>. It never returns the signing secret.</p>
        </section>

        <section id="agent-enrollment">
          <span className="docs-index">04 / AUTONOMOUS AGENT ENROLLMENT</span>
          <h2>How an agent creates its own API key</h2>
          <p>An agent requests a short-lived server-signed challenge, solves a bounded SHA-256 proof of work, and submits the owner and agent Base Sepolia addresses. The owner is the controlling identity; the agent is the delegated caller identity included in the public signed payload and authoritative binding.</p>
          <h3>1. Request the five-minute challenge</h3>
          <Code>{`curl -sS ${baseUrl}/api/v1/keys/challenge`}</Code>
          <Code>{`{
  "challenge": "<issuedAt>.<random>.<server-signature>",
  "difficulty": 4,
  "expiresAt": "<ISO-8601 timestamp>",
  "instructions": "Find a nonce where sha256(challenge + ':' + nonce) starts with four zero hex characters."
}`}</Code>
          <h3>2. Solve and submit enrollment</h3>
          <Code>{agentEnrollment}</Code>
          <h3>3. Store the one-time response</h3>
          <Code>{`{
  "keyId": "<uuid>",
  "keyVersion": 1,
  "apiKey": "app_<base64url-json-payload>.<base64url-hmac>",
  "owner": "0x<owner>",
  "agent": "0x<agent>",
  "policyId": "gen-x402:testnet:default",
  "scopes": ["quotes:create", "jobs:create", "jobs:read:own", "providers:read"],
  "rateLimitPerMinute": 5,
  "expiresAt": "<ISO-8601 timestamp>",
  "transaction": "0x<base-sepolia-registration-transaction>"
}`}</Code>
          <div className="docs-callout"><b>Agent storage rule</b><p>Store <code>apiKey</code> in an encrypted secret manager or injected environment variable. Never place it in prompts, memory, telemetry, callback payloads, source control, or public logs.</p></div>
          <h3>Agent enrollment failures</h3>
          <table className="docs-table"><thead><tr><th>Error</th><th>Meaning</th><th>Recovery</th></tr></thead><tbody>
            <tr><td><code>invalid_proof_of_work</code></td><td>Nonce is wrong, challenge expired, or challenge signature is invalid.</td><td>Request a new challenge and solve it from zero.</td></tr>
            <tr><td><code>owner_required</code></td><td>The durable identity is missing or shorter than eight characters.</td><td>Use a DID, public key, or stable agent identifier.</td></tr>
            <tr><td><code>key_issue_failed</code></td><td>On-chain key-hash registration failed.</td><td>Retry after checking Base Sepolia availability.</td></tr>
          </tbody></table>
        </section>

        <section id="x402">
          <span className="docs-index">05 / X402 PAYMENT</span>
          <h2>Quote first, pay second</h2>
          <p>Do not manually construct payment payload headers. An x402-compatible client receives <code>402 Payment Required</code>, reads the exact Base Sepolia USDC requirement, signs authorization, and retries automatically.</p>
          <h3>CDP API-key wallet client</h3>
          <Code>{cdpClient}</Code>
          <div className="docs-callout warning"><b>Spend controls</b><p>Set the payer wallet’s per-request ceiling above the quote price. Keep its Base Sepolia ETH and USDC balances deliberately small during validation.</p></div>
          <table className="docs-table"><tbody>
            <tr><th>Network</th><td><code>eip155:84532</code></td></tr>
            <tr><th>Asset</th><td>Base Sepolia USDC</td></tr>
            <tr><th>Scheme</th><td>x402 v2 exact EVM payment</td></tr>
            <tr><th>Recipient</th><td>Control-contract treasury</td></tr>
            <tr><th>Minimum quote</th><td>1 USDC</td></tr>
          </tbody></table>
        </section>

        <section id="requests">
          <span className="docs-index">06 / REQUEST CONTRACT</span>
          <h2>Canonical intelligence request</h2>
          <Code>{requestExample}</Code>
          <table className="docs-table"><thead><tr><th>Field</th><th>Type</th><th>Validation and meaning</th></tr></thead><tbody>
            <tr><td><code>task</code></td><td>string</td><td>Required; 10–4,000 characters. State the decision and desired output clearly.</td></tr>
            <tr><td><code>subject</code></td><td>object</td><td>Optional chain ID, address, public HTTPS URL, or repository.</td></tr>
            <tr><td><code>context</code></td><td>object</td><td>Structured supporting facts. Never include secrets.</td></tr>
            <tr><td><code>acceptanceCriteria</code></td><td>string[]</td><td>Maximum 20 items; each 3–500 characters.</td></tr>
            <tr><td><code>riskLevel</code></td><td>enum</td><td><code>low</code>, <code>medium</code>, or <code>high</code>; defaults to medium.</td></tr>
            <tr><td><code>requestedPlan</code></td><td>enum</td><td><code>quick</code>, <code>standard</code>, <code>deep</code>, or <code>quality</code>.</td></tr>
            <tr><td><code>clientRequestId</code></td><td>string</td><td>Required for execution; 8–128 characters. Reuse only for the same logical request.</td></tr>
            <tr><td><code>callbackUrl</code></td><td>URL</td><td>Optional HTTPS destination; polling remains authoritative.</td></tr>
          </tbody></table>
        </section>

        <section id="products">
          <span className="docs-index">07 / PRODUCTS</span>
          <h2>Choose the endpoint by decision type</h2>
          <div className="endpoint-list">{endpoints.map(([path, description]) => <div key={path}><Method paid>POST</Method><code>{path}</code><p>{description}</p></div>)}</div>
          <h3>Free read endpoints</h3>
          <div className="endpoint-list">
            <div><Method>GET</Method><code>/api/v1/providers</code><p>Configured and discovered provider registry.</p></div>
            <div><Method>GET</Method><code>/api/v1/jobs/:id</code><p>Current evidence, execution checkpoint, and verdict.</p></div>
          </div>
        </section>

        <section id="quotes">
          <span className="docs-index">08 / QUOTE SIMULATION</span>
          <h2>Freeze routing and price without paying</h2>
          <div className="endpoint-title"><Method>POST</Method><code>/api/v1/quote</code></div>
          <Code>{`const quoteResponse = await fetch("${baseUrl}/api/v1/quote", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request)
});
const { quote, payment, allocation } = await quoteResponse.json();`}</Code>
          <p>The response includes two selected providers, individual and combined provider costs, customer charge, 60/10/30 allocation, routing explanation, request hash, quote ID, and expiry.</p>
          <div className="docs-callout warning"><b>Exact-body rule</b><p>The paid request must normalize to the same request hash. Changing the task, subject, context, criteria, risk level, plan, or client request ID causes <code>quote_request_mismatch</code>.</p></div>
          <h3>Price calculation</h3>
          <Code>{`customerPrice = max(1 USDC, ceil(combinedProviderCost / 0.60))
operationalBudget = floor(customerPrice × 0.60)
genLayerReserve = ceil(customerPrice × 0.10)
protocolReserve = customerPrice - operationalBudget - genLayerReserve`}</Code>
        </section>

        <section id="execution">
          <span className="docs-index">09 / PAID EXECUTION</span>
          <h2>Execute the frozen request</h2>
          <Code>{paidExecution}</Code>
          <p><code>202 Accepted</code> means a paid payment-to-verdict pipeline exists. It does not mean GenLayer has finalized. Store the returned job ID and poll the returned URL.</p>
          <h3>Duplicate protection</h3>
          <ul className="docs-rules">
            <li>A quote is bound to one normalized request hash.</li>
            <li>A settled quote can create only one job.</li>
            <li>Replaying a settled quote returns the existing job with <code>duplicate: true</code>.</li>
            <li>Provider calls receive deterministic provider-specific idempotency keys.</li>
            <li>GenLayer submission is checkpointed to prevent duplicate contract calls.</li>
          </ul>
        </section>

        <section id="jobs">
          <span className="docs-index">10 / JOBS AND VERDICTS</span>
          <h2>Poll the complete decision lifecycle</h2>
          <div className="endpoint-title"><Method>GET</Method><code>/api/v1/jobs/:id</code></div>
          <Code>{`const terminal = new Set(["response_ready", "failed", "refunded", "credited"]);
let result;
do {
  await new Promise(resolve => setTimeout(resolve, 4000));
  const response = await fetch(baseUrl + "/api/v1/jobs/" + jobId);
  result = await response.json();
} while (!terminal.has(result.job.status));`}</Code>
          <div className="status-flow">{["payment_pending", "payment_settled", "planning", "providers_selected", "evidence_requested", "evidence_collected", "evidence_normalized", "genlayer_submitted", "genlayer_pending", "verdict_finalized", "response_ready"].map((status) => <code key={status}>{status}</code>)}</div>
          <p>Use 3–5 second polling with exponential backoff. Failure and recovery states include <code>failed</code>, <code>refund_pending</code>, <code>refunded</code>, and <code>credited</code>.</p>
          <h3>Response sections</h3>
          <table className="docs-table"><thead><tr><th>Section</th><th>Contents</th></tr></thead><tbody>
            <tr><td><code>job</code></td><td>Status, quote, product, plan, price, budget, timestamps, and structured error.</td></tr>
            <tr><td><code>evidence</code></td><td>Provider names, categories, claims, recommendations, confidence, limitations, and costs.</td></tr>
            <tr><td><code>execution</code></td><td>GenLayer submission transaction, attempt count, and processing checkpoint.</td></tr>
            <tr><td><code>verdict</code></td><td>Decision, confidence, score, summary, combined analysis, provider assessments, agreements, conflicts, reason codes, and transaction.</td></tr>
          </tbody></table>
        </section>

        <section id="errors">
          <span className="docs-index">11 / ERROR REFERENCE</span>
          <h2>HTTP and protocol failures</h2>
          <table className="docs-table error-table"><thead><tr><th>Status</th><th>Error</th><th>Recovery</th></tr></thead><tbody>{errors.map(([status, error, recovery]) => <tr key={`${status}-${error}`}><td>{status}</td><td><code>{error}</code></td><td>{recovery}</td></tr>)}</tbody></table>
        </section>

        <section id="security">
          <span className="docs-index">12 / SECURITY AND OPERATIONS</span>
          <h2>Rules every integration must preserve</h2>
          <ul className="docs-rules">
            <li>Never send private keys, seed phrases, API secrets, or confidential documents in <code>task</code> or <code>context</code>.</li>
            <li>Use a unique <code>clientRequestId</code> for each new logical decision; reuse it only for retries.</li>
            <li>Do not treat <code>202 Accepted</code> as a verdict. Wait for <code>response_ready</code>.</li>
            <li>Do not treat <code>insufficient_evidence</code> as approval. Escalate or obtain better evidence.</li>
            <li>Keep payer wallets capped. The platform never needs the caller’s signing key.</li>
            <li>The platform wallet—not the calling agent—submits compact evidence to GenLayer.</li>
            <li>Full provider payloads stay in private telemetry; compact conclusions enter consensus.</li>
            <li>The platform returns decisions but never signs or broadcasts the customer’s trade or treasury action.</li>
          </ul>
        </section>

        <section id="contracts">
          <span className="docs-index">13 / TESTNET ADDRESSES</span>
          <h2>Deployment reference</h2>
          <table className="docs-table"><tbody>
            <tr><th>Control contract and treasury</th><td><code>0x42eB87cb7d1bb5A83cE15b4f2a34e1722Bd43f4b</code></td></tr>
            <tr><th>Base Sepolia USDC</th><td><code>0x036CbD53842c5426634e7929541eC2318f3dCF7e</code></td></tr>
            <tr><th>Platform reporter</th><td><code>0x4a53cFB1CCFf805246C28aBd1Ec56F8B56F4D08E</code></td></tr>
            <tr><th>Admin</th><td><code>0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E</code></td></tr>
            <tr><th>GenLayer compact judge</th><td><code>0x2C0ab7014617160149707653eE0Faff578e29C88</code></td></tr>
            <tr><th>Payment network</th><td><code>eip155:84532</code></td></tr>
          </tbody></table>
          <div className="docs-callout warning"><b>Testnet only</b><p>This deployment supports Base Sepolia only while payment, provider, refund, and consensus behavior are validated. Testnet assets have no production value.</p></div>
        </section>
      </article>
    </div>
  </main>;
}
