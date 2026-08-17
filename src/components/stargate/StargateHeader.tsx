// =============================================================================
// STARGATE HEADER — Live status bar for all connected systems
// Shows: Node Manager, Web3 Wallet, Midnight Agent, Active Loops, MCP, Vault
// =============================================================================

import React from "react";
import { useStargateStore } from "../../stores/stargateStore";
import {
  Activity,
  Wallet,
  Pickaxe,
  GitBranch,
  Server,
  Box,
  Cpu,
  HardDrive,
  Zap,
} from "lucide-react";

const THEME = {
  bg: "bg-gray-950",
  border: "border-gray-800",
  text: "text-gray-300",
  textMuted: "text-gray-500",
  badgeGreen: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  badgeBlue: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  badgeAmber: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  badgePurple: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  badgePink: "bg-pink-500/15 text-pink-400 border-pink-500/25",
  badgeCyan: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
};

/** Format uptime percent: 0.9808 → "98%" */
function fmtUptime(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Format crystals: 1475023 → "1.48M" */
function fmtCrystals(n: number): string {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return `${num}`;
}

/** Format wallet address: 0x1234...5678 — BULLETPROOF */
function fmtWallet(addr: any): string {
  const s = typeof addr === "string" ? addr : String(addr ?? "");
  if (!s || s === "undefined" || s === "null" || s === "[object Object]") return "—";
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

/** Safe String helper — forces string + truncates */
function safeString(val: any, maxLen?: number): string {
  const s = String(val == null ? "" : val);
  if (maxLen && s.length > maxLen) return s.slice(0, maxLen) + "…";
  return s;
}

export const StargateHeader: React.FC = () => {
  const {
    nodeStatus,
    walletAddress,
    anfes,
    midnightAgent,
    activeLoops,
    mcpServers,
    vaultBoxes,
  } = useStargateStore();

  // ── Derived counts with null-safe fallbacks ──
  const safeActiveLoops = Array.isArray(activeLoops) ? activeLoops : [];
  const safeMcpServers = Array.isArray(mcpServers) ? mcpServers : [];
  const safeVaultBoxes = Array.isArray(vaultBoxes) ? vaultBoxes : [];
  const loopCount = safeActiveLoops.length;
  const runningLoops = safeActiveLoops.filter((l) => l?.status === "running").length;
  const mcpCount = safeMcpServers.filter((s) => s?.status === "connected").length;
  const mcpToolCount = safeMcpServers.reduce((a, s) => a + (Number(s?.toolCount) || 0), 0);
  const vaultCount = safeVaultBoxes.length;
  const vaultTotalEntries = safeVaultBoxes.reduce((a, b) => a + (Number(b?.entryCount) || 0), 0);

  // ── Debug: log all header values that might crash ──
  React.useEffect(() => {
    console.log("[StargateHeader] values:", {
      walletAddress: typeof walletAddress,
      walletAddressVal: walletAddress,
      midnightAgent: midnightAgent ? {
        profession: typeof midnightAgent.profession,
        professionVal: midnightAgent.profession,
        spaceId: typeof midnightAgent.spaceId,
        spaceIdVal: midnightAgent.spaceId,
        hunger: midnightAgent.hunger,
        energy: midnightAgent.energy,
        crystals: midnightAgent.crystals,
      } : null,
      anfes: anfes.length,
      nodeStatus: nodeStatus ? {
        online: nodeStatus.online,
        uptimePercent: nodeStatus.uptimePercent,
        cpuCount: nodeStatus.hardware?.cpuCount,
        memoryGB: nodeStatus.hardware?.memoryGB,
      } : null,
    });
  }, [walletAddress, midnightAgent, anfes, nodeStatus]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 ${THEME.bg} border-b ${THEME.border} overflow-x-auto`}
      style={{ scrollbarWidth: "none" }}
    >
      {/* ── Title ── */}
      <div className="flex items-center gap-2 shrink-0 mr-2">
        <Zap size={18} className="text-cyan-400" />
        <span className="text-sm font-bold text-white tracking-tight">
          Command Center
        </span>
      </div>

      <div className="w-px h-5 bg-gray-800 shrink-0" />

      {/* ── Node Manager ── */}
      <HeaderBadge
        icon={Server}
        label="Node"
        value={nodeStatus?.online ? "Alive" : "Offline"}
        detail={
          nodeStatus
            ? `${fmtUptime(Number(nodeStatus.uptimePercent) || 0)} · ${Number(nodeStatus.hardware?.cpuCount) || 0} CPUs · ${Number(nodeStatus.hardware?.memoryGB) || 0}GB`
            : undefined
        }
        color={nodeStatus?.online ? "green" : "amber"}
        dot
      />

      {/* ── Web3 Wallet ── */}
      <HeaderBadge
        icon={Wallet}
        label="Wallet"
        value={fmtWallet(walletAddress)}
        detail={
          anfes.length > 0
            ? `${anfes.length} ANFEs (${anfes.filter(a => a.source === "node-manager").length} Node · ${anfes.filter(a => a.source === "web3").length} Web3)`
            : undefined
        }
        color={walletAddress ? "blue" : "muted"}
      />

      {/* ── Midnight Agent ── */}
      <HeaderBadge
        icon={Pickaxe}
        label="Midnight"
        value={
          midnightAgent
            ? `${safeString(midnightAgent.profession)} @ ${safeString(midnightAgent.spaceId, 12)}`
            : "Disconnected"
        }
        detail={
          midnightAgent
            ? `H:${Math.round(Number(midnightAgent.hunger) || 0)}% E:${Math.round(
                Number(midnightAgent.energy) || 0
              )}% 💎${fmtCrystals(midnightAgent.crystals)}`
            : undefined
        }
        color={midnightAgent ? "pink" : "muted"}
        dot={!!midnightAgent?.isAutoWorking}
      />

      {/* ── Active Loops ── */}
      <HeaderBadge
        icon={GitBranch}
        label="Loops"
        value={loopCount > 0 ? `${runningLoops}/${loopCount}` : "0"}
        detail={
          loopCount > 0
            ? safeActiveLoops.map((l) => `${safeString(l?.name)} (${safeString(l?.status)})`).join(", ")
            : undefined
        }
        color={runningLoops > 0 ? "purple" : "muted"}
        pulse={runningLoops > 0}
      />

      {/* ── MCP Servers ── */}
      <HeaderBadge
        icon={Cpu}
        label="MCP"
        value={mcpCount > 0 ? `${mcpCount} connected` : "—"}
        detail={mcpToolCount > 0 ? `${mcpToolCount} tools` : undefined}
        color={mcpCount > 0 ? "cyan" : "muted"}
      />

      {/* ── Vault ── */}
      <HeaderBadge
        icon={Box}
        label="Vault"
        value={vaultCount > 0 ? `${vaultCount} boxes` : "Boxes"}
        detail={vaultTotalEntries > 0 ? `${vaultTotalEntries} entries` : undefined}
        color={vaultCount > 0 ? "cyan" : "muted"}
      />
    </div>
  );
};

// ── Sub-component: Badge with tooltip ──

interface HeaderBadgeProps {
  icon: React.FC<{ size?: number; className?: string }>;
  label: string;
  value: string;
  detail?: string;
  color: "green" | "blue" | "amber" | "purple" | "pink" | "cyan" | "muted";
  dot?: boolean;
  pulse?: boolean;
}

const colorMap: Record<HeaderBadgeProps["color"], string> = {
  green: THEME.badgeGreen,
  blue: THEME.badgeBlue,
  amber: THEME.badgeAmber,
  purple: THEME.badgePurple,
  pink: THEME.badgePink,
  cyan: THEME.badgeCyan,
  muted: "bg-gray-800/50 text-gray-500 border-gray-700/50",
};

const dotColorMap: Record<HeaderBadgeProps["color"], string> = {
  green: "bg-emerald-400",
  blue: "bg-blue-400",
  amber: "bg-amber-400",
  purple: "bg-purple-400",
  pink: "bg-pink-400",
  cyan: "bg-cyan-400",
  muted: "bg-gray-500",
};

const HeaderBadge: React.FC<HeaderBadgeProps> = ({
  icon: Icon,
  label,
  value,
  detail,
  color,
  dot,
  pulse,
}) => {
  return (
    <div className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium shrink-0 cursor-default ${colorMap[color]}`}>
      <Icon size={13} className="shrink-0 opacity-80" />
      <span className="text-[10px] uppercase tracking-wider opacity-60 mr-0.5">
        {label}
      </span>
      <span className="text-xs">{value}</span>
      {dot && (
        <span
          className={`ml-0.5 w-1.5 h-1.5 rounded-full ${dotColorMap[color]} ${
            pulse ? "animate-pulse" : ""
          }`}
        />
      )}
      {/* Tooltip */}
      {detail && (
        <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 whitespace-nowrap shadow-xl">
            {detail}
          </div>
        </div>
      )}
    </div>
  );
};

export default StargateHeader;
