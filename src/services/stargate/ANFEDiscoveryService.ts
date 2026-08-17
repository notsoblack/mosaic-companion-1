// =============================================================================
// ANFE DISCOVERY SERVICE — Discovers ANFEs from BOTH Node Manager + Web3
// Sources:
//   1. Node Manager (localhost:8000 /api/licenses) — wallet 0xfde...54309, 3 ANFEs
//   2. Web3 (Base Sepolia) — wallet 0x481...913484, potentially more ANFEs
// Both sources feed into unified ANFEAsset[] in stargateStore
// =============================================================================

import { type ANFEAsset } from "../../stores/stargateStore";
import HyperCycleNodeManagerClient from "./HyperCycleNodeManagerClient";

/**
 * Discover ANFEs from Node Manager localhost:8000
 * Returns ANFEs associated with the Node Manager wallet
 */
async function discoverFromNodeManager(): Promise<ANFEAsset[]> {
  const results: ANFEAsset[] = [];
  try {
    const client = new HyperCycleNodeManagerClient();
    const status = await client.getStatus();
    if (!status) {
      console.log("[ANFEDiscovery] Node Manager offline");
      return results;
    }

    // Fetch ALL licenses (no owner filter) — Node Manager returns its own licenses
    const licenses = await client.getLicenses();
    if (!licenses.length) {
      console.log("[ANFEDiscovery] Node Manager: 0 licenses found");
      return results;
    }

    // Derive owner wallet from first license, or fallback to status.address
    const nodeWallet = licenses[0]?.owner || licenses[0]?.ownerAddress || licenses[0]?.wallet || status.address || "unknown";

    for (const lic of licenses) {
      const id = String(lic.tokenId || lic.licenseId || lic.id || "unknown");
      results.push({
        id,
        source: "node-manager",
        level: Number(lic.level || lic.anfeLevel || lic.metadata?.level || 1),
        name: lic.name || lic.metadata?.name || `ANFE #${id}`,
        status: lic.delegatedTo || lic.delegated || lic.metadata?.delegatedTo
          ? `Delegated → ${lic.delegatedTo || lic.delegated || lic.metadata?.delegatedTo}`
          : (lic.status || "Owned"),
        ownerAddress: lic.owner || lic.ownerAddress || lic.wallet || nodeWallet,
        chain: "mainnet",
        delegatedTo: lic.delegatedTo || lic.delegated,
        image: lic.image || lic.metadata?.image,
      });
    }

    console.log(`[ANFEDiscovery] Node Manager: ${results.length} ANFEs from wallet ${nodeWallet.slice(0, 10)}...`);
  } catch (e: any) {
    console.warn("[ANFEDiscovery] Node Manager discovery failed:", e.message || e);
  }
  return results;
}

/**
 * Discover ANFEs from Web3 wallet (Mosaic Companion)
 * Uses HyperCycleAssetDiscovery for Base Sepolia scanning
 */
async function discoverFromWeb3(): Promise<ANFEAsset[]> {
  const results: ANFEAsset[] = [];
  try {
    const web3Api = (window as any).electronAPI?.web3;
    if (!web3Api?.getAddress) return results;

    const addrResult = await web3Api.getAddress();
    const walletAddress = addrResult?.data?.address;
    if (!walletAddress || typeof walletAddress !== "string") return results;

    // Import asset discovery dynamically (it uses ethers)
    const { default: assetDiscovery } = await import(
      "../../services/StargatePool/HyperCycleAssetDiscovery"
    );

    // Scan Base chain
    const baseAssets = await assetDiscovery.discover(walletAddress, "base");
    const anfeTokens = baseAssets.assets?.filter(
      (a: any) => a.contract?.toLowerCase().includes("anfe") || a.symbol === "ANFE" || a.category === "license"
    ) || [];

    for (const token of anfeTokens) {
      results.push({
        id: String(token.tokenId || token.id || "unknown"),
        source: "web3",
        level: Number((token as any).level || (token as any).traits?.level || 1),
        name: token.name || "ANFE",
        status: "Owned",
        ownerAddress: walletAddress,
        chain: "base",
        image: (token as any).image,
      });
    }

    console.log(`[ANFEDiscovery] Web3: ${results.length} ANFEs from ${walletAddress.slice(0, 8)}...`);
  } catch (e: any) {
    console.warn("[ANFEDiscovery] Web3 discovery failed:", e.message || e);
  }
  return results;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface ANFEResult {
  anfes: ANFEAsset[];
  sources: { nodeManager: number; web3: number };
  wallets: { nodeManager?: string; web3?: string };
}

/** Discover ALL ANFEs from both sources */
export async function discoverAllANFEs(): Promise<ANFEResult> {
  const [nodeManagerANFEs, web3ANFEs] = await Promise.all([
    discoverFromNodeManager(),
    discoverFromWeb3(),
  ]);

  const anfes = [...nodeManagerANFEs, ...web3ANFEs];

  return {
    anfes,
    sources: {
      nodeManager: nodeManagerANFEs.length,
      web3: web3ANFEs.length,
    },
    wallets: {
      nodeManager: nodeManagerANFEs[0]?.ownerAddress,
      web3: web3ANFEs[0]?.ownerAddress,
    },
  };
}
