// =============================================================================
// MAIN STAGE — Content area that renders the active Stargate tab
// All existing Stargate panels become MODULES here — no rewrite needed
// =============================================================================

import React from "react";
import { useStargateStore } from "../../stores/stargateStore";
import { StargateGraphPanel } from "./StargateGraphPanel";
import MidnightCityCommandPanel from "./MidnightCityCommandPanel";
import LoopsPanel from "./LoopsPanel";
import NodeFactoryTrackerPanel from "./NodeFactoryTrackerPanel";
import StargateBuzzPanel from "./StargateBuzzPanel";
import StargatePoolHub from "./StargatePoolHub";

// Start tab — action cards + quick overview
const StartTab: React.FC = () => {
  const { nodeStatus, midnightAgent, activeLoops, mcpServers } = useStargateStore();

  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white">Stargate Command Center</h2>
        <p className="text-sm">Select a module from the sidebar to begin.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-2xl w-full">
        <QuickCard
          title="Graph"
          desc="Visualize your AI agent fleet and active loops"
          stat={nodeStatus ? `${nodeStatus.aims.length} AIMs` : "—"}
        />
        <QuickCard
          title="Midnight"
          desc="Control your Midnight City agent economy"
          stat={midnightAgent ? `${midnightAgent.profession} @ ${midnightAgent.spaceId.slice(0, 12)}` : "Disconnected"}
        />
        <QuickCard
          title="Loops"
          desc="Design and manage agent workflow topologies"
          stat={`${activeLoops.length} loops`}
        />
        <QuickCard
          title="Factories"
          desc="Monitor HyperCycle node factories and ANFEs"
          stat="View status"
        />
        <QuickCard
          title="Network"
          desc="Buzz community hub and node intelligence"
          stat="View network"
        />
        <QuickCard
          title="MCP"
          desc={`${mcpServers.length} servers connected`}
          stat={`${mcpServers.reduce((a, s) => a + s.toolCount, 0)} tools`}
        />
      </div>
    </div>
  );
};

const QuickCard: React.FC<{ title: string; desc: string; stat: string }> = ({
  title,
  desc,
  stat,
}) => (
  <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-cyan-500/30 hover:bg-gray-900 transition-all cursor-default">
    <div className="text-sm font-semibold text-white mb-1">{title}</div>
    <div className="text-xs text-gray-500 mb-2">{desc}</div>
    <div className="text-xs text-cyan-400 font-mono">{stat}</div>
  </div>
);

export const MainStage: React.FC = () => {
  const { activeTab } = useStargateStore();

  switch (activeTab) {
    case "start":
      return <StartTab />;
    case "graph":
      return (
        <div className="h-full">
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
