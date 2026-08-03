export const testnetCatalog = [
  {
    "id": "cdp-1",
    "name": "Run402 prototype tier",
    "endpoint": "https://api.run402.com/tiers/v1/prototype",
    "method": "POST",
    "category": "agent-access",
    "description": "Set prototype tier ($0.10 USDC) — auto-detects subscribe/renew/upgrade",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "100000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x059D091D51a0f011c9872EaA63Df538F5cE15945",
    "test_enabled": true,
    "fixture": {
      "body": {
        "action": "subscribe",
        "tier": "prototype"
      }
    }
  },
  {
    "id": "cdp-2",
    "name": "Weather demo",
    "endpoint": "https://wallets-demo-seller-server.calebgcarithers.workers.dev/weather",
    "method": "GET",
    "category": "utility",
    "description": "Real-time current weather conditions for a city or location, including temperature, humidity, precipitation, wind, and a human-readable condition.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "1000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x18F33CEf45817C428d98C4E188A770191fDD4B79",
    "test_enabled": true,
    "fixture": {
      "query": {
        "city": "Lagos"
      }
    }
  },
  {
    "id": "cdp-3",
    "name": "Payment for Quicknode RPC access. Options: per-request ($0.001/request), nanopayment ($0.0",
    "endpoint": "https://x402.quicknode.com/base-mainnet",
    "method": "POST",
    "category": "discovered",
    "description": "Payment for Quicknode RPC access. Options: per-request ($0.001/request), nanopayment ($0.0001/request via Circle Gateway), or credit drawdown with SIWX authentication.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "1000000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xF46394adDdA95A3d5bCC1124605E3d15D204623C",
    "test_enabled": false,
    "fixture": {
      "body": {}
    }
  },
  {
    "id": "cdp-4",
    "name": "Node4All x402 smoke test",
    "endpoint": "https://sandbox.node4all.com/v1/x402-test",
    "method": "GET",
    "category": "protocol-smoke",
    "description": "Node4All Fortune — deterministic fortune reading derived from the x402 payment authorization nonce. Flagship demo of the Node4All x402 v2 payment flow. Operator: Node4All (https://node4all.com). Currency: USDC on Base.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "2000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xd275612Bf0BB35638432c4D95eAA8D5d22346Ca6",
    "test_enabled": true,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-5",
    "name": "Payment for Quicknode RPC access. Options: per-request ($0.001/request), nanopayment ($0.0",
    "endpoint": "https://x402.quicknode.com/solana-mainnet",
    "method": "POST",
    "category": "discovered",
    "description": "Payment for Quicknode RPC access. Options: per-request ($0.001/request), nanopayment ($0.0001/request via Circle Gateway), or credit drawdown with SIWX authentication.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "1000000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xF46394adDdA95A3d5bCC1124605E3d15D204623C",
    "test_enabled": false,
    "fixture": {
      "body": {}
    }
  },
  {
    "id": "cdp-6",
    "name": "AIAPI financial signals",
    "endpoint": "https://demo.aiapi.ch/v1/analyze",
    "method": "POST",
    "category": "market-risk",
    "description": "Financial Signal Intelligence for autonomous agents across crypto, stocks, ETFs, macro and global financial markets. Analyze financial news, market rumors, earnings announcements, central bank decisions, regulatory actions, exchange incidents, security events, stablecoins, macroeconomic events, fraud detection signals and market-moving developments to score financial risk, credibility and actionability.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "10000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x64842Cd797198143A8fF191E4BDBDE7E0fBF7f6D",
    "test_enabled": true,
    "fixture": {
      "body": {
        "query": "Base Sepolia USDC and crypto market risk",
        "text": "Base Sepolia x402 testnet protocol health"
      }
    }
  },
  {
    "id": "cdp-7",
    "name": "Paginated library list. Filter with ?kind= (video|audio|image|gif|asset|source|stock), ?so",
    "endpoint": "https://api-dev.cueframe.ai/v1/media",
    "method": "GET",
    "category": "discovered",
    "description": "Paginated library list. Filter with ?kind= (video|audio|image|gif|asset|source|stock), ?source= (upload|generated|import-url|stock), ?tag= (exact tag) so a real library isn't an undifferentiated soup.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "10000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x82134912Ccc71610DA9350Ff59CD279fAD494A98",
    "test_enabled": false,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-8",
    "name": "OFAC entity screening",
    "endpoint": "https://induction.aarei.ai/services/ofacs/check/entity",
    "method": "GET",
    "category": "compliance",
    "description": "Screen an entity or alias name against the OFAC SDN list. Exact match on a normalised string only (trim, collapse whitespace, NFC, casefold). Returns 503 if the list has never loaded (deny-on-error policy).",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "20000",
    "network": "eip155:84532",
    "asset": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    "payTo": "0xbb3b7b9b1053ebc0c763fa1a8f09f4af5978612c",
    "test_enabled": true,
    "fixture": {
      "query": {
        "entity": "GenLayer"
      }
    }
  },
  {
    "id": "cdp-9",
    "name": "OmniTerminal market risk",
    "endpoint": "https://omniterminal.app/api/x402/v1/market-risk/:symbol",
    "method": "GET",
    "category": "market-risk",
    "description": "Assess one Hyperliquid market before entering, sizing, or reducing a position using all published mark-anchored liquidation levels, explicit flow direction, margin stress, current funding/carry, and enriched AI news.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "3000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x733f40A4FA0cd13d59aBADE04b9eD2e9acAc6457",
    "test_enabled": true,
    "fixture": {
      "path": {
        "symbol": "BTC"
      }
    }
  },
  {
    "id": "cdp-10",
    "name": "BAGS Agent API index ",
    "endpoint": "https://www.getbags.app/api/v1",
    "method": "GET",
    "category": "discovered",
    "description": "BAGS Agent API index — machine-readable directory of the agentic payment API, MCP server, and x402 payment surface.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "10000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x374cFb844a5C702d637d72a5387fD9EF6B82108C",
    "test_enabled": false,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-11",
    "name": "Agentic Insights validation",
    "endpoint": "https://preview.agenticinsights.com/api/x402/agentic-market/validate",
    "method": "GET",
    "category": "agent-evaluation",
    "description": "One-cent Base Sepolia x402 demo with Bazaar discovery and a durable operational receipt.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "10000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x355e413514dBE87b335B765e1EE5c947Db8a941B",
    "test_enabled": true,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-12",
    "name": "Tollbooth x402 smoke test",
    "endpoint": "https://tollbooth-hello-testnet.sjwilliams8.workers.dev/hello",
    "method": "GET",
    "category": "protocol-smoke",
    "description": "Test endpoint for verifying x402 payment integration end to end. Returns a static greeting in the Agent Tollbooth standard response envelope. Not a data product — use it to smoke-test your x402 client for $0.001 before calling our compliance endpoints.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "1000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xb3e7993Ed2FC2C79FFF220620240f298BBa9bF5B",
    "test_enabled": true,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-13",
    "name": "Verdoc repository analysis",
    "endpoint": "https://verdoc-x402.verdoc-x402-worker.workers.dev/scan",
    "method": "GET",
    "category": "developer-risk",
    "description": "Deterministic analysis of a public GitHub repository. Returns layout, language breakdown, toolchain commands with their source manifest, test and CI presence, a 0-100 documentation-health score, and phantom_paths (file paths the README cites that do not exist). No language model is used, so results are reproducible for a given commit.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "10000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x0A801E236fbc1a95a35ab8E946837320DDCE9d69",
    "test_enabled": true,
    "fixture": {
      "query": {
        "repo": "https://github.com/TS-mfon/gen-x402-provider"
      }
    }
  },
  {
    "id": "cdp-14",
    "name": "Get a sourced, versioned medical procedure price corridor with an Ed25519 evidence receipt",
    "endpoint": "https://agent-fact-receipts-staging.131313122.workers.dev/v1/price-corridor",
    "method": "GET",
    "category": "discovered",
    "description": "Get a sourced, versioned medical procedure price corridor with an Ed25519 evidence receipt.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "10000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xa6Ba813893B8D9c701Ad5e0884d213195a3f30e7",
    "test_enabled": false,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-15",
    "name": "Real-time current weather conditions for a city or location, including temperature, humidi",
    "endpoint": "https://wallets-demo-seller-server.agent-payments-testing.workers.dev/weather",
    "method": "GET",
    "category": "discovered",
    "description": "Real-time current weather conditions for a city or location, including temperature, humidity, precipitation, wind, and a human-readable condition.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "1000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xCBd4E4218B2Cd8300f1bd07b9B4B720fAb6B51B3",
    "test_enabled": false,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-16",
    "name": "Fetch a compact agent-safe projection generated from live or cached Companies House data: ",
    "endpoint": "https://incorpsignal.com/x402/v1/trends",
    "method": "GET",
    "category": "discovered",
    "description": "Fetch a compact agent-safe projection generated from live or cached Companies House data: UK incorporation trends, sector and SIC clusters, postcode hotspots, founder/director signals, persona opportunities, and action queues.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "3000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x733f40A4FA0cd13d59aBADE04b9eD2e9acAc6457",
    "test_enabled": false,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-17",
    "name": "Fetch a live UK Companies House company dossier with registered details, SIC sectors, fili",
    "endpoint": "https://incorpsignal.com/x402/v1/companies/:company_number",
    "method": "GET",
    "category": "discovered",
    "description": "Fetch a live UK Companies House company dossier with registered details, SIC sectors, filings, officers, persons with significant control, founder graph, compliance status, risk flags, and persona-ranked opportunity evidence.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "2000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x733f40A4FA0cd13d59aBADE04b9eD2e9acAc6457",
    "test_enabled": false,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-18",
    "name": "Search official UK Companies House company data by name, number, SIC, geography, status, f",
    "endpoint": "https://incorpsignal.com/x402/v1/search",
    "method": "GET",
    "category": "discovered",
    "description": "Search official UK Companies House company data by name, number, SIC, geography, status, founder/team signal, or natural-language intent. Returns bounded persona-ranked incorporation, sector, compliance, and risk fields for agent research and prospecting.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "1000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x733f40A4FA0cd13d59aBADE04b9eD2e9acAc6457",
    "test_enabled": false,
    "fixture": {
      "query": {}
    }
  },
  {
    "id": "cdp-19",
    "name": "Epanya schema search",
    "endpoint": "https://api.epanya.ai/v1/search",
    "method": "POST",
    "category": "web-research",
    "description": "Schema-validated web search for AI agents. Multi-provider failover; no schema-valid result, no charge (settle-after-validation). TESTNET: Base Sepolia USDC only — amounts have no monetary value. Live stats with on-chain proofs: https://epanya.ai",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "10000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xa19d57a77759A78cB76A736251Ef7bdFFA515256",
    "test_enabled": true,
    "fixture": {
      "body": {
        "query": "What is x402 on Base Sepolia?",
        "max_results": 3
      }
    }
  },
  {
    "id": "cdp-20",
    "name": "Stablecoin bridge flows",
    "endpoint": "https://x402-stablecoin-data-demo.ryan-ee4.workers.dev/v1/reports/stablecoin-bridge-flows",
    "method": "GET",
    "category": "stablecoin-risk",
    "description": "Retrieve a seven-day USD-denominated report of Tether bridge flows on Ethereum. This is a bounded onchain stablecoin intelligence product backed by The Tie's data API.",
    "approval_status": "discovery_only",
    "quality_score": 50,
    "availability_score": 50,
    "price_atomic": "10000",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x2172735a5B8907cDD5ee56c3472EB21E13C95fa9",
    "test_enabled": true,
    "fixture": {
      "query": {}
    }
  }
] as const;
