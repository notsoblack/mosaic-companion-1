// =============================================================================
// ANFE DISCOVERY SERVICE — Thin wrapper around existing ANFEService
// =============================================================================

import { type ANFEAsset } from "../../stores/stargateStore";
import HyperCycleNodeManagerClient from "./HyperCycleNodeManagerClient";

export interface ANFEResult {
  anfes: ANFEAsset[];
  sources: { nodeManager: number; web3: number };
  wallets: { nodeManager?: string; web3?: string };
}

/** Extract level from ANFE attributes */
function extractLevel(anfe: any): number {
  // Try attributes.core.level first
  const levelAttr = anfe.attributes?.core?.level;
  if (levelAttr?.value !== undefined) return Number(levelAttr.value);
  // Try direct level field
  if (anfe.level !== undefined) return Number(anfe.level);
  return 10; // Default
}

/** Extract status from ANFE */
function extractStatus(anfe: any): string {
  // Check if delegated
  if (anfe.delegatedTo || (anfe as any).delegatedTo) {
    return `Delegated → ${anfe.delegatedTo || (anfe as any).delegatedTo}`;
  }
  return anfe.status || "Owned";
}

/** Convert ANFEService result to our ANFEAsset format */
function convertANFE(anfe: any, source: "node-manager" | "web3", wallet: string): ANFEAsset {
  return {
    id: String(anfe.tokenId || anfe.id || "unknown"),
    source,
    level: extractLevel(anfe),
    name: anfe.name || anfe.metadata?.name || `ANFE #${anfe.tokenId}`,
    status: extractStatus(anfe),
    ownerAddress: wallet,
    chain: anfe.chainName === "Base" ? "base" : (anfe.chain || "ethereum"),
    delegatedTo: (anfe as any).delegatedTo || undefined,
    image: anfe.metadata?.image || (anfe as any).image || undefined,
  };
}

/** Discover ALL ANFEs from both sources */
export async function discoverAllANFEs(): Promise<ANFEResult> {
  const nodeManagerANFEs: ANFEAsset[] = [];
  const web3ANFEs: ANFEAsset[] = [];
  let nodeWallet: string | undefined;
  let web3Wallet: string | undefined;

  // ── Source 1: Node Manager wallet ──
  try {
    const client = new HyperCycleNodeManagerClient();
    const status = await client.getStatus();
    if (status?.address?.startsWith("0x")) {
      nodeWallet = status.address;
      console.log(`[ANFEDiscovery] Node Manager wallet: ${nodeWallet.slice(0, 12)}...`);

      const { default: anfeService } = await import("../StargatePool/ANFEService");
      const result = await anfeService.loadWalletANFEs(nodeWallet);

      if (result.anfes?.length) {
        for (const anfe of result.anfes) {
          nodeManagerANFEs.push(convertANFE(anfe, "node-manager", nodeWallet));
        }
      }
      console.log(`[ANFEDiscovery] Node Manager: ${nodeManagerANFEs.length} ANFEs`);
    }
  } catch (e: any) {
    console.warn("[ANFEDiscovery] Node Manager discovery failed:", e?.message || e);
  }

  // ── Source 2: Web3 wallet ──
  try {
    const web3Api = (window as any).electronAPI?.web3;
    if (web3Api?.getAddress) {
      const addrResult = await web3Api.getAddress();
      const walletAddress = addrResult?.data?.address;
      if (walletAddress && typeof walletAddress === "string" && walletAddress.startsWith("0x")) {
        web3Wallet = walletAddress;
        console.log(`[ANFEDiscovery] Web3 wallet: ${web3Wallet.slice(0, 12)}...`);

        // Only scan Web3 if different from Node Manager wallet
        if (web3Wallet.toLowerCase() !== nodeWallet?.toLowerCase()) {
          const { default: anfeService } = await import("../StargatePool/ANFEService");
          const result = await anfeService.loadWalletANFEs(web3Wallet);

          if (result.anfes?.length) {
            for (const anfe of result.anfes) {
              web3ANFEs.push(convertANFE(anfe, "web3", web3Wallet));
            }
          }
          console.log(`[ANFEDiscovery] Web3: ${web3ANFEs.length} ANFEs`);
        } else {
          console.log("[ANFEDiscovery] Web3 wallet same as Node Manager — skipping duplicate scan");
        }
      }
    }
  } catch (e: any) {
    console.warn("[ANFEDiscovery] Web3 discovery failed:", e?.message || e);
  }

  const anfes = [...nodeManagerANFEs, ...web3ANFEs];

  return {
    anfes,
    sources: {
      nodeManager: nodeManagerANFEs.length,
      web3: web3ANFEs.length,
    },
    wallets: {
      nodeManager: nodeWallet,
      web3: web3Wallet,
    },
  };
}
