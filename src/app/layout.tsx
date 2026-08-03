import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/components/wallet-context";
import { WalletBar } from "@/components/wallet-bar";
import { ThermalField } from "@/components/thermal-field";
import "@fontsource/bodoni-moda/700.css";
import "@fontsource/bodoni-moda/400-italic.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/chivo/400.css";

export const metadata: Metadata = { title: "Gen-X402 Testnet", description: "Base Sepolia validation environment for GenLayer and x402 intelligence." };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><ThermalField /><WalletProvider><div className="shell"><nav className="nav"><Link className="brand" href="/"><small>GEN-X402</small><span>TESTNET</span></Link><div className="navlinks"><Link href="/gateway">GATEWAY</Link><Link href="/investigate">INVESTIGATE</Link><Link href="/procure">PROCURE</Link><Link href="/decide">DECIDE</Link><Link href="/quality">QUALITY</Link><Link href="/providers">REGISTRY</Link><Link href="/docs">DOCS</Link></div><WalletBar /></nav>{children}<footer className="footer">GEN-X402 TESTNET · BASE SEPOLIA USDC · GENLAYER STUDIONET · SERVERLESS VALIDATION</footer></div></WalletProvider></body></html>;
}
