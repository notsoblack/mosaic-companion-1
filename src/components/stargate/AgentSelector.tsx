// =============================================================================
// AGENT SELECTOR — Embedded in Loop Builder Detail Tab
//
// Lets users select which Mosaic AI Agent (Byron, Mosaic Orchestrator, etc.)
// executes an agent-action node within a loop.
//
// Reads live agent profiles from Mosaic Bot Bridge.
// =============================================================================

import React, { useEffect, useState } from "react";
import { Bot, Loader2, AlertTriangle, CheckCircle, Brain, Zap, Shield } from "lucide-react";
import MosaicBotBridge, { MosaicAgentProfile } from "../../services/stargate/MosaicBotBridge";

interface AgentSelectorProps {
  selectedAgentId?: string;
  onChange: (agentId: string, agentName: string) => void;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({ selectedAgentId, onChange }) => {
  const [agents, setAgents] = useState<MosaicAgentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    setLoading(true);
    setError(null);
    try {
      const profiles = await MosaicBotBridge.getAgentProfiles();
      // Sort: active first, then by name
      const sorted = [...profiles].sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return (a.name || "").localeCompare(b.name || "");
      });
      setAgents(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
          <Bot size={14} className="text-blue-400" />
          Select AI Agent
        </div>
        <button
          onClick={loadAgents}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-cyan-400 disabled:opacity-40"
        >
          <Loader2 size={10} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-400">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      <div className="space-y-1 max-h-[160px] overflow-auto">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onChange(agent.id, agent.name)}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded text-xs transition-colors text-left ${
              selectedAgentId === agent.id
                ? "bg-blue-900/20 border border-blue-700/50 text-blue-300"
                : "hover:bg-gray-800 text-gray-400 border border-transparent"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${agent.isActive ? "bg-green-400" : "bg-gray-600"}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{agent.name}</div>
              <div className="text-[10px] text-gray-600 truncate">
                {agent.provider} · {agent.model}
              </div>
            </div>
            {selectedAgentId === agent.id && (
              <CheckCircle size={12} className="text-blue-400 shrink-0" />
            )}
          </button>
        ))}
        {agents.length === 0 && !loading && (
          <div className="text-[10px] text-gray-600 px-2">No agents found. Configure agents in Mosaic Companion Settings.</div>
        )}
        {loading && agents.length === 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 px-2">
            <Loader2 size={10} className="animate-spin" />
            Loading agents...
          </div>
        )}
      </div>

      {/* Selected agent detail */}
      {selectedAgent && (
        <div className="bg-gray-800 rounded p-2 text-[10px] space-y-1">
          <div className="flex items-center gap-2">
            <Brain size={12} className="text-blue-400" />
            <span className="font-medium text-gray-300">{selectedAgent.name}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${
              selectedAgent.isActive ? "bg-green-900/30 text-green-400" : "bg-gray-700 text-gray-500"
            }`}>
              {selectedAgent.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          {selectedAgent.description && (
            <div className="text-gray-500">{selectedAgent.description}</div>
          )}
          <div className="grid grid-cols-2 gap-1 text-gray-600">
            <div>Provider: <span className="text-gray-400">{selectedAgent.provider || "N/A"}</span></div>
            <div>Model: <span className="text-gray-400">{selectedAgent.model || "N/A"}</span></div>
            <div>Box Access: <span className="text-gray-400">{selectedAgent.boxAccess?.length || 0} boxes</span></div>
            <div>Skills: <span className="text-gray-400">{selectedAgent.skills?.length || 0}</span></div>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {selectedAgent.skills?.map((skill) => (
              <span key={skill} className="px-1.5 py-0.5 bg-gray-700 rounded text-[9px] text-gray-400">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentSelector;
