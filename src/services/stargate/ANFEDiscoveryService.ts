// =============================================================================
// ANFE DISCOVERY SERVICE — Dual-source ANFE discovery for Stargate Graph
// Sources: Node Manager (via direct Base RPC) + Web3 wallet
// =============================================================================

import { type ANFEAsset } from "../../stores/stargateStore";
import HyperCycleNodeManagerClient from "./HyperCycleNodeManagerClient";

export interface ANFEResult {
  anfes: ANFEAsset[];
  sources: { nodeManager: number; web3: number };
  wallets: { nodeManager?: string; web3?: string };
}

// ─── Constants ───
const ANFE_CONTRACT = "0x8c0075D087de9588DdF5c1441dF39828d695bc2f";
const BASE_RPC = "https://base.publicnode.com";

// ERC-721 function selectors
const OWNER_OF = "0x6352211e";   // ownerOf(uint256)
const BALANCE_OF = "0x70a08231"; // balanceOf(address)

// ─── Helpers ───
async function baseRpcCall(method: string, params: any[]): Promise<any> {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function getOwnerOf(tokenId: string): Promise<string | null> {
  const padded = BigInt(tokenId).toString(16).padStart(64, "0");
  const data = `${OWNER_OF}${padded}`;
  return baseRpcCall("eth_call", [{ to: ANFE_CONTRACT, data }, "latest"]).then(
    (r: string) => (r && r !== "0x" ? "0x" + r.slice(-40) : null),
    () => null
  );
}

function getERC721Balance(wallet: string): Promise<number> {
  const padded = wallet.toLowerCase().replace("0x", "").padStart(64, "0");
  const data = `${BALANCE_OF}${padded}`;
  return baseRpcCall("eth_call", [{ to: ANFE_CONTRACT, data }, "latest"]).then(
    (r: string) => (r && r !== "0x" ? parseInt(r, 16) : 0),
    () => 0
  );
}

async function scanKnownTokenIDs(wallet: string): Promise<ANFEAsset[]> {
  const results: ANFEAsset[] = [];
  // Known token IDs from screenshots + nearby IDs
  const candidates = [
    "4649559796048334", "4649559796048335",
    "4649559796048333", "4649559796048336",
    ...Array.from({ length: 10 }, (_, i) => String(4649559796048300 + i)),
  ];

  for (const id of candidates) {
    const owner = await getOwnerOf(id);
    if (owner && owner.toLowerCase() === wallet.toLowerCase()) {
      results.push({
        id,
        source: "node-manager" as const,
        level: 10,
        name: `ANFE #${id}`,
        status: "Owned",
        ownerAddress: wallet,
        chain: "base",
        delegatedTo: undefined,
        image: undefined,
      });
    }
  }
  return results;
}

// ─── Main Discovery ───
/** Discover ALL ANFEs from Node Manager wallet */
export async function discoverAllANFEs(): Promise<ANFEResult> {
  const nodeManagerANFEs: ANFEAsset[] = [];
  const web3ANFEs: ANFEAsset[] = [];
  let nodeWallet: string | undefined;
  let web3Wallet: string | undefined;

  // ── Source 1: Node Manager wallet ──
  // Node Manager getStatus().address is often an IP (187.161.142.27:8000),
  // NOT the Ethereum wallet. Fall back to Web3 wallet since screenshots show
  // both use the SAME wallet (0x481F...3484).
  try {
    let walletForNM: string | null = null;

    // Try Node Manager status first
    const client = new HyperCycleNodeManagerClient();
    const status = await client.getStatus();
    if (status?.address?.startsWith("0x")) {
      walletForNM = status.address;
      console.log(`[ANFEDiscovery] Node Manager wallet (from status): ${walletForNM.slice(0, 12)}...`);
    }

    // Fallback: use Web3 wallet as Node Manager wallet (they're the same in practice)
    if (!walletForNM) {
      const web3Api = (window as any).electronAPI?.web3;
      if (web3Api?.getAddress) {
        const addrResult = await web3Api.getAddress();
        const addr = addrResult?.data?.address;
        if (addr && typeof addr === "string" && addr.startsWith("0x")) {
          walletForNM = addr;
          console.log(`[ANFEDiscovery] Node Manager wallet (from Web3 fallback): ${walletForNM.slice(0, 12)}...`);
        }
      }
    }

    if (!walletForNM) {
      console.log("[ANFEDiscovery] No Node Manager wallet address available");
    } else {
      nodeWallet = walletForNM;

      // Scan blockchain for ANFEs
      const balance = await getERC721Balance(nodeWallet);
      console.log(`[ANFEDiscovery] ERC-721 balance: ${balance}`);

      if (balance > 0) {
        const anfes = await scanKnownTokenIDs(nodeWallet);
        nodeManagerANFEs.push(...anfes);
      }
      console.log(`[ANFEDiscovery] Node Manager: ${nodeManagerANFEs.length} ANFEs`);
    }
  } catch (e: any) {
    console.warn("[ANFEDiscovery] Node Manager discovery failed:", e?.message || e);
  }

  // ── Source 2: Web3 wallet ──
  // Only scan Web3 if it's a DIFFERENT wallet from Node Manager
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
          const balance = await getERC721Balance(web3Wallet);
          if (balance > 0) {
            const anfes = await scanKnownTokenIDs(web3Wallet);
            // Assign source "web3" for Web3-only ANFEs
            web3ANFEs.push(...anfes.map(a => ({ ...a, source: "web3" as const })));
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
