// =============================================================================
// MAIN STAGE — Content area that renders the active Stargate tab
// All existing Stargate panels become MODULES here — no rewrite needed
// =============================================================================

import React from "react";
import { useStargateStore } from "../../stores/stargateStore";
import {
  Box, Pickaxe, Wallet, Moon, GitBranch, Server, Zap, Activity,
} from "lucide-react";
import { StargateGraphPanel } from "./StargateGraphPanel";
import MidnightCityCommandPanel from "./MidnightCityCommandPanel";
import LoopsPanel from "./LoopsPanel";
import NodeFactoryTrackerPanel from "./NodeFactoryTrackerPanel";
import StargateBuzzPanel from "./StargateBuzzPanel";
import StargatePoolHub from "./StargatePoolHub";
import { StargateSkillsView } from "./StargateSkillsView";

// ── StatPill — compact header-style stat row ──
const StatPill: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}> = ({ icon: Icon, label, value, color }) => {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
    amber: "text-amber-400 border-amber-500/20 bg-amber-500/10",
    blue: "text-blue-400 border-blue-500/20 bg-blue-500/10",
    purple: "text-purple-400 border-purple-500/20 bg-purple-500/10",
    cyan: "text-cyan-400 border-cyan-500/20 bg-cyan-500/10",
    gray: "text-gray-400 border-gray-500/20 bg-gray-500/10",
  };
  const cls = colorMap[color] || colorMap.gray;
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${cls}`}>
      <Icon size={14} />
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
        <span className="text-xs font-semibold truncate">{value}</span>
      </div>
    </div>
  );
};

// ── QuickCard — clickable module card ──
const QuickCard: React.FC<{
  title: string;
  desc: string;
  stat: string;
  onClick?: () => void;
}> = ({ title, desc, stat, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-gray-900/50 border border-gray-800 rounded-xl p-4 transition-all ${
      onClick ? "hover:border-cyan-500/30 hover:bg-gray-900 cursor-pointer" : "cursor-default"
    }`}
  >
    <div className="text-sm font-semibold text-white mb-1">{title}</div>
    <div className="text-xs text-gray-500 mb-2">{desc}</div>
    <div className="text-xs text-cyan-400 font-mono">{stat}</div>
  </div>
);

// Start tab — action cards + quick overview
const StartTab: React.FC = () => {
  const {
    nodeStatus,
    midnightAgent,
    activeLoops,
    mcpServers,
    walletAddress,
    anfeCount,
    vaultBoxes,
    skills,
  } = useStargateStore();

  // Live counts with bulletproof null guards
  const safeActiveLoops = Array.isArray(activeLoops) ? activeLoops : [];
  const runningLoopCount = safeActiveLoops.filter((l) => l?.status === "running").length;
  const safeMcpServers = Array.isArray(mcpServers) ? mcpServers : [];
  const connectedMcpCount = safeMcpServers.filter((s) => s?.status === "connected").length;
  const totalTools = safeMcpServers.reduce((a, s) => a + (Number(s?.toolCount) || 0), 0);

  return (
    <div className="h-full flex flex-col overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <Zap size={20} className="text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Stargate Command Center</h2>
        </div>
        <p className="text-sm text-gray-500">Live system overview — all modules ready</p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-6 gap-3">
        <StatPill
          icon={Box}
          label="Vault Boxes"
          value={vaultBoxes?.length > 0 ? `${vaultBoxes.length} boxes` : "—"}
          color="cyan"
        />
        <StatPill
          icon={Pickaxe}
          label="Node Manager"
          value={nodeStatus?.online ? "Alive" : "Offline"}
          color={nodeStatus?.online ? "emerald" : "amber"}
        />
        <StatPill
          icon={Wallet}
          label="Wallet"
          value={walletAddress ? "Connected" : "—"}
          color="blue"
        />
        <StatPill
          icon={Moon}
          label="Midnight"
          value={midnightAgent ? `${midnightAgent.profession || "Agent"}` : "Disconnected"}
          color={midnightAgent ? "purple" : "gray"}
        />
        <StatPill
          icon={GitBranch}
          label="Active Loops"
          value={`${runningLoopCount}/${safeActiveLoops.length}`}
          color={runningLoopCount > 0 ? "emerald" : "gray"}
        />
        <StatPill
          icon={Server}
          label="MCP Tools"
          value={`${connectedMcpCount} srv · ${totalTools} tools`}
          color={connectedMcpCount > 0 ? "cyan" : "gray"}
        />
      </div>

      {/* Quick Cards */}
      <div className="grid grid-cols-3 gap-4">
        <QuickCard
          title="Graph"
          desc="Visualize agent fleet, Vault Boxes, and active loops"
          stat={nodeStatus && Array.isArray(nodeStatus.aims) ? `${nodeStatus.aims.length} AIMs · ${anfeCount || 0} ANFEs` : "—"}
          onClick={() => useStargateStore.getState().setActiveTab("graph")}
        />
        <QuickCard
          title="Skills"
          desc="Manage agent skills from Hermes + Mosaic sources"
          stat={`${skills?.length || 0} skills loaded`}
          onClick={() => useStargateStore.getState().setActiveTab("skills")}
        />
        <QuickCard
          title="Midnight"
          desc="Control Midnight City agent economy"
          stat={midnightAgent ? `${midnightAgent.profession || "Agent"} @ ${String(midnightAgent.spaceId || "").slice(0, 12)}` : "Disconnected"}
          onClick={() => useStargateStore.getState().setActiveTab("midnight")}
        />
        <QuickCard
          title="Loops"
          desc="Design and manage agent workflow topologies"
          stat={`${safeActiveLoops.length} loops · ${runningLoopCount} running`}
          onClick={() => useStargateStore.getState().setActiveTab("loops")}
        />
        <QuickCard
          title="Factories"
          desc="Monitor HyperCycle node factories and ANFEs"
          stat="View status"
          onClick={() => useStargateStore.getState().setActiveTab("factories")}
        />
        <QuickCard
          title="Network"
          desc="Buzz community hub and node intelligence"
          stat="View network"
          onClick={() => useStargateStore.getState().setActiveTab("network")}
        />
      </div>
    </div>
  );
};

export const MainStage: React.FC = () => {
  const { activeTab } = useStargateStore();

  switch (activeTab) {
  case "start":
    return <StartTab />;
  case "skills":
    return <StargateSkillsView />;
  case "graph":
    return (
      <div className="flex-1 h-full min-w-0">
        <StargateGraphPanel />
      </div>
    );
    case "midnight":
      return <MidnightCityCommandPanel />;
    case "loops":
      return <LoopsPanel />;
    case "factories":
      return (
        <div className="h-full flex flex-col space-y-4 p-4 overflow-y-auto">
          <NodeFactoryTrackerPanel />
          <StargatePoolHub />
        </div>
      );
    case "network":
      return <StargateBuzzPanel userAgents={[]} />;
    default:
      return <StartTab />;
  }
};

export default MainStage;
