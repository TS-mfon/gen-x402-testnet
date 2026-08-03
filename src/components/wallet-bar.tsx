"use client";
import { useWallet } from "@/components/wallet-context";
export function WalletBar() {
  const { address, connect, connecting, error } = useWallet();
  return <div className="wallet-zone">
    {error && <span className="wallet-error">{error}</span>}
    <span className="network-select">BASE SEPOLIA</span>
    {address ? <span className="wallet-address"><i /> {address.slice(0, 6)}…{address.slice(-4)}</span> : <button className="tech-button" onClick={() => void connect()} disabled={connecting}>{connecting ? "CONNECTING" : "CONNECT WALLET"}</button>}
  </div>;
}
