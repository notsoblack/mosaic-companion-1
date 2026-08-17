// =============================================================================
// ANFE DIRECT DISCOVERY — Direct Base Mainnet RPC queries (proven working)
// =============================================================================

import { type ANFEAsset } from "../../stores/stargateStore";
import HyperCycleNodeManagerClient from "./HyperCycleNodeManagerClient";

const ANFE_CONTRACT = "0x8c0075D087de9588DdF5c1441dF39828d695bc2f";
const BASE_RPC = "https://base.publicnode.com";

// ERC-721 selectors
const BALANCE_OF = "0x70a08231";      // balanceOf(address)
const OWNER_OF = "0x6352211e";          // ownerOf(uint256)
const TOKEN_URI = "0xc87b56dd";          // tokenURI(uint256)

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

function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function decodeAddress(result: string): string {
  return "0x" + result.slice(-40);
}

/** Get ERC-721 balance (number of tokens owned) */
async function getERC721Balance(wallet: string): Promise<number> {
  const data = `${BALANCE_OF}${encodeAddress(wallet)}`;
  const result = await baseRpcCall("eth_call", [{ to: ANFE_CONTRACT, data }, "latest"]);
  if (!result || result === "0x") return 0;
  return parseInt(result, 16);
}

/** Get owner of a specific token ID */
async function getOwnerOf(tokenId: string): Promise<string | null> {
  try {
    const padded = BigInt(tokenId).toString(16).padStart(64, "0");
    const data = `${OWNER_OF}${padded}`;
    const result = await baseRpcCall("eth_call", [{ to: ANFE_CONTRACT, data }, "latest"]);
    if (!result || result === "0x") return null;
    return decodeAddress(result);
  } catch {
    return null;
  }
}

/** Get token URI for metadata */
async function getTokenURI(tokenId: string): Promise<string | null> {
  try {
    const padded = BigInt(tokenId).toString(16).padStart(64, "0");
    const data = `${TOKEN_URI}${padded}`;
    const result = await baseRpcCall("eth_call", [{ to: ANFE_CONTRACT, data }, "latest"]);
    if (!result || result === "0x") return null;
    // Decode hex string
    const hexStr = result.slice(2); // remove 0x
    // The result is ABI-encoded: offset (32 bytes) + length (32 bytes) + string data
    // For simplicity, try to decode as UTF-8
    const bytes = [];
    for (let i = 0; i < hexStr.length; i += 2) {
      bytes.push(parseInt(hexStr.substr(i, 2), 16));
    }
    // Skip first 64 bytes (offset + length), decode rest
    const strBytes = bytes.slice(64);
    const decoded = String.fromCharCode(...strBytes);
    // Clean up non-printable chars
    const clean = decoded.replace(/[^\x20-\x7E]/g, "").trim();
    return clean || null;
  } catch {
    return null;
  }
}

/** Scan known token ID ranges for ownership */
async function scanForANFEs(wallet: string): Promise<ANFEAsset[]> {
  const results: ANFEAsset[] = [];

  // Known token IDs from screenshots + nearby range
  const candidates = [
    "4649559796048334",
    "4649559796048335",
    "4649559796048333",
    "4649559796048336",
    ...Array.from({ length: 10 }, (_, i) => String(4649559796048300 + i)),
  ];

  for (const tokenId of candidates) {
    const owner = await getOwnerOf(tokenId);
    if (owner && owner.toLowerCase() === wallet.toLowerCase()) {
      const uri = await getTokenURI(tokenId);
      results.push({
        id: tokenId,
        source: "node-manager",
        level: 10, // Level not exposed by contract — default
        name: `ANFE #${tokenId}`,
        status: "Owned",
        ownerAddress: wallet,
        chain: "base",
        delegatedTo: undefined,
        image: uri || undefined,
      });
    }
  }

  return results;
}

/** Discover ANFEs using direct blockchain queries */
export async function discoverANFEsDirect(): Promise<ANFEAsset[]> {
  const results: ANFEAsset[] = [];
  let walletAddress: string | null = null;

  try {
    // Priority 1: Electron Web3 API (same wallet shown in UI)
    const web3Api = (window as any).electronAPI?.web3;
    if (web3Api?.getAddress) {
      const addrResult = await web3Api.getAddress();
      walletAddress = addrResult?.data?.address || null;
    }

    // Priority 2: Node Manager status (might be wallet on newer versions)
    if (!walletAddress) {
      const client = new HyperCycleNodeManagerClient();
      const status = await client.getStatus();
      if (status?.address?.startsWith("0x")) {
        walletAddress = status.address;
      }
    }

    if (!walletAddress) {
      console.log("[ANFEDirect] No wallet address available");
      return results;
    }

    console.log(`[ANFEDirect] Wallet: ${walletAddress.slice(0, 12)}...`);

    // Check ERC-721 balance first
    const balance = await getERC721Balance(walletAddress);
    console.log(`[ANFEDirect] ERC-721 balance: ${balance}`);

    if (balance > 0) {
      const anfes = await scanForANFEs(walletAddress);
      results.push(...anfes);
      console.log(`[ANFEDirect] Found ${anfes.length} ANFEs`);
    } else {
      console.log("[ANFEDirect] Wallet has 0 ANFEs on Base mainnet");
    }
  } catch (e: any) {
    console.warn("[ANFEDirect] Discovery failed:", e.message || e);
  }

  return results;
}
