import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }
  },
  outputFileTracingIncludes: {
    "/*": ["./contracts/genlayer/**/*.py", "./db/**/*.sql"]
  }
};

export default nextConfig;
