// =============================================================================
// STARGATE GRAPH PANEL — Read-Only View of Mosaic Vault
//
// Core principle: Mosaic Companion owns the Vault. Stargate only READS from it.
// This panel visualizes the user's existing Vault boxes, their contents,
// and how they connect to agents, networks, and nodes.
//
// The graph is a LENS on Mosaic data, not a second data store.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlowProvider, ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, Node, Edge, Connection, addEdge,
  Panel, Handle, Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  Database, Bot, Globe, Server, Zap, Layers, Share2,
  RefreshCw, Maximize2, Search, Lock, AlertCircle,
  GitBranch,
} from "lucide-react";
import { LOOP_PRESETS } from "../../types/StargateLoop";
import LoopBuilderModal from "./LoopBuilderModal";
import MosaicBotBridge, { MosaicAgentProfile } from "../../services/stargate/MosaicBotBridge";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface VaultBox {
  id: string;
  name: string;
  description?: string;
  sourceType?: string;
  entryCount?: number;
  createdAt?: string;
}

interface VaultEntry {
  id: string;
  label: string;
  content: string;
  boxId: string;
  createdAt?: string;
}

interface GraphNodeData {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  meta?: Record<string, any>;
}

/* ── Vault API (read-only) ──────────────────────────────────────────────── */

interface VaultApi {
  getBoxes: () => Promise<any[]>;
  getBoxContent: (boxId: string) => Promise<any[]>;
}

function getVaultApi(): VaultApi | null {
  const api = (window as any).addonAPI?.vault ?? (window as any).electronAPI?.vault;
  if (!api?.getBoxes) {
    console.warn("[StargateGraph] Vault API not available");
    return null;
  }
  return api as VaultApi;
}

/* ── Node Components ─────────────────────────────────────────────────────── */

const nodeStyle = (color: string): React.CSSProperties => ({
  background: "#0f172a",
  border: `1px solid ${color}`,
  borderRadius: "8px",
  padding: "8px 12px",
  minWidth: "140px",
  boxShadow: `0 0 8px ${color}33`,
  color: "#fff",
  fontSize: "12px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
});

const VaultBoxNode: React.FC<{ data: GraphNodeData }> = ({ data }) => (
  <div style={nodeStyle(data.color)} className="relative">
    <Handle type="target" position={Position.Top} id="in" style={{ background: data.color }} />
    <div className="flex items-center gap-2">
      {data.icon}
      <div>
        <div className="font-bold">{data.label}</div>
        <div className="text-gray-500 text-[10px] line-clamp-2">{data.description}</div>
        {data.meta?.entryCount && <div className="text-[10px] text-cyan-400 mt-0.5">{data.meta.entryCount} entries</div>}
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} id="contains" style={{ background: data.color }} />
  </div>
);

const EntryNode: React.FC<{ data: GraphNodeData }> = ({ data }) => (
  <div style={{ ...nodeStyle(data.color), borderRadius: "4px", padding: "4px 10px", minWidth: "120px" }} className="relative">
    <Handle type="target" position={Position.Top} id="contains" style={{ background: data.color }} />
    <div className="flex items-center gap-1.5">
      {data.icon}
      <div className="font-bold text-[11px]">{data.label}</div>
    </div>
    <div className="text-gray-500 text-[9px] mt-0.5 line-clamp-1">{data.description}</div>
    <Handle type="source" position={Position.Bottom} id="configures" style={{ background: data.color }} />
    <Handle type="source" position={Position.Right} id="connects" style={{ background: data.color }} />
  </div>
);

const AgentNode: React.FC<{ data: GraphNodeData }> = ({ data }) => (
  <div style={nodeStyle(data.color)} className="relative">
    <Handle type="target" position={Position.Left} id="configures" style={{ background: data.color }} />
    <Handle type="target" position={Position.Top} id="deployed-to" style={{ background: data.color }} />
    <div className="flex items-center gap-2">
      {data.icon}
      <div>
        <div className="font-bold">{data.label}</div>
        <div className="text-gray-500 text-[10px]">{data.description}</div>
        {data.meta?.status && (
          <div className={`text-[10px] mt-0.5 ${data.meta.status === "online" ? "text-green-400" : "text-amber-400"}`}>
            ● {data.meta.status}
          </div>
        )}
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} id="runs-on" style={{ background: data.color }} />
    <Handle type="source" position={Position.Right} id="delegates" style={{ background: data.color }} />
  </div>
);

const NetworkNode: React.FC<{ data: GraphNodeData }> = ({ data }) => (
  <div style={{ ...nodeStyle(data.color), borderRadius: "9999px" }} className="relative">
    <Handle type="target" position={Position.Left} id="connects" style={{ background: data.color }} />
    <div className="flex items-center gap-2">
      {data.icon}
      <div>
        <div className="font-bold">{data.label}</div>
        <div className="text-gray-500 text-[10px]">{data.description}</div>
      </div>
    </div>
    <Handle type="source" position={Position.Right} id="deployed-to" style={{ background: data.color }} />
  </div>
);

const NodeFactoryNode: React.FC<{ data: GraphNodeData }> = ({ data }) => (
  <div style={{ ...nodeStyle(data.color), borderStyle: "dashed" }} className="relative">
    <Handle type="target" position={Position.Left} id="runs-on" style={{ background: data.color }} />
    <div className="flex items-center gap-2">
      {data.icon}
      <div>
        <div className="font-bold">{data.label}</div>
        <div className="text-gray-500 text-[10px]">{data.description}</div>
        {data.meta?.health && (
          <div className="flex items-center gap-1 mt-0.5">
            <div className="h-1 w-8 bg-gray-700 rounded overflow-hidden">
              <div className="h-full bg-green-500" style={{ width: `${data.meta.health}%` }} />
            </div>
            <span className="text-[10px] text-gray-400">{data.meta.health}%</span>
          </div>
        )}
      </div>
    </div>
  </div>
);

const PoolNode: React.FC<{ data: GraphNodeData }> = ({ data }) => (
  <div style={{ ...nodeStyle(data.color), borderWidth: "2px" }} className="relative">
    <Handle type="target" position={Position.Left} id="delegates" style={{ background: data.color }} />
    <div className="flex items-center gap-2">
      {data.icon}
      <div>
        <div className="font-bold">{data.label}</div>
        <div className="text-gray-500 text-[10px]">{data.description}</div>
      </div>
    </div>
  </div>
);

const nodeTypes = {
  "vault-box": VaultBoxNode,
  entry: EntryNode,
  agent: AgentNode,
  network: NetworkNode,
  node: NodeFactoryNode,
  pool: PoolNode,
};

/* ── Edge styles ─────────────────────────────────────────────────────────── */

const edgeStyles: Record<string, { color: string; label: string }> = {
  contains:    { color: "#06b6d4", label: "contains" },
  configures:  { color: "#a855f7", label: "configures" },
  "deployed-to": { color: "#f59e0b", label: "deployed-to" },
  "runs-on":     { color: "#22c55e", label: "runs-on" },
  delegates:   { color: "#ec4899", label: "delegates" },
  connects:    { color: "#64748b", label: "connects" },
};

/* ── Layout (dagre) ──────────────────────────────────────────────────────── */

function layoutGraph(nodes: Node[], edges: Edge[], dir: "TB" | "LR" = "TB") {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: 50, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: 160, height: 70 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const node = g.node(n.id);
    return { ...n, position: { x: node.x - 80, y: node.y - 35 } };
  });
}

/* ── Graph builder (reads Mosaic Vault) ──────────────────────────────────── */

function buildGraph(
  boxes: VaultBox[],
  entries: VaultEntry[],
  agentNodes: Array<{ id: string; label: string; desc: string; status: string; provider?: string; model?: string; boxAccess?: string[]; skills?: string[] }>,
  staticNetworks: Array<{ id: string; label: string; desc: string }>,
  staticNodes: Array<{ id: string; label: string; desc: string; health?: number }>
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // ── Vault boxes (layer 0) ──
  boxes.forEach((box) => {
    nodes.push({
      id: `box-${box.id}`,
      type: "vault-box",
      position: { x: 0, y: 0 },
      data: {
        label: box.name,
        description: box.description || "Mosaic Vault box",
        icon: <Database size={16} className="text-cyan-400" />,
        color: "#06b6d4",
        meta: { entryCount: box.entryCount || entries.filter((e) => e.boxId === box.id).length },
      },
    });
  });

  // If no boxes, show a placeholder
  if (boxes.length === 0) {
    nodes.push({
      id: "vault-empty",
      type: "vault-box",
      position: { x: 0, y: 0 },
      data: {
        label: "Mosaic Vault",
        description: "No boxes yet. Create boxes in Mosaic Vault.",
        icon: <Database size={16} className="text-gray-500" />,
        color: "#64748b",
      },
    });
  }

  // ── Entries (layer 1) ──
  entries.forEach((entry) => {
    const entryId = `entry-${entry.id}`;
    nodes.push({
      id: entryId,
      type: "entry",
      position: { x: 0, y: 0 },
      data: {
        label: entry.label || "Entry",
        description: entry.content?.slice(0, 60) || "Vault entry",
        icon: <Zap size={12} className="text-purple-400" />,
        color: "#a855f7",
      },
    });
    edges.push({
      id: `e-box-${entry.boxId}-${entryId}`,
      source: `box-${entry.boxId}`,
      target: entryId,
      type: "smoothstep",
      animated: true,
      style: { stroke: edgeStyles.contains.color },
      label: edgeStyles.contains.label,
      labelStyle: { fill: edgeStyles.contains.color, fontSize: 10 },
      sourceHandle: "contains",
      targetHandle: "contains",
    });
  });

  // ── Networks (layer 2) ──
  staticNetworks.forEach((net) => {
    nodes.push({
      id: net.id,
      type: "network",
      position: { x: 0, y: 0 },
      data: {
        label: net.label,
        description: net.desc,
        icon: <Globe size={16} className="text-amber-400" />,
        color: "#f59e0b",
      },
    });
  });

  // ── Agents (layer 3) ──
  agentNodes.forEach((a) => {
    nodes.push({
      id: a.id,
      type: "agent",
      position: { x: 0, y: 0 },
      data: {
        label: a.label,
        description: a.desc,
        icon: <Bot size={16} className="text-blue-400" />,
        color: "#3b82f6",
        meta: { status: a.status, provider: a.provider, model: a.model, boxAccess: a.boxAccess?.length || 0, skills: a.skills?.length || 0 },
      },
    });
    // Connect entries to agents (if entry label mentions the agent)
    entries.forEach((entry) => {
      if (entry.content?.toLowerCase().includes(a.label.toLowerCase())) {
        edges.push({
          id: `e-entry-${entry.id}-${a.id}`,
          source: `entry-${entry.id}`,
          target: a.id,
          type: "smoothstep",
          style: { stroke: edgeStyles.configures.color },
          label: edgeStyles.configures.label,
          labelStyle: { fill: edgeStyles.configures.color, fontSize: 10 },
          sourceHandle: "configures",
          targetHandle: "configures",
        });
      }
    });
  });

  // ── Nodes (layer 4) ──
  staticNodes.forEach((n) => {
    nodes.push({
      id: n.id,
      type: "node",
      position: { x: 0, y: 0 },
      data: {
        label: n.label,
        description: n.desc,
        icon: <Server size={16} className="text-green-400" />,
        color: "#22c55e",
        meta: { health: n.health },
      },
    });
  });

  // ── Pool ──
  nodes.push({
    id: "pool-main",
    type: "pool",
    position: { x: 0, y: 0 },
    data: {
      label: "HPEC Pool",
      description: "HyperCycle compute delegation",
      icon: <Layers size={16} className="text-pink-400" />,
      color: "#ec4899",
    },
  });

  // Agent → Network (deployed-to)
  edges.push({
    id: "e-net-midnight-agent-miner",
    source: "net-midnight",
    target: "agent-miner",
    type: "smoothstep",
    animated: true,
    style: { stroke: edgeStyles["deployed-to"].color },
    label: edgeStyles["deployed-to"].label,
    labelStyle: { fill: edgeStyles["deployed-to"].color, fontSize: 10 },
    sourceHandle: "deployed-to",
    targetHandle: "deployed-to",
  });

  // Agent → Node (runs-on)
  edges.push({
    id: "e-agent-orchestrator-node-anfe",
    source: "agent-orchestrator",
    target: "node-anfe-1",
    type: "smoothstep",
    animated: true,
    style: { stroke: edgeStyles["runs-on"].color },
    label: edgeStyles["runs-on"].label,
    labelStyle: { fill: edgeStyles["runs-on"].color, fontSize: 10 },
    sourceHandle: "runs-on",
    targetHandle: "runs-on",
  });

  // Agent → Pool (delegates)
  edges.push({
    id: "e-agent-orchestrator-pool",
    source: "agent-orchestrator",
    target: "pool-main",
    type: "smoothstep",
    animated: true,
    style: { stroke: edgeStyles.delegates.color },
    label: edgeStyles.delegates.label,
    labelStyle: { fill: edgeStyles.delegates.color, fontSize: 10 },
    sourceHandle: "delegates",
    targetHandle: "delegates",
  });

  // Network → Network (connects)
  edges.push({
    id: "e-net-midnight-net-hyper",
    source: "net-midnight",
    target: "net-hyper",
    type: "smoothstep",
    style: { stroke: edgeStyles.connects.color, strokeDasharray: "4 4" },
    label: edgeStyles.connects.label,
    labelStyle: { fill: edgeStyles.connects.color, fontSize: 10 },
    sourceHandle: "connects",
    targetHandle: "connects",
  });

  return { nodes, edges };
}

/* ── Main Canvas ─────────────────────────────────────────────────────────── */

const GraphCanvas: React.FC = () => {
  const [boxes, setBoxes] = useState<VaultBox[]>([]);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [layoutDir, setLayoutDir] = useState<"TB" | "LR">("TB");
  const [showLoopModal, setShowLoopModal] = useState(false);
  const [agentProfiles, setAgentProfiles] = useState<MosaicAgentProfile[]>([]);
  const [botStatus, setBotStatus] = useState<{ running: boolean; lastHeartbeat?: number; activeAgents: number } | null>(null);

  // ── Load data from Mosaic Vault (READ-ONLY) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Load Vault boxes
        const vault = getVaultApi();
        if (!vault) {
          setError("Vault API not available. Make sure Mosaic Companion exposes window.addonAPI.vault");
          setLoading(false);
          return;
        }

        const boxList = await vault.getBoxes();
        if (cancelled) return;
        setBoxes(
          boxList.map((b: any) => ({
            id: b.id || b.boxId || `box-${Date.now()}`,
            name: b.name || "Unnamed Box",
            description: b.description || "",
            sourceType: b.sourceType || "manual",
            entryCount: b.entryCount || b.entries?.length || 0,
            createdAt: b.createdAt,
          }))
        );

        const allEntries: VaultEntry[] = [];
        for (const box of boxList) {
          try {
            const boxEntries = await vault.getBoxContent(box.id || box.boxId);
            if (cancelled) return;
            boxEntries.forEach((e: any) => {
              allEntries.push({
                id: e.id || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                label: e.label || "Unnamed",
                content: typeof e.content === "string" ? e.content : JSON.stringify(e.content || e),
                boxId: box.id || box.boxId,
                createdAt: e.createdAt,
              });
            });
          } catch (err) {
            console.warn(`[StargateGraph] Failed to read box ${box.id}:`, err);
          }
        }
        if (cancelled) return;
        setEntries(allEntries);

        // 2. Load Mosaic Bot agent profiles (Byron, Mosaic Orchestrator, etc.)
        try {
          const profiles = await MosaicBotBridge.getAgentProfiles();
          if (!cancelled) setAgentProfiles(profiles);
        } catch (err) {
          console.warn("[StargateGraph] Failed to load agent profiles:", err);
        }

        // 3. Load Bot orchestrator status
        try {
          const status = await MosaicBotBridge.getOrchestratorStatus();
          if (!cancelled) setBotStatus(status);
        } catch (err) {
          console.warn("[StargateGraph] Failed to load bot status:", err);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Static data fallback ──
  const staticNetworks = useMemo(
    () => [
      { id: "net-midnight", label: "Midnight City", desc: "AI agent world" },
      { id: "net-buzz", label: "Buzz", desc: "Nostr relay" },
      { id: "net-hyper", label: "HyperCycle", desc: "Node factory layer" },
    ],
    []
  );
  const staticNodes = useMemo(
    () => [
      { id: "node-anfe-1", label: "ANFE-01", desc: "Don Benito", health: 92 },
      { id: "node-hnn-1", label: "HNN-01", desc: "Validator", health: 88 },
    ],
    []
  );

  // Build agent nodes from LIVE Mosaic Bot profiles (Byron, etc.)
  const agentNodes = useMemo(() => {
    return agentProfiles.map((agent) => ({
      id: `agent-${agent.id}`,
      label: agent.name,
      desc: agent.description || `${agent.provider} | ${agent.model}`,
      status: agent.isActive ? "active" : "inactive",
      provider: agent.provider,
      model: agent.model,
      boxAccess: agent.boxAccess,
      skills: agent.skills,
    }));
  }, [agentProfiles]);

  // ── Build graph ──
  const initial = useMemo(() => {
    const { nodes, edges } = buildGraph(boxes, entries, agentNodes, staticNetworks, staticNodes);
    return { nodes: layoutGraph(nodes, edges, layoutDir), edges };
  }, [boxes, entries, agentNodes, staticNetworks, staticNodes, layoutDir]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(boxes, entries, agentNodes, staticNetworks, staticNodes);
    setNodes(layoutGraph(n, e, layoutDir));
    setEdges(e);
  }, [boxes, entries, agentNodes, staticNetworks, staticNodes, layoutDir, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: "smoothstep", animated: true }, eds)),
    [setEdges]
  );

  // Query filter
  const filteredNodes = useMemo(() => {
    if (!query.trim()) return nodes;
    const q = query.toLowerCase();
    const matched = new Set(nodes.filter((n) => (n.data.label as string)?.toLowerCase().includes(q)).map((n) => n.id));
    edges.forEach((e) => {
      if (matched.has(e.source) || matched.has(e.target)) {
        matched.add(e.source);
        matched.add(e.target);
      }
    });
    return nodes.map((n) => ({
      ...n,
      style: { ...n.style, opacity: matched.has(n.id) ? 1 : 0.15 },
    }));
  }, [nodes, edges, query]);

  const edgeOptions = useMemo(() => ({ type: "smoothstep" as const, animated: true }), []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <div className="flex items-center gap-2">
          <Share2 size={16} className="text-cyan-400" />
          <span className="font-bold text-white">Stargate Graph</span>
          <span className="text-xs text-gray-500">— read-only lens on Mosaic Vault</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Query graph…"
              className="pl-7 pr-3 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 w-48"
            />
          </div>
          <button
            onClick={() => setLayoutDir((d) => (d === "TB" ? "LR" : "TB"))}
            className="flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 hover:text-white"
            title="Toggle layout direction"
          >
            <Maximize2 size={12} />
            {layoutDir === "TB" ? "↕" : "↔"}
          </button>
          <button
            onClick={() => {
              const { nodes: n, edges: e } = buildGraph(boxes, entries, agentNodes, staticNetworks, staticNodes);
              setNodes(layoutGraph(n, e, layoutDir));
              setEdges(e);
            }}
            className="flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 hover:text-white"
          >
            <RefreshCw size={12} />
            Reset
          </button>
          <button
            onClick={() => setShowLoopModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-cyan-900/30 border border-cyan-700/50 rounded text-xs text-cyan-300 hover:bg-cyan-900/50 hover:text-cyan-200 font-medium"
          >
            <GitBranch size={12} />
            Create Loop
          </button>
        </div>
      </div>

      {/* Bot Status Bar */}
      {botStatus && (
        <div className="flex items-center gap-4 px-3 py-2 bg-gray-900/50 border border-gray-800 rounded-lg mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${botStatus.running ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
            <span className="text-xs font-medium text-gray-300">Mosaic Bot</span>
            <span className="text-[10px] text-gray-500">{botStatus.running ? "Running" : "Idle"}</span>
          </div>
          {botStatus.lastHeartbeat && (
            <div className="text-[10px] text-gray-500">
              Last heartbeat: {Math.round((Date.now() - botStatus.lastHeartbeat) / 60000)}m ago
            </div>
          )}
          <div className="text-[10px] text-gray-500">Active agents: <span className="text-cyan-400">{botStatus.activeAgents}</span></div>
          <div className="ml-auto text-[10px] text-gray-600">
            {agentProfiles.length} AI agent{agentProfiles.length !== 1 ? "s" : ""} visible
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 min-h-[500px] bg-[#0b0f19] rounded-lg border border-gray-800 relative">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-3">
            <AlertCircle size={24} className="text-amber-400" />
            <span>{error}</span>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 hover:text-white"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <RefreshCw size={16} className="animate-spin mr-2" />
            Reading Mosaic Vault…
          </div>
        ) : (
          <ReactFlow
            nodes={filteredNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={edgeOptions}
            fitView
            attributionPosition="bottom-left"
          >
            <Background color="#1e293b" gap={20} size={1} />
            <Controls className="bg-gray-900 border-gray-700" />
            <MiniMap
              nodeColor={(n) => (n.data?.color as string) || "#64748b"}
              className="bg-gray-900 border border-gray-700 rounded"
              maskColor="rgba(15, 23, 42, 0.7)"
            />
            <Panel position="bottom-center">
              <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-900/90 border border-gray-700 rounded-full text-[10px] text-gray-400">
                {Object.entries(edgeStyles).map(([key, style]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className="w-2 h-0.5" style={{ background: style.color }} />
                    <span>{style.label}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-2 px-2 text-[10px] text-gray-500">
        <span>{boxes.length} vault boxes</span>
        <span>{entries.length} entries</span>
        <span>{nodes.length} graph nodes</span>
        <span>{edges.length} edges</span>
        <span className="ml-auto flex items-center gap-1">
          <Lock size={10} />
          Read-only — Mosaic Vault is the source of truth
        </span>
      </div>
      {/* Loop Builder Modal */}
      {showLoopModal && <LoopBuilderModal onClose={() => setShowLoopModal(false)} />}
    </div>
  );
};

export const StargateGraphPanel: React.FC = () => (
  <ReactFlowProvider>
    <GraphCanvas />
  </ReactFlowProvider>
);

export default StargateGraphPanel;
