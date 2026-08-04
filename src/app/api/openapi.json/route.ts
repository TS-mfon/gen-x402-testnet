import { NextResponse } from "next/server";

const error = {
  description: "Structured API error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};

const requestProperties = {
  task: { type: "string", minLength: 10, maxLength: 4000 },
  subject: {
    type: "object",
    additionalProperties: false,
    properties: {
      chainId: { type: "string", maxLength: 64, example: "eip155:84532" },
      address: { type: "string", maxLength: 128 },
      url: { type: "string", format: "uri", maxLength: 2048 },
      repository: { type: "string", maxLength: 2048 },
    },
  },
  context: { type: "object", additionalProperties: true },
  acceptanceCriteria: { type: "array", maxItems: 20, items: { type: "string", minLength: 3, maxLength: 500 } },
  riskLevel: { type: "string", enum: ["low", "medium", "high"], default: "medium" },
  requestedPlan: { type: "string", enum: ["quick", "standard", "deep", "quality"] },
  clientRequestId: { type: "string", minLength: 8, maxLength: 128 },
  callbackUrl: { type: "string", format: "uri", maxLength: 2048 },
};

const intelligenceRequest = {
  type: "object",
  required: ["task", "clientRequestId"],
  additionalProperties: false,
  properties: requestProperties,
};

function paidPath(summary: string) {
  return {
    post: {
      tags: ["Paid decisions"],
      summary,
      parameters: [
        { $ref: "#/components/parameters/QuoteIdQuery" },
        { $ref: "#/components/parameters/QuoteIdHeader" },
        { $ref: "#/components/parameters/ClientType" },
        { $ref: "#/components/parameters/ApiKey" },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/IntelligenceRequest" } } },
      },
      responses: {
        "202": { description: "Job accepted after settlement", content: { "application/json": { schema: { $ref: "#/components/schemas/JobAccepted" } } } },
        "402": { description: "x402 Payment Required challenge" },
        "401": error,
        "404": error,
        "409": error,
        "422": error,
        "428": error,
        "503": error,
      },
    },
  };
}

const document = {
  openapi: "3.1.0",
  info: {
    title: "Gen-X402 Testnet API",
    version: "1.0.0-testnet",
    description: "Quote-first, x402-paid, two-provider intelligence with GenLayer consensus on Base Sepolia.",
  },
  servers: [{ url: "https://gen-x402-testnet.vercel.app", description: "Base Sepolia validation deployment" }],
  tags: [
    { name: "Quotes" },
    { name: "Paid decisions" },
    { name: "Jobs" },
    { name: "API keys" },
    { name: "Providers" },
  ],
  paths: {
    "/api/v1/quote": {
      post: {
        tags: ["Quotes"],
        summary: "Simulate provider routing and calculate an exact price",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/QuoteRequest" } } } },
        responses: {
          "200": { description: "Frozen 15-minute quote", content: { "application/json": { schema: { $ref: "#/components/schemas/QuoteResponse" } } } },
          "400": error,
          "422": error,
          "503": error,
        },
      },
    },
    "/api/v1/gateway": paidPath("Purchase routed intelligence"),
    "/api/v1/investigate": paidPath("Purchase a crypto investigation"),
    "/api/v1/procure": paidPath("Purchase provider procurement analysis"),
    "/api/v1/decide": paidPath("Purchase a machine-readable decision"),
    "/api/v1/quality-check": paidPath("Purchase an agent output quality review"),
    "/api/v1/jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "Poll job, provider evidence, GenLayer execution, and verdict",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Current job snapshot", content: { "application/json": { schema: { $ref: "#/components/schemas/JobResult" } } } },
          "404": error,
        },
      },
    },
    "/api/v1/providers": {
      get: { tags: ["Providers"], summary: "List configured and discovered providers", responses: { "200": { description: "Provider registry" } } },
    },
    "/api/v1/keys/challenge": {
      get: { tags: ["API keys"], summary: "Create a five-minute walletless-agent proof-of-work challenge", responses: { "200": { description: "Challenge and difficulty" }, "503": error } },
    },
    "/api/v1/keys": {
      post: {
        tags: ["API keys"],
        summary: "Issue a key and register its hash on Base Sepolia",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/KeyEnrollment" } } } },
        responses: {
          "201": { description: "One-time API key response", content: { "application/json": { schema: { $ref: "#/components/schemas/IssuedKey" } } } },
          "400": error,
          "403": error,
          "422": error,
          "503": error,
        },
      },
    },
    "/api/v1/keys/verify": {
      get: {
        tags: ["API keys"],
        summary: "Verify a key without making a paid request",
        parameters: [{ $ref: "#/components/parameters/ApiKey" }],
        responses: { "200": { description: "Active key metadata" }, "401": error, "503": error },
      },
    },
  },
  components: {
    parameters: {
      QuoteIdQuery: { name: "quoteId", in: "query", schema: { type: "string", format: "uuid" } },
      QuoteIdHeader: { name: "X-Quote-Id", in: "header", schema: { type: "string", format: "uuid" } },
      ClientType: { name: "X-Client-Type", in: "header", schema: { type: "string", enum: ["agent"] } },
      ApiKey: { name: "X-API-Key", in: "header", required: true, schema: { type: "string" } },
    },
    schemas: {
      IntelligenceRequest: intelligenceRequest,
      QuoteRequest: { ...intelligenceRequest, required: ["task"] },
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" }, message: { type: "string" }, issues: { type: "object" } },
      },
      QuoteResponse: {
        type: "object",
        properties: { quote: { type: "object" }, payment: { type: "object" }, allocation: { type: "object" } },
      },
      JobAccepted: {
        type: "object",
        properties: {
          jobId: { type: "string", format: "uuid" },
          status: { type: "string" },
          product: { type: "string" },
          plan: { type: "string" },
          paid: { type: "boolean" },
          pollUrl: { type: "string" },
          duplicate: { type: "boolean" },
        },
      },
      JobResult: {
        type: "object",
        properties: {
          job: { type: "object" },
          evidence: { type: ["object", "null"] },
          execution: { type: ["object", "null"] },
          verdict: { type: ["object", "null"] },
        },
      },
      KeyEnrollment: {
        oneOf: [
          { type: "object", required: ["mode", "owner"], properties: { mode: { const: "wallet" }, owner: { type: "string", minLength: 8 } } },
          { type: "object", required: ["mode", "agentPublicKey", "challenge", "nonce"], properties: { mode: { const: "agent" }, agentPublicKey: { type: "string", minLength: 8 }, challenge: { type: "string" }, nonce: { type: "string" } } },
        ],
      },
      IssuedKey: {
        type: "object",
        properties: {
          keyId: { type: "string", format: "uuid" },
          secret: { type: "string", writeOnly: true },
          apiKey: { type: "string", writeOnly: true },
          owner: { type: "string" },
          scopes: { type: "array", items: { type: "string" } },
          rateLimitPerMinute: { type: "integer" },
          expiresAt: { type: "string", format: "date-time" },
          transaction: { type: "string" },
        },
      },
    },
  },
};

export function GET() {
  return NextResponse.json(document, { headers: { "cache-control": "public, max-age=300" } });
}
