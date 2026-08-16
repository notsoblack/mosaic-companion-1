// =============================================================================
// STARGATE SIDEBAR — Context-aware left panel
// Shows: Tab switcher + actions that change based on active tab
// Also: Quick links to Mosaic systems (Vault, MCP, Web3, AI Chat)
// =============================================================================

import React from "react";
import { useStargateStore, type StargateTab } from "../../stores/stargateStore";
import {
  Rocket,
  Wrench,
  Share2,
  Pickaxe,
  GitBranch,
  Layers,
  Globe,
  Zap,
  Utensils,
  Moon,
  ShoppingCart,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Download,
  Box,
  Server,
  Wallet,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const tabDefs: { id: StargateTab; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { id: "start", label: "Start", icon: Rocket },
  { id: "skills", label: "Skills", icon: Wrench },
  { id: "graph", label: "Graph", icon: Share2 },
  { id: "midnight", label: "Midnight", icon: Pickaxe },
  { id: "loops", label: "Loops", icon: GitBranch },
  { id: "factories", label: "Factories", icon: Layers },
  { id: "network", label: "Network", icon: Globe },
];

// ── Actions per tab ──
interface TabAction {
  id: string;
  label: string;
  icon: React.FC<{ size?: number; className?: string }>;
  onClick: () => void;
  variant?: "primary" | "danger" | "default";
}

export const StargateSidebar: React.FC = () => {
  const { activeTab, setActiveTab, sidebarOpen, toggleSidebar, addLog } =
    useStargateStore();

  // ── Context actions based on active tab ──
  const getActions = (): TabAction[] => {
    switch (activeTab) {
      case "skills":
        return [
          {
            id: "refresh-skills",
            label: "Refresh Skills",
            icon: RefreshCw,
            onClick: () => addLog("sidebar", "info", "Skills refreshed from disk"),
          },
          {
            id: "browse-hub",
            label: "Browse Hub",
            icon: Plus,
            onClick: () => addLog("sidebar", "info", "Open Skills Hub browser"),
            variant: "primary",
          },
        ];
      case "graph":
        return [
          {
            id: "create-loop",
            label: "Create Loop",
            icon: GitBranch,
            onClick: () => addLog("sidebar", "info", "Create Loop clicked (wire to LoopBuilder)"),
            variant: "primary",
          },
          {
            id: "refresh-nodes",
            label: "Refresh Nodes",
            icon: RefreshCw,
            onClick: () => addLog("sidebar", "info", "Refresh graph nodes"),
          },
          {
            id: "export-image",
            label: "Export Image",
            icon: Download,
            onClick: () => addLog("sidebar", "info", "Export graph as image"),
          },
        ];
      case "midnight":
        return [
          {
            id: "eat",
            label: "Eat",
            icon: Utensils,
            onClick: () => addLog("sidebar", "info", "Eat action dispatched"),
            variant: "primary",
          },
          {
            id: "sleep",
            label: "Sleep",
            icon: Moon,
            onClick: () => addLog("sidebar", "info", "Sleep action dispatched"),
          },
          {
            id: "buy-supplies",
            label: "Buy Supplies",
            icon: ShoppingCart,
            onClick: () => addLog("sidebar", "info", "Buy Supplies opened"),
          },
          {
            id: "toggle-auto",
            label: "Toggle Auto-Work",
            icon: Zap,
            onClick: () => addLog("sidebar", "info", "Auto-work toggled"),
            variant: "primary",
          },
        ];
      case "loops":
        return [
          {
            id: "new-loop",
            label: "New Loop",
            icon: Plus,
            onClick: () => addLog("sidebar", "info", "New Loop modal opened"),
            variant: "primary",
          },
          {
            id: "import-json",
            label: "Import JSON",
            icon: Download,
            onClick: () => addLog("sidebar", "info", "Import loop JSON"),
          },
          {
            id: "dry-run",
            label: "Dry Run",
            icon: Play,
            onClick: () => addLog("sidebar", "info", "Dry run started"),
          },
        ];
      case "factories":
        return [
          {
            id: "load-chain",
            label: "Load from Chain",
            icon: RefreshCw,
            onClick: () => addLog("sidebar", "info", "Load factories from chain"),
          },
          {
            id: "provision",
            label: "Provision Node",
            icon: Plus,
            onClick: () => addLog("sidebar", "info", "Provision node"),
            variant: "primary",
          },
        ];
      case "network":
        return [
          {
            id: "refresh-buzz",
            label: "Refresh Network",
            icon: RefreshCw,
            onClick: () => addLog("sidebar", "info", "Network refreshed"),
          },
        ];
      default:
        return [];
    }
  };

  const actions = getActions();

  return (
    <div
      className={`flex flex-col bg-gray-950 border-r border-gray-800 transition-all duration-200 ${
        sidebarOpen ? "w-64" : "w-14"
      }`}
    >
      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-b border-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-900 transition-colors"
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Tab switcher */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {tabDefs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-400"
                  : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
              }`}
              title={tab.label}
            >
              <Icon size={18} className="shrink-0" />
              {sidebarOpen && (
                <span className="truncate font-medium">{tab.label}</span>
              )}
            </button>
          );
        })}

        {/* Divider */}
        <div className="mx-3 my-2 h-px bg-gray-800" />

        {/* Context Actions */}
        {actions.length > 0 && (
          <>
            {sidebarOpen && (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Actions
              </div>
            )}
            <div className="space-y-0.5 px-1.5">
              {actions.map((action) => {
                const ActionIcon = action.icon;
                const variantClass =
                  action.variant === "primary"
                    ? "bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border-cyan-600/30"
                    : action.variant === "danger"
                    ? "bg-red-600/20 text-red-400 hover:bg-red-600/30 border-red-600/30"
                    : "bg-gray-800/50 text-gray-300 hover:bg-gray-800 border-gray-700/50";
                return (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-xs transition-colors ${variantClass}`}
                    title={action.label}
                  >
                    <ActionIcon size={14} className="shrink-0" />
                    {sidebarOpen && <span className="truncate">{action.label}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Divider */}
        <div className="mx-3 my-2 h-px bg-gray-800" />

        {/* Quick Links to Mosaic Systems */}
        {sidebarOpen && (
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Mosaic
          </div>
        )}
        <div className="space-y-0.5 px-1.5">
          <QuickLink icon={Box} label="Vault" url="vault" />
          <QuickLink icon={Server} label="MCP" url="mcp" />
          <QuickLink icon={Wallet} label="Web3" url="web3" />
          <QuickLink icon={MessageSquare} label="AI Chat" url="chat" />
        </div>
      </div>
    </div>
  );
};

// ── Quick link button ──
const QuickLink: React.FC<{
  icon: React.FC<{ size?: number; className?: string }>;
  label: string;
  url: string;
}> = ({ icon: Icon, label, url }) => {
  const { sidebarOpen } = useStargateStore();
  return (
    <button
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-gray-400 hover:bg-gray-900 hover:text-gray-200 transition-colors"
      title={`Open ${label}`}
      onClick={() => {
        // Navigate via window.electronAPI or emit event
        console.log(`[StargateSidebar] Navigate to ${url}`);
      }}
    >
      <Icon size={14} className="shrink-0" />
      {sidebarOpen && <span className="truncate">{label}</span>}
    </button>
  );
};

export default StargateSidebar;
