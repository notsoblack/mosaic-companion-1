// =============================================================================
// STARGATE GRAPH PANEL — Radial Knowledge Constellation
//
// Inspired by Hermes radial memory graph. Concentric time rings with colored
// nodes and curved connections. Center = oldest, outer rings = newer.
//
// Core principle: Mosaic Companion owns the Vault. Stargate only READS from it.
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw, Search, ZoomIn, ZoomOut, Move, Info,
  Bot, Database, Zap, Globe, Server, Layers, GitBranch, Share2, Send,
} from "lucide-react";
import {
  INTERNAL_ADAPORTAL_STARGATE_URL,
} from "../../types/types";
import { LOOP_PRESETS } from "../../types/StargateLoop";
import LoopBuilderModal from "./LoopBuilderModal";
import MosaicBotBridge, { MosaicAgentProfile } from "../../services/stargate/MosaicBotBridge";

const botBridge = MosaicBotBridge;

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
  type?: "skill" | "memory" | "agent" | "mcp" | "loop";
}

interface RadialNode {
  id: string;
  label: string;
  angle: number;     // radians around the ring
  ring: number;      // which concentric ring (0 = center)
  radius: number;    // pixels from center
  color: string;
  type: "skill" | "memory" | "agent" | "mcp" | "loop" | "network";
  size: number;
  meta?: Record<string, any>;
  date?: Date;
}

interface RadialEdge {
  source: string;
  target: string;
  color: string;
  strength: number; // line opacity
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

/* ── Color Palette (matching Hermes style) ──────────────────────────────── */

const TYPE_COLORS: Record<string, string> = {
  skill:   "#3b82f6", // blue-500
  memory:  "#f97316", // orange-500
  agent:   "#22c55e", // green-500
  mcp:     "#a855f7", // purple-500
  loop:    "#06b6d4", // cyan-500
  network: "#eab308", // yellow-500
};

const TYPE_LABELS: Record<string, string> = {
  skill:   "Skill",
  memory:  "Memory",
  agent:   "Agent",
  mcp:     "MCP Tool",
  loop:    "Loop",
  network: "Network",
};

/* ── Radial Layout Engine ───────────────────────────────────────────────── */

function computeRadialLayout(
  entries: VaultEntry[],
  agents: MosaicAgentProfile[],
  width: number,
  height: number
): { nodes: RadialNode[]; edges: RadialEdge[]; rings: number } {
  if (entries.length === 0 && agents.length === 0) {
    return { nodes: [], edges: [], rings: 0 };
  }

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.42;
  const innerRadius = 60;

  // Group entries by date (weekly buckets)
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const maxAge = 12 * oneWeek; // 12 weeks

  const nodes: RadialNode[] = [];

  // Process Vault entries
  entries.forEach((entry, i) => {
    const date = entry.createdAt ? new Date(entry.createdAt) : new Date(now - (i * oneWeek * 0.5));
    const age = now - date.getTime();
    const normalizedAge = Math.min(age / maxAge, 1);
    const ring = Math.floor(normalizedAge * 5); // 0-5 rings, 0 = newest (outer)

    // Detect type from label/content
    let type: RadialNode["type"] = "memory";
    const label = entry.label.toLowerCase();
    if (label.includes("skill") || label.includes("template")) type = "skill";
    else if (label.includes("agent") || label.includes("bot")) type = "agent";
    else if (label.includes("mcp") || label.includes("tool")) type = "mcp";
    else if (label.includes("loop") || label.includes("workflow")) type = "loop";

    // Distribute evenly around the ring
    const angle = (i / Math.max(entries.length, 1)) * Math.PI * 2;
    const radius = innerRadius + (ring / 5) * (maxRadius - innerRadius);

    nodes.push({
      id: `entry-${entry.id}`,
      label: entry.label,
      angle,
      ring,
      radius,
      color: TYPE_COLORS[type],
      type,
      size: type === "skill" ? 6 : 4,
      date,
      meta: { boxId: entry.boxId, content: entry.content?.slice(0, 100) },
    });
  });

  // Process agents
  agents.forEach((agent, i) => {
    const angle = ((entries.length + i) / Math.max(entries.length + agents.length, 1)) * Math.PI * 2 + 0.5;
    const radius = maxRadius * 0.15; // Agents near center

    nodes.push({
      id: `agent-${agent.id}`,
      label: agent.name,
      angle,
      ring: -1, // Center ring
      radius,
      color: TYPE_COLORS["agent"],
      type: "agent",
      size: 8,
      meta: { provider: agent.provider, model: agent.model, skills: agent.skills?.length },
    });
  });

  // Generate edges — connect related nodes
  const edges: RadialEdge[] = [];
  const skillNodes = nodes.filter((n) => n.type === "skill");
  const memoryNodes = nodes.filter((n) => n.type === "memory");
  const agentNodes = nodes.filter((n) => n.type === "agent");

  // Connect agents to their nearest skills
  agentNodes.forEach((agent) => {
    skillNodes.slice(0, 3).forEach((skill, i) => {
      edges.push({
        source: agent.id,
        target: skill.id,
        color: "#22c55e33",
        strength: 0.3 + i * 0.1,
      });
    });
  });

  // Connect skills to memories (same box)
  skillNodes.forEach((skill) => {
    memoryNodes
      .filter((m) => m.meta?.boxId === skill.meta?.boxId)
      .slice(0, 2)
      .forEach((mem) => {
        edges.push({
          source: skill.id,
          target: mem.id,
          color: "#3b82f633",
          strength: 0.2,
        });
      });
  });

  // Cross-ring connections (temporal flow)
  for (let i = 0; i < nodes.length - 1; i++) {
    for (let j = i + 1; j < Math.min(i + 5, nodes.length); j++) {
      if (nodes[i].type === nodes[j].type && Math.abs(nodes[i].ring - nodes[j].ring) === 1) {
        edges.push({
          source: nodes[i].id,
          target: nodes[j].id,
          color: `${nodes[i].color}22`,
          strength: 0.15,
        });
      }
    }
  }

  return { nodes, edges, rings: 6 };
}

/* ── SVG Components ─────────────────────────────────────────────────────── */

const RadialEdgeLine: React.FC<{
  edge: RadialEdge;
  nodes: RadialNode[];
  cx: number;
  cy: number;
}> = ({ edge, nodes, cx, cy }) => {
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);
  if (!source || !target) return null;

  const x1 = cx + Math.cos(source.angle) * source.radius;
  const y1 = cy + Math.sin(source.angle) * source.radius;
  const x2 = cx + Math.cos(target.angle) * target.radius;
  const y2 = cy + Math.sin(target.angle) * target.radius;

  // Curved bezier
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const cpX = midX + (y2 - y1) * 0.2;
  const cpY = midY - (x2 - x1) * 0.2;

  return (
    <path
      d={`M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}`}
      stroke={edge.color}
      strokeWidth={edge.strength}
      fill="none"
      opacity={edge.strength}
    />
  );
};

const RadialNodeDot: React.FC<{
  node: RadialNode;
  cx: number;
  cy: number;
  onHover: (node: RadialNode | null) => void;
}> = ({ node, cx, cy, onHover }) => {
  const x = cx + Math.cos(node.angle) * node.radius;
  const y = cy + Math.sin(node.angle) * node.radius;

  return (
    <g
      onMouseEnter={() => onHover(node)}
      onMouseLeave={() => onHover(null)}
      className="cursor-pointer"
    >
      <circle
        cx={x}
        cy={y}
        r={node.size}
        fill={node.color}
        opacity={0.85}
      />
      <circle
        cx={x}
        cy={y}
        r={node.size + 2}
        fill="none"
        stroke={node.color}
        strokeWidth={0.5}
        opacity={0.3}
      />
      {node.size >= 6 && (
        <text
          x={x}
          y={y + node.size + 10}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize={8}
          fontFamily="monospace"
        >
          {node.label.length > 12 ? node.label.slice(0, 12) + "..." : node.label}
        </text>
      )}
    </g>
  );
};

/* ── Tooltip ────────────────────────────────────────────────────────────── */

const NodeTooltip: React.FC<{ node: RadialNode | null; cx: number; cy: number }> = ({ node, cx, cy }) => {
  if (!node) return null;
  const x = cx + Math.cos(node.angle) * node.radius;
  const y = cy + Math.sin(node.angle) * node.radius;

  return (
    <g transform={`translate(${x + 15}, ${y - 30})`}>
      <rect
        x={0}
        y={0}
        width={180}
        height={node.meta ? 70 : 40}
        rx={6}
        fill="#0f172a"
        stroke="#334155"
        strokeWidth={1}
      />
      <text x={8} y={16} fill={node.color} fontSize={11} fontWeight="bold">
        {TYPE_LABELS[node.type] || node.type}
      </text>
      <text x={8} y={32} fill="#e2e8f0" fontSize={9}>
        {node.label}
      </text>
      {node.date && (
        <text x={8} y={48} fill="#94a3b8" fontSize={8}>
          {node.date.toLocaleDateString()}
        </text>
      )}
      {node.meta?.provider && (
        <text x={8} y={60} fill="#94a3b8" fontSize={8}>
          {node.meta.provider} · {node.meta.model}
        </text>
      )}
    </g>
  );
};

/* ── Main Component ─────────────────────────────────────────────────────── */

export const StargateGraphPanel: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [boxes, setBoxes] = useState<VaultBox[]>([]);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<MosaicAgentProfile[]>([]);
  const [botStatus, setBotStatus] = useState<{
    running: boolean;
    lastHeartbeat?: number;
    nextHeartbeat?: number;
    activeAgents: number;
    pendingActions?: number;
    learnedPatterns?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<RadialNode | null>(null);
  const [showLoopModal, setShowLoopModal] = useState(false);
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // ── Mosaic Bot Chat State ────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "bot"; text: string; timestamp: number }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Listen for team-message events from BottomBar when on Stargate tab
  useEffect(() => {
    const handleTeamMessage = async (evt: any) => {
      const text = evt.detail?.text;
      if (!text) return;
      await sendToBot(text);
    };
    window.addEventListener("team-message", handleTeamMessage as any);
    return () => window.removeEventListener("team-message", handleTeamMessage as any);
  }, []);

  // Send message to Mosaic Bot and handle reply
  const sendToBot = async (text: string) => {
    setChatMessages((prev) => [...prev, { role: "user", text, timestamp: Date.now() }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const agentApi = (window as any).agent;
      if (agentApi?.send) {
        const result = await agentApi.send(text);
        if (result?.type === "reply" && result.text) {
          setChatMessages((prev) => [...prev, { role: "bot", text: result.text, timestamp: Date.now() }]);
        } else if (result?.type === "skill") {
          setChatMessages((prev) => [...prev, { role: "bot", text: `Executing skill: ${result.skill}`, timestamp: Date.now() }]);
        } else {
          setChatMessages((prev) => [...prev, { role: "bot", text: JSON.stringify(result), timestamp: Date.now() }]);
        }
      } else {
        setChatMessages((prev) => [...prev, { role: "bot", text: "Mosaic Bot not available. Check if mosaicbot preload is loaded.", timestamp: Date.now() }]);
      }
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: "bot", text: `Error: ${err.message}`, timestamp: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    sendToBot(chatInput.trim());
  };

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Vault boxes
        const vaultApi = getVaultApi();
        if (vaultApi) {
          const boxList = await vaultApi.getBoxes();
          if (!cancelled) {
            setBoxes(boxList.map((b: any) => ({
              id: String(b.id ?? b._id ?? b.boxId ?? Math.random()),
              name: String(b.name ?? b.title ?? "Unnamed"),
              description: b.description,
              sourceType: b.sourceType,
              entryCount: b.entryCount ?? 0,
              createdAt: b.createdAt,
            })));

            // Read entries from each box
            const allEntries: VaultEntry[] = [];
            for (const box of boxList.slice(0, 10)) {
              try {
                const contents = await vaultApi.getBoxContent(box.id);
                allEntries.push(...contents.map((c: any) => ({
                  id: String(c.id ?? c._id ?? Math.random()),
                  label: String(c.label ?? c.title ?? "Entry"),
                  content: String(c.content ?? c.body ?? ""),
                  boxId: String(box.id),
                  createdAt: c.createdAt,
                })));
              } catch (e) { /* skip */ }
            }
            if (!cancelled) setEntries(allEntries);
          }
        }

        // Agent profiles
        const profiles = await botBridge.getAgentProfiles();
        if (!cancelled) setAgentProfiles(profiles);

        const status = await botBridge.getOrchestratorStatus();
        if (!cancelled) setBotStatus(status);
      } catch (e) {
        console.error("[StargateGraph] Load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Compute layout
  const { nodes, edges, rings } = useMemo(() => {
    const filtered = query
      ? entries.filter((e) => e.label.toLowerCase().includes(query.toLowerCase()))
      : entries;
    return computeRadialLayout(filtered, agentProfiles, dimensions.width, dimensions.height);
  }, [entries, agentProfiles, dimensions, query]);

  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(0.3, Math.min(3, s * delta)));
  };

  // Ring labels (dates)
  const ringLabels = useMemo(() => {
    const labels: { angle: number; radius: number; text: string }[] = [];
    for (let r = 0; r < rings; r++) {
      const radius = 60 + (r / 5) * (Math.min(dimensions.width, dimensions.height) * 0.42 - 60);
      labels.push({
        angle: -Math.PI / 2,
        radius,
        text: r === 0 ? "now" : `${r * 2}w ago`,
      });
    }
    return labels;
  }, [rings, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0b0f19] relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Share2 size={16} className="text-cyan-400" />
          <div>
            <div className="text-sm font-bold text-white">Stargate Graph</div>
            <div className="text-[10px] text-gray-500">Radial view · {nodes.length} nodes · {edges.length} connections</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter nodes..."
              className="pl-7 pr-3 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 w-40 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
            className="p-1.5 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-white"
            title="Reset view"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => setScale((s) => s * 1.2)}
            className="p-1.5 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-white"
          >
            <ZoomIn size={12} />
          </button>
          <button
            onClick={() => setScale((s) => s * 0.8)}
            className="p-1.5 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-white"
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={() => setShowLoopModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-cyan-900/30 border border-cyan-700/50 rounded text-xs text-cyan-300 hover:bg-cyan-900/50"
          >
            <GitBranch size={12} />
            Create Loop
          </button>
        </div>
      </div>

      {/* Bot Status */}
      {botStatus && (
        <div className="absolute top-14 left-4 z-10 flex items-center gap-3 px-3 py-2 bg-gray-900/80 border border-gray-800 rounded-lg">
          <div className={`w-2 h-2 rounded-full ${botStatus.running ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
          <span className="text-[10px] text-gray-400">Mosaic Bot</span>
          <span className="text-[10px] text-gray-500">{botStatus.lastHeartbeat}</span>
          <span className="text-[10px] text-gray-500">Active: {botStatus.activeAgents}</span>
          <span className="text-[10px] text-cyan-600">{agentProfiles.length} agents</span>
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x + dimensions.width / 2}, ${pan.y + dimensions.height / 2}) scale(${scale}) translate(${-dimensions.width / 2}, ${-dimensions.height / 2})`}>
          {/* Concentric rings */}
          {Array.from({ length: rings }).map((_, r) => {
            const radius = 60 + (r / 5) * (Math.min(dimensions.width, dimensions.height) * 0.42 - 60);
            return (
              <g key={r}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={0.5}
                  strokeDasharray={r === 0 ? "none" : "2 4"}
                />
                <text
                  x={cx + radius + 5}
                  y={cy}
                  fill="#475569"
                  fontSize={8}
                  fontFamily="monospace"
                >
                  {r === 0 ? "now" : `${r * 2}w`}
                </text>
              </g>
            );
          })}

          {/* Ring date labels (rotated) */}
          {ringLabels.map((label, i) => (
            <text
              key={i}
              x={cx + Math.cos(label.angle) * label.radius}
              y={cy + Math.sin(label.angle) * label.radius - 8}
              textAnchor="middle"
              fill="#475569"
              fontSize={7}
              fontFamily="monospace"
            >
              {label.text}
            </text>
          ))}

          {/* Edges (behind nodes) */}
          {edges.map((edge, i) => (
            <RadialEdgeLine key={`edge-${i}`} edge={edge} nodes={nodes} cx={cx} cy={cy} />
          ))}

          {/* Nodes */}
          {nodes.map((node) => (
            <RadialNodeDot
              key={node.id}
              node={node}
              cx={cx}
              cy={cy}
              onHover={setHoveredNode}
            />
          ))}

          {/* Tooltip */}
          <NodeTooltip node={hoveredNode} cx={cx} cy={cy} />
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-4 flex items-center gap-4 px-3 py-2 bg-gray-900/80 border border-gray-800 rounded-lg">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[9px] text-gray-500">{TYPE_LABELS[type]}</span>
          </div>
        ))}
        <div className="w-px h-3 bg-gray-700 mx-1" />
        <div className="text-[9px] text-gray-600">
          {entries.length} entries · {agentProfiles.length} agents · {boxes.length} boxes
        </div>
      </div>

      {/* Stats */}
      <div className="absolute bottom-3 right-4 text-[9px] text-gray-600">
        Zoom: {Math.round(scale * 100)}% · Pan: {pan.x},{pan.y}
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f19]/80">
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Loading knowledge constellation...</span>
          </div>
        </div>
      )}

      {/* Mosaic Bot Chat Panel — Overlay on bottom-right of graph */}
      {chatMessages.length > 0 && (
        <div className="absolute bottom-16 right-4 z-20 w-80 max-h-56 overflow-auto bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl flex flex-col">
          <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-cyan-400" />
              <span className="text-xs font-bold text-cyan-300">Mosaic Bot</span>
            </div>
            <button
              onClick={() => setChatMessages([])}
              className="text-[9px] text-gray-500 hover:text-gray-300"
            >
              Clear
            </button>
          </div>
          <div className="p-3 space-y-2 overflow-auto">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`text-[11px] ${msg.role === "user" ? "text-indigo-300 text-right" : "text-gray-300 text-left"}`}>
                <span className="text-[8px] text-gray-600 mr-1">{msg.role === "user" ? "You" : "Bot"}</span>
                <br />
                {msg.text}
              </div>
            ))}
            {chatLoading && (
              <div className="text-[11px] text-gray-500 italic">Thinking...</div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Chat Input Bar inside Graph panel */}
      <form
        onSubmit={handleChatSubmit}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 w-[60%] max-w-lg bg-gray-900/90 border border-cyan-900/40 rounded-full px-4 py-2 shadow-lg"
      >
        <input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleChatSubmit();
            }
          }}
          placeholder="Ask Mosaic Bot..."
          className="flex-1 bg-transparent text-xs text-gray-100 placeholder-gray-600 outline-none border-none focus:ring-0"
        />
        <button
          type="submit"
          disabled={chatLoading || !chatInput.trim()}
          className="p-1.5 bg-cyan-900/40 hover:bg-cyan-800/60 rounded-full text-cyan-300 disabled:opacity-30 transition-colors"
        >
          <Send size={14} />
        </button>
      </form>

      {/* Loop Modal */}
      {showLoopModal && <LoopBuilderModal onClose={() => setShowLoopModal(false)} />}
    </div>
  );
};

export default StargateGraphPanel;
