"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { getTypesForEIP712Domain, serializeTypedData } from "viem";

type NetworkChoice = "testnet";
type EthereumProvider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
declare global { interface Window { ethereum?: EthereumProvider } }
type WalletState = {
  address: string;
  network: NetworkChoice;
  connecting: boolean;
  error: string;
  connect: (requestedNetwork?: NetworkChoice) => Promise<boolean>;
  setNetwork: (network: NetworkChoice) => Promise<void>;
  paidFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};
const WalletContext = createContext<WalletState | null>(null);
const chainIds: Record<NetworkChoice, string> = { testnet: "0x14a34" };
const x402Networks: Record<NetworkChoice, `eip155:${number}`> = { testnet: "eip155:84532" };

function injectedSigner(address: string) {
  return {
    address: address as `0x${string}`,
    signTypedData: async ({ domain, types, primaryType, message }: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) => {
      if (!window.ethereum) throw new Error("Wallet provider unavailable");
      const typedData = serializeTypedData({
        domain,
        message,
        primaryType,
        types: {
          EIP712Domain: getTypesForEIP712Domain({ domain }),
          ...types,
        } as any,
      });
      return await window.ethereum.request({ method: "eth_signTypedData_v4", params: [address, typedData] }) as `0x${string}`;
    }
  };
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState("");
  const [network, setNetworkState] = useState<NetworkChoice>("testnet");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const switchNetwork = async (requestedNetwork: NetworkChoice) => {
    if (!window.ethereum) throw new Error("Install MetaMask or another EVM wallet");
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIds[requestedNetwork] }] });
    } catch (caught: any) {
      if (caught?.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: chainIds.testnet, chainName: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia.base.org"], blockExplorerUrls: ["https://sepolia.basescan.org"] }] });
      } else throw caught;
    }
    setNetworkState(requestedNetwork);
  };
  const connect = async (requestedNetwork = network) => {
    setConnecting(true); setError("");
    try {
      if (!window.ethereum) throw new Error("Install MetaMask or another EVM wallet");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts[0]) throw new Error("No account selected");
      await switchNetwork(requestedNetwork);
      setAddress(accounts[0]);
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Wallet connection failed"); return false; }
    finally { setConnecting(false); }
  };
  const setNetwork = async (requestedNetwork: NetworkChoice) => {
    setError("");
    try { await switchNetwork(requestedNetwork); } catch (caught) { setError(caught instanceof Error ? caught.message : "Network switch failed"); }
  };
  const paidFetch = useMemo(() => {
    if (!address) return async () => { throw new Error("Connect a wallet first"); };
    const client = new x402Client().register(x402Networks[network], new ExactEvmScheme(injectedSigner(address)));
    return wrapFetchWithPayment(fetch, client);
  }, [address, network]);
  return <WalletContext.Provider value={{ address, network, connecting, error, connect, setNetwork, paidFetch }}>{children}</WalletContext.Provider>;
}
export function useWallet() { const context = useContext(WalletContext); if (!context) throw new Error("WalletProvider is missing"); return context; }
