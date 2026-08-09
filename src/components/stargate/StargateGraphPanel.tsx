// =============================================================================
// STARGATE GRAPH PANEL v3 — Hermes-Inspired Knowledge Constellation
//
// Design philosophy: Light, airy, temporal. Concentric time rings with
// variable-size nodes. Center = Stargate portal glyph. Edges = faint threads.
// Activity sparkline = real-time network pulse.
//
// Core principle: Mosaic Companion owns the Vault. Stargate only READS from it.
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw, Search, ZoomIn, ZoomOut, Send, X, Bot, Loader, Zap,
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

interface MCPServerLive {
  name: string;
  transport: string;
  initialized: boolean;
  toolCount: number;
  resourceCount: number;
}

interface NodeData {
  id: string;
  label: string;
  angle: number;      // radians
  ring: number;       // 0 = center (oldest), outer = newer
  radius: number;     // px from center
  color: string;
  type: "skill" | "memory" | "agent" | "mcp" | "loop" | "network" | "live-mcp";
  size: number;       // visual radius
  importance: number; // 0–1, drives size
  date?: Date;
  meta?: { boxId?: string; content?: string; provider?: string; model?: string; toolCount?: number };
  live?: boolean;     // true = currently connected MCP server
}

interface EdgeData {
  source: string;
  target: string;
  color: string;
  opacity: number;
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

/* ── Color Palette: Hermes Light Theme ───────────────────────────────────── */

const THEME = {
  bg: "#f8fafc",           // very light slate
  ring: "#e2e8f0",         // subtle gray-blue
  ringText: "#94a3b8",     // slate-400
  edge: "#cbd5e1",         // slate-300
  text: "#64748b",         // slate-500
  textDark: "#334155",     // slate-700
  tooltipBg: "#ffffff",
  tooltipBorder: "#e2e8f0",
  tooltipText: "#475569",
  accent: "#3b82f6",       // blue-500
};

const TYPE_STYLE: Record<string, { color: string; shape: "circle" | "diamond" | "hex"; label: string }> = {
  skill:     { color: "#3b82f6", shape: "circle",  label: "Skill" },
  memory:    { color: "#f97316", shape: "diamond", label: "Memory" },
  agent:     { color: "#22c55e", shape: "hex",     label: "Agent" },
  mcp:       { color: "#a855f7", shape: "circle",  label: "MCP" },
  "live-mcp": { color: "#10b981", shape: "hex",     label: "Live MCP" },
  loop:      { color: "#06b6d4", shape: "circle",  label: "Loop" },
  network:   { color: "#eab308", shape: "circle",  label: "Network" },
};

/* ── Time-based Ring Engine ─────────────────────────────────────────────── */

function computeLayout(
  entries: VaultEntry[],
  agents: MosaicAgentProfile[],
  mcpServers: MCPServerLive[],
  w: number,
  h: number
): { nodes: NodeData[]; edges: EdgeData[]; ringCount: number; dateLabels: { ring: number; label: string }[] } {
  // Defensive: filter out null/undefined entries and ensure arrays exist
  const safeEntries = (entries || []).filter(
    (e): e is VaultEntry => !!e && typeof e === "object" && !!e.id
  );
  const safeAgents = (agents || []).filter(
    (a): a is MosaicAgentProfile => !!a && typeof a === "object" && !!a.id
  );

  if (safeEntries.length === 0 && safeAgents.length === 0) {
    return { nodes: [], edges: [], ringCount: 0, dateLabels: [] };
  }

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.40;
  const innerR = 50;

  // ── Date bucketing ───────────────────────────────────────────────────────
  const now = Date.now();
  const oneDay = 86400000;
  const oneWeek = oneDay * 7;

  // Collect all dates — filter out obviously invalid ones
  const allDates = safeEntries
    .map((e) => {
      try {
        if (!e.createdAt) return now - Math.random() * 12 * oneWeek;
        let ts: number;
        if (typeof e.createdAt === "number") {
          ts = e.createdAt;
        } else {
          ts = new Date(e.createdAt).getTime();
        }
        // Sanity check: must be between 2000 and 2035
        const dt = new Date(ts);
        if (dt.getFullYear() < 2000 || dt.getFullYear() > 2035) {
          return now - Math.random() * 12 * oneWeek;
        }
        return ts;
      } catch {
        return now - Math.random() * 12 * oneWeek;
      }
    })
    .filter((d) => d > 0 && !isNaN(d));

  if (allDates.length === 0) {
    // Fallback: distribute evenly
    return buildFallbackLayout(safeEntries, safeAgents, mcpServers, w, h);
  }

  const oldest = Math.min(...allDates);
  const newest = Math.max(...allDates);
  const span = Math.max(newest - oldest, 1);

  // Adaptive ring count: fewer entries → fewer rings
  const ringCount = Math.min(6, Math.max(3, Math.ceil(safeEntries.length / 15)));
  const ringSpans: { min: number; max: number }[] = [];
  for (let r = 0; r < ringCount; r++) {
    const t0 = r / ringCount;
    const t1 = (r + 1) / ringCount;
    ringSpans.push({
      min: oldest + span * t0,
      max: oldest + span * t1,
    });
  }
  // Reverse: ring 0 = oldest (center), ring 5 = newest (outer)
  // Actually: center should be OLDEST, outer should be NEWEST
  // So ring 0 (center) = oldest time range, ring 5 = newest

  const nodes: NodeData[] = [];
  const edges: EdgeData[] = [];

  // Process entries into rings
  safeEntries.forEach((entry, i) => {
    let ts: number;
    try {
      if (!entry.createdAt) {
        ts = oldest + (i / safeEntries.length) * span;
      } else if (typeof entry.createdAt === "number") {
        const dt = new Date(entry.createdAt);
        if (dt.getFullYear() < 2000 || dt.getFullYear() > 2035) {
          ts = oldest + (i / safeEntries.length) * span;
        } else {
          ts = entry.createdAt;
        }
      } else {
        const dt = new Date(entry.createdAt);
        if (dt.getFullYear() < 2000 || dt.getFullYear() > 2035) {
          ts = oldest + (i / safeEntries.length) * span;
        } else {
          ts = dt.getTime();
        }
      }
    } catch {
      ts = oldest + (i / safeEntries.length) * span;
    }
    // Find which ring this belongs to (oldest = inner rings = lower index)
    let ring = 0;
    for (let r = 0; r < ringCount; r++) {
      if (ts >= ringSpans[r].min && ts <= ringSpans[r].max) {
        ring = r;
        break;
      }
    }
    // If newer than newest, put in outermost
    if (ts > newest) ring = ringCount - 1;

    // Detect type
    let type: NodeData["type"] = "memory";
    const label = (entry.label || "").toLowerCase();
    if (label.includes("skill") || label.includes("template")) type = "skill";
    else if (label.includes("agent") || label.includes("bot")) type = "agent";
    else if (label.includes("mcp") || label.includes("tool")) type = "mcp";
    else if (label.includes("loop") || label.includes("workflow")) type = "loop";

    // Importance based on content length
    const importance = Math.min(((entry.content || "").length) / 500, 1);
    const baseSize = 2 + importance * 4; // 2–6px

    // Distribute evenly within the ring
    const entriesInRing = safeEntries.filter((e) => {
      const ets = e.createdAt ? new Date(e.createdAt).getTime() : 0;
      return ets >= ringSpans[ring].min && ets <= ringSpans[ring].max;
    });
    const idxInRing = entriesInRing.findIndex((e) => e.id === entry.id);
    const ringIndex = idxInRing >= 0 ? idxInRing : i;
    const angle = (ringIndex / Math.max(entriesInRing.length, 1)) * Math.PI * 2 + ring * 0.3;

    const radius = innerR + (ring / (ringCount - 1)) * (maxR - innerR);

    nodes.push({
      id: `entry-${entry.id || i}`,
      label: entry.label || "Untitled",
      angle,
      ring,
      radius,
      color: TYPE_STYLE[type].color,
      type,
      size: baseSize,
      importance,
      date: new Date(ts),
      meta: { boxId: entry.boxId, content: (entry.content || "").slice(0, 120) },
    });
  });

  // Agents near center (core orchestrators)
  safeAgents.forEach((agent, i) => {
    const angle = (i / Math.max(safeAgents.length, 1)) * Math.PI * 2;
    const radius = innerR * 0.6; // Very center
    nodes.push({
      id: `agent-${agent.id || i}`,
      label: agent.name || "Agent",
      angle,
      ring: -1, // special center ring
      radius,
      color: TYPE_STYLE["agent"].color,
      type: "agent",
      size: 10,
      importance: 0.8,
      meta: { provider: agent.provider || "?", model: agent.model || "?" },
    });
  });

  // ── LIVE MCP Servers (outer ring) ─────────────────────────────────────────
  // These are NOT Vault entries — they are currently connected MCP servers
  // from Mosaic Companion's MCP panel. Placed on the outermost ring.
  if (mcpServers.length > 0) {
    const mcpRing = ringCount; // Outer ring beyond temporal rings
    const mcpRadius = maxR + 55; // Clearly outside temporal rings
    mcpServers.forEach((srv, i) => {
      const angle = (i / Math.max(mcpServers.length, 1)) * Math.PI * 2;
      nodes.push({
        id: `mcp-live-${srv.name}`,
        label: srv.name,
        angle,
        ring: mcpRing,
        radius: mcpRadius,
        color: TYPE_STYLE["live-mcp"].color,
        type: "live-mcp",
        size: 8 + Math.min(srv.toolCount / 8, 6), // 8–14px based on tool count
        importance: 0.9,
        live: true,
        meta: { toolCount: srv.toolCount },
      });
    });
    // Connect each MCP server to nearest skill node (faint green bridge)
    const skillNodes = nodes.filter((n) => n.type === "skill");
    mcpServers.forEach((srv, i) => {
      const mcpNode = nodes.find((n) => n.id === `mcp-live-${srv.name}`);
      if (!mcpNode || skillNodes.length === 0) return;
      const nearest = skillNodes[i % skillNodes.length];
      edges.push({
        source: mcpNode.id,
        target: nearest.id,
        color: TYPE_STYLE["live-mcp"].color,
        opacity: 0.12,
      });
    });
  }

  // Temporal: connect nodes in same box across adjacent rings
  const boxGroups = new Map<string, NodeData[]>();
  nodes.forEach((n) => {
    const bid = n.meta?.boxId;
    if (!bid) return;
    if (!boxGroups.has(bid)) boxGroups.set(bid, []);
    boxGroups.get(bid)!.push(n);
  });

  boxGroups.forEach((group) => {
    group.sort((a, b) => a.ring - b.ring);
    for (let i = 0; i < group.length - 1; i++) {
      const a = group[i];
      const b = group[i + 1];
      if (Math.abs(a.ring - b.ring) <= 2) {
        edges.push({
          source: a.id,
          target: b.id,
          color: TYPE_STYLE[a.type]?.color || TYPE_STYLE.memory.color,
          opacity: 0.15,
        });
      }
    }
  });

  // Cross-type: agents to skills
  const agentNodes = nodes.filter((n) => n.type === "agent");
  const skillNodes = nodes.filter((n) => n.type === "skill");
  agentNodes.forEach((agent) => {
    skillNodes.slice(0, 3).forEach((skill) => {
      edges.push({
        source: agent.id,
        target: skill.id,
        color: "#22c55e",
        opacity: 0.12,
      });
    });
  });

  // Date labels for rings
  const dateLabels: { ring: number; label: string }[] = [];
  for (let r = 0; r < ringCount; r++) {
    const midTs = (ringSpans[r].min + ringSpans[r].max) / 2;
    const d = new Date(midTs);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    dateLabels.push({ ring: r, label: d.toLocaleDateString("en-US", opts) });
  }

  return { nodes, edges, ringCount, dateLabels };
}

function buildFallbackLayout(
  entries: VaultEntry[],
  agents: MosaicAgentProfile[],
  mcpServers: MCPServerLive[],
  w: number,
  h: number
): { nodes: NodeData[]; edges: EdgeData[]; ringCount: number; dateLabels: { ring: number; label: string }[] } {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.40;
  const innerR = 50;
  const ringCount = 5;

  const nodes: NodeData[] = [];
  const allItems = [
    ...entries.map((e, i) => ({ ...e, kind: "entry" as const, idx: i })),
    ...agents.map((a, i) => ({ ...a, kind: "agent" as const, idx: i })),
  ];

  allItems.forEach((item, i) => {
    const ring = Math.floor((i / allItems.length) * ringCount);
    const angle = (i / Math.max(allItems.length, 1)) * Math.PI * 2;
    const radius = innerR + (ring / (ringCount - 1)) * (maxR - innerR);

    if ("kind" in item && item.kind === "agent") {
      nodes.push({
        id: `agent-${item.id || i}`,
        label: item.name || "Agent",
        angle,
        ring,
        radius,
        color: TYPE_STYLE["agent"].color,
        type: "agent",
        size: 10,
        importance: 0.8,
        meta: { provider: item.provider || "?", model: item.model || "?" },
      });
    } else {
      const entry = item as unknown as VaultEntry;
      let type: NodeData["type"] = "memory";
      const label = (entry.label || "").toLowerCase();
      if (label.includes("skill")) type = "skill";
      else if (label.includes("agent")) type = "agent";
      else if (label.includes("mcp")) type = "mcp";
      else if (label.includes("loop")) type = "loop";

      nodes.push({
        id: `entry-${entry.id || i}`,
        label: entry.label || "Untitled",
        angle,
        ring,
        radius,
        color: TYPE_STYLE[type].color,
        type,
        size: 5,
        importance: 0.3,
        meta: { boxId: entry.boxId },
      });
    }
  });

  const edges: EdgeData[] = [];
  return { nodes, edges, ringCount, dateLabels: [] };
}

/* ── SVG Helpers ────────────────────────────────────────────────────────── */

function polarToCartesian(cx: number, cy: number, angle: number, radius: number) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

/* ── Components ─────────────────────────────────────────────────────────── */

const ShapeNode: React.FC<{
  node: NodeData;
  cx: number;
  cy: number;
  onHover: (n: NodeData | null) => void;
  onClick: (n: NodeData) => void;
  isSelected: boolean;
  dimmed: boolean;
}> = ({ node, cx, cy, onHover, onClick, isSelected, dimmed }) => {
  const { x, y } = polarToCartesian(cx, cy, node.angle, node.radius);
  const style = TYPE_STYLE[node.type];
  const s = node.size;

  return (
    <g
      onMouseEnter={() => onHover(node)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node)}
      className="cursor-pointer"
      style={{
        transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s",
        transform: `translate(${x}px, ${y}px)`,
        opacity: dimmed ? 0.15 : 1,
      }}
    >
      {/* Shape centered at local origin */}
      {style.shape === "diamond" ? (
        <polygon points={`0,-${s} ${s},0 0,${s} -${s},0`} fill={node.color} opacity={0.9} />
      ) : style.shape === "hex" ? (
        <polygon
          points={`${s},0 ${s * 0.5},-${s * 0.866} -${s * 0.5},-${s * 0.866} -${s},0 -${s * 0.5},${s * 0.866} ${s * 0.5},${s * 0.866}`}
          fill={node.color}
          opacity={0.9}
        />
      ) : (
        <circle cx={0} cy={0} r={s} fill={node.color} opacity={0.85} />
      )}
      {/* Selection ring */}
      {isSelected && (
        <circle
          cx={0}
          cy={0}
          r={s + 5}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
          opacity={0.7}
        />
      )}
      {/* Glow ring for larger nodes */}
      {node.size > 5 && (
        <circle
          cx={0}
          cy={0}
          r={s + 3}
          fill="none"
          stroke={node.color}
          strokeWidth={0.5}
          opacity={0.2}
        />
      )}
      {/* Label for larger nodes */}
      {node.size > 5 && (
        <text
          x={0}
          y={s + 10}
          textAnchor="middle"
          fill={dimmed ? "#cbd5e1" : THEME.text}
          fontSize={6.5}
          fontFamily="system-ui, sans-serif"
          fontWeight={500}
        >
          {node.label.length > 14 ? node.label.slice(0, 14) + "…" : node.label}
        </text>
      )}
    </g>
  );
};

const EdgeLine: React.FC<{
  edge: EdgeData;
  nodes: NodeData[];
  cx: number;
  cy: number;
}> = ({ edge, nodes, cx, cy }) => {
  const src = nodes.find((n) => n.id === edge.source);
  const tgt = nodes.find((n) => n.id === edge.target);
  if (!src || !tgt) return null;

  const p1 = polarToCartesian(cx, cy, src.angle, src.radius);
  const p2 = polarToCartesian(cx, cy, tgt.angle, tgt.radius);

  // Subtle curve
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const cpX = midX + (p2.y - p1.y) * 0.15;
  const cpY = midY - (p2.x - p1.x) * 0.15;

  return (
    <path
      d={`M ${p1.x} ${p1.y} Q ${cpX} ${cpY} ${p2.x} ${p2.y}`}
      stroke={THEME.edge}
      strokeWidth={0.4}
      fill="none"
      opacity={Math.min(edge.opacity, 0.06)}
    />
  );
};

const CenterGlyph: React.FC<{ cx: number; cy: number; size: number }> = ({ cx, cy, size }) => {
  return (
    <g>
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={size} fill="none" stroke={THEME.ring} strokeWidth={0.8} opacity={0.6} />
      {/* Inner ring */}
      <circle cx={cx} cy={cy} r={size * 0.6} fill="none" stroke={THEME.ring} strokeWidth={0.4} opacity={0.4} />
      {/* Core dot */}
      <circle cx={cx} cy={cy} r={4} fill={THEME.accent} opacity={0.9} />
      {/* Small ring dots (8 evenly spaced) */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = size * 0.85;
        const { x, y } = polarToCartesian(cx, cy, angle, r);
        return <circle key={i} cx={x} cy={y} r={1.5} fill={THEME.ringText} opacity={0.5} />;
      })}
    </g>
  );
};
const ActivitySparkline: React.FC<{ data: number[]; width: number }> = ({ data, width }) => {
  if (data.length < 2) return null;
  const h = 28;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <g transform={`translate(0, 8)`}>
      {/* Faint area under line */}
      <polygon
        points={`0,${h} ${points.split(" ").join(" ")} ${width},${h}`}
        fill="#3b82f6"
        opacity={0.06}
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.2}
        opacity={0.6}
      />
      {/* Dots */}
      {data.map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * (h - 4) - 2;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={1.5}
            fill="#3b82f6"
            opacity={0.7}
          />
        );
      })}
    </g>
  );
};

const Tooltip: React.FC<{ node: NodeData | null; cx: number; cy: number }> = ({ node, cx, cy }) => {
  if (!node) return null;
  const { x, y } = polarToCartesian(cx, cy, node.angle, node.radius);
  const style = TYPE_STYLE[node.type];

  return (
    <g transform={`translate(${x + 14}, ${y - 40})`}>
      <rect
        x={0}
        y={0}
        width={190}
        height={node.meta?.provider ? 75 : node.meta?.content ? 85 : 55}
        rx={8}
        fill={THEME.tooltipBg}
        stroke={THEME.tooltipBorder}
        strokeWidth={1}
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.06))"
      />
      {/* Type indicator dot */}
      <circle cx={10} cy={14} r={3} fill={node.color} />
      <text x={18} y={17} fill={node.color} fontSize={10} fontWeight="600" fontFamily="system-ui, sans-serif">
        {style.label}
      </text>
      <text x={10} y={32} fill={THEME.tooltipText} fontSize={9} fontFamily="system-ui, sans-serif">
        {node.label}
      </text>
      {node.date && (
        <text x={10} y={46} fill={THEME.ringText} fontSize={8} fontFamily="monospace">
          {(() => {
            try {
              const yr = node.date.getFullYear();
              if (yr < 2000 || yr > 2035) return "—";
              return node.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            } catch {
              return "—";
            }
          })()}
        </text>
      )}
      {node.meta?.provider && (
        <text x={10} y={60} fill={THEME.ringText} fontSize={8} fontFamily="monospace">
          {node.meta.provider} · {node.meta.model}
        </text>
      )}
      {node.meta?.content && (
        <text x={10} y={node.meta.provider ? 72 : 58} fill={THEME.ringText} fontSize={7} fontFamily="system-ui, sans-serif">
          {node.meta.content.length > 60 ? node.meta.content.slice(0, 60) + "…" : node.meta.content}
        </text>
      )}
    </g>
  );
};

/* ── Main Component ─────────────────────────────────────────────────────── */

export const StargateGraphPanel: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 650 });
  const [boxes, setBoxes] = useState<VaultBox[]>([]);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<MosaicAgentProfile[]>([]);
  const [botStatus, setBotStatus] = useState<any>(null);
  const [mcpServers, setMcpServers] = useState<MCPServerLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<NodeData | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [showLoopModal, setShowLoopModal] = useState(false);

  // ── Agent Detail Panel Data (lazy-loaded when agent node clicked) ───────────
  const [agentDetail, setAgentDetail] = useState<{
    config: any | null;
    sessions: any[];
    mcps: { name: string; toolCount: number }[];
    loading: boolean;
  }>({ config: null, sessions: [], mcps: [], loading: false });

  useEffect(() => {
    if (!selectedNode || selectedNode.type !== "agent") {
      setAgentDetail({ config: null, sessions: [], mcps: [], loading: false });
      return;
    }
    let cancelled = false;
    (async () => {
      setAgentDetail((p) => ({ ...p, loading: true }));
      try {
        // 1. Agent config from aiAgents API
        let config: any = null;
        const agentsApi = (window as any).electronAPI?.aiAgents;
        if (agentsApi?.get) {
          const agents = await agentsApi.get();
          if (Array.isArray(agents)) {
            const match = agents.find(
              (a: any) =>
                a.name?.toLowerCase() === selectedNode.label.toLowerCase() ||
                (a.provider === selectedNode.meta?.provider && a.model === selectedNode.meta?.model)
            );
            if (match) config = match;
          }
        }
        // 2. Session history (last 5)
        let sessions: any[] = [];
        const histApi = (window as any).electronAPI?.aiAgentsHistory;
        if (histApi?.getAll && config?.id) {
          try {
            sessions = await histApi.getAll(config.id);
            if (!Array.isArray(sessions)) sessions = [];
          } catch (e) { sessions = []; }
        }
        // 3. Live MCP servers (shared pool)
        let mcps: { name: string; toolCount: number }[] = [];
        const mcpApi = (window as any).electronAPI?.mcpAPI;
        if (mcpApi?.listServers) {
          try {
            const servers = await mcpApi.listServers();
            if (Array.isArray(servers)) {
              mcps = servers
                .filter((s: any) => s.initialized === true && (s.tools ?? []).length > 0)
                .map((s: any) => ({ name: s.name, toolCount: (s.tools ?? []).length }));
            }
          } catch (e) {}
        }
        if (!cancelled) setAgentDetail({ config, sessions: sessions.slice(0, 5), mcps, loading: false });
      } catch (e) {
        console.error("[StargateGraph] Agent detail fetch failed:", e);
        if (!cancelled) setAgentDetail({ config: null, sessions: [], mcps: [], loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [selectedNode]);
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // ── Chat State ───────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "bot"; text: string; timestamp: number }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const handler = async (evt: any) => {
      const text = evt.detail?.text;
      if (!text) return;
      await sendToBot(text);
    };
    window.addEventListener("team-message", handler as any);
    return () => window.removeEventListener("team-message", handler as any);
  }, []);

  const sendToBot = async (text: string) => {
    // ── Build graph context summary (so Byron knows what he's looking at) ─────
    let graphContext = "";
    try {
      const total = nodes.length;
      const byType: Record<string, number> = {};
      nodes.forEach((n) => { byType[n.type] = (byType[n.type] || 0) + 1; });
      const topMemories = nodes
        .filter((n) => n.type === "memory" || n.type === "skill")
        .sort((a, b) => (b.importance || 0) - (a.importance || 0))
        .slice(0, 8)
        .map((n) => `- ${n.label} (${n.type}, importance ${(n.importance || 0).toFixed(2)})`)
        .join("\n");

      graphContext = `[STARGATE CONTEXT — ${total} nodes across ${ringCount} temporal rings]\n`;
      graphContext += `Memory breakdown:\n`;
      Object.entries(byType).forEach(([type, count]) => {
        graphContext += `  - ${TYPE_STYLE[type]?.label || type}: ${count} nodes\n`;
      });
      graphContext += `\nTop memories by importance:\n${topMemories}\n\n`;

      if (mcpServers.length > 0) {
        graphContext += `Connected MCP servers:\n`;
        mcpServers.forEach((s) => {
          graphContext += `  - ${s.name} (${s.toolCount} tools)\n`;
        });
        graphContext += `\n`;
      }

      graphContext += `When the user refers to 'nodes', 'memories', 'the graph', or 'Stargate Memory', they are referring to this Vault data.\n\n`;
    } catch (e) {
      console.warn("[StargateGraph] Graph context build failed:", e);
    }

    // ── Build MCP tool context ─────────────────────────────────────────────
    let mcpContext = "";
    try {
      const api = (window as any).electronAPI?.mcpAPI;
      if (api?.listServers) {
        const servers = await api.listServers();
        if (Array.isArray(servers) && servers.length > 0) {
          const connected = servers.filter((s: any) => s.initialized === true && (s.tools ?? []).length > 0);
          if (connected.length > 0) {
            mcpContext = "## Connected MCP Tools\n\nYou have access to the following tools. To use a tool, output its XML tag.\n\n";
            mcpContext += "CRITICAL RULES:\n";
            mcpContext += "1. When you want to use a tool, output ONLY a short intro sentence, then the <use_tool> XML tag.\n";
            mcpContext += "2. You MUST stop writing IMMEDIATELY after the closing </use_tool> tag.\n";
            mcpContext += "3. NEVER guess or hallucinate tool results. Wait for the actual tool output.\n";
            mcpContext += "4. After receiving [Tool Output], use that data to write your final response.\n";
            mcpContext += "5. ABSOLUTELY NEVER state prices, balances, numbers, or ANY live data before receiving [Tool Output].\n\n";
            for (const srv of connected) {
              mcpContext += `Server: ${srv.name}\n`;
              for (const tool of srv.tools ?? []) {
                mcpContext += `- Tool: ${tool.name}\n  Description: ${tool.description || "No description"}\n  Usage: <use_tool server="${srv.name}" tool="${tool.name}">{"arg":"value"}</use_tool>\n\n`;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("[StargateGraph] MCP context build failed:", e);
    }

    const fullContext = graphContext + mcpContext;
    const enrichedText = fullContext ? `${fullContext}\n\nUser: ${text}` : text;

    setChatMessages((p) => [...p, { role: "user", text, timestamp: Date.now() }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const api = (window as any).agent;
      if (api?.send) {
        const result = await api.send(enrichedText);
        if (result?.type === "reply" && result.text) {
          setChatMessages((p) => [...p, { role: "bot", text: result.text, timestamp: Date.now() }]);
        } else if (result?.type === "skill") {
          setChatMessages((p) => [...p, { role: "bot", text: `▸ Executing skill: ${result.skill}`, timestamp: Date.now() }]);
        } else {
          setChatMessages((p) => [...p, { role: "bot", text: JSON.stringify(result), timestamp: Date.now() }]);
        }
      } else {
        setChatMessages((p) => [...p, { role: "bot", text: "⏳ Mosaic Bot initializing…", timestamp: Date.now() }]);
      }
    } catch (err: any) {
      setChatMessages((p) => [...p, { role: "bot", text: `⚠ ${err.message}`, timestamp: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    sendToBot(chatInput.trim());
  };

  // ── Resize ───────────────────────────────────────────────────────────────
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

  // ── Load Data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
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

            const allEntries: VaultEntry[] = [];
            for (const box of boxList.slice(0, 10)) {
              try {
                const contents = await vaultApi.getBoxContent(box.id);
                if (!Array.isArray(contents)) continue;
                allEntries.push(...contents.filter((c: any) => !!c).map((c: any) => ({
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

        const profiles = await botBridge.getAgentProfiles();
        if (!cancelled) setAgentProfiles(profiles);

        const status = await botBridge.getOrchestratorStatus();
        if (!cancelled) setBotStatus(status);

        // ── Load LIVE MCP servers (not Vault entries) ────────────────────────
        try {
          const mcp = (window as any).electronAPI?.mcpAPI;
          if (mcp?.listServers) {
            const servers = await mcp.listServers();
            if (!cancelled && Array.isArray(servers)) {
              setMcpServers(
                servers.map((s: any) => ({
                  name: String(s.name ?? "unknown"),
                  transport: String(s.transport ?? "stdio"),
                  initialized: Boolean(s.initialized),
                  toolCount: (s.tools ?? []).length,
                  resourceCount: (s.resources ?? []).length,
                })),
              );
            }
          }
        } catch (e) {
          console.warn("[StargateGraph] MCP load failed:", e);
        }
      } catch (e) {
        console.error("[StargateGraph] Load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Layout ────────────────────────────────────────────────────────────────
  const { nodes, edges, ringCount, dateLabels } = useMemo(() => {
    // Pass ALL entries — filtering is visual (dimming) not structural
    const safeEntries = (entries || []).filter((e) => !!e && typeof e === "object");
    return computeLayout(safeEntries, agentProfiles, mcpServers, dimensions.width, dimensions.height);
  }, [entries, agentProfiles, mcpServers, dimensions]);

  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  // ── Auto-zoom to filtered nodes when searching ───────────────────────────
  useEffect(() => {
    if (!query) return; // Only zoom when searching
    const matches = nodes.filter((n) =>
      n.label.toLowerCase().includes(query.toLowerCase())
    );
    if (matches.length === 0) return;

    // Compute bounding box of matches in canvas coordinates
    const pts = matches.map((n) => polarToCartesian(cx, cy, n.angle, n.radius));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const boxW = maxX - minX + 60; // padding
    const boxH = maxY - minY + 60;

    // Zoom level that fits the box in the viewport
    const targetScale = Math.max(
      0.4,
      Math.min(
        2.5,
        Math.min(dimensions.width / boxW, dimensions.height / boxH)
      )
    );

    // Pan so the box center aligns with viewport center
    const boxCx = (minX + maxX) / 2;
    const boxCy = (minY + maxY) / 2;
    const targetPan = {
      x: (dimensions.width / 2 - boxCx * targetScale),
      y: (dimensions.height / 2 - boxCy * targetScale),
    };

    setScale(targetScale);
    setPan(targetPan);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Activity Sparkline Data (synthetic from entry timeline) ────────────────
  const sparklineData = useMemo(() => {
    const buckets = new Array(24).fill(0);
    (entries || []).forEach((e) => {
      if (!e) return;
      const h = e.createdAt ? new Date(e.createdAt).getHours() : Math.floor(Math.random() * 24);
      buckets[h]++;
    });
    return buckets.length > 0 ? buckets : new Array(24).fill(0).map(() => Math.random() * 10);
  }, [entries]);

  // ── Pan / Zoom ───────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const handleMouseUp = () => { isDragging.current = false; };
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setScale((s) => Math.max(0.3, Math.min(3.5, s * delta)));
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ backgroundColor: THEME.bg }}>
      {/* Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: THEME.textDark }}>Stargate Memory</div>
            <div className="text-[10px]" style={{ color: THEME.ringText }}>
              {nodes.length} nodes · {edges.length} connections · {ringCount} time rings
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: THEME.ringText }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="pl-8 pr-3 py-1 rounded-full text-xs border outline-none focus:border-blue-400 transition-colors"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#e2e8f0",
                color: THEME.textDark,
                width: 140,
              }}
            />
          </div>
          <button
            onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
            className="p-1.5 rounded-full border hover:bg-white/50 transition-colors"
            style={{ borderColor: "#e2e8f0", color: THEME.text }}
            title="Reset view"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => setScale((s) => s * 1.15)}
            className="p-1.5 rounded-full border hover:bg-white/50 transition-colors"
            style={{ borderColor: "#e2e8f0", color: THEME.text }}
          >
            <ZoomIn size={12} />
          </button>
          <button
            onClick={() => setScale((s) => s * 0.85)}
            className="p-1.5 rounded-full border hover:bg-white/50 transition-colors"
            style={{ borderColor: "#e2e8f0", color: THEME.text }}
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={() => setShowLoopModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:opacity-90"
            style={{ backgroundColor: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" }}
          >
            <span className="text-[10px]">⎇</span>
            Create Loop
          </button>
        </div>
      </div>

      {/* Activity Sparkline (top center) */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10">
        <svg width={280} height={36}>
          <ActivitySparkline data={sparklineData} width={280} />
        </svg>
      </div>

      {/* Bot Status Pill */}
      {botStatus && (
        <div
          className="absolute top-14 left-5 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px]"
          style={{ backgroundColor: "rgba(255,255,255,0.8)", backdropFilter: "blur(8px)", border: "1px solid #e2e8f0" }}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${botStatus.running ? "bg-green-500" : "bg-gray-400"}`} />
          <span style={{ color: THEME.text }}>Mosaic Bot</span>
          <span style={{ color: THEME.ringText }}>{botStatus.activeAgents} active</span>
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
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
          {/* Concentric time rings */}
          {Array.from({ length: ringCount }).map((_, r) => {
            const maxR = Math.min(dimensions.width, dimensions.height) * 0.40;
            const innerR = 50;
            const radius = innerR + (r / Math.max(ringCount - 1, 1)) * (maxR - innerR);
            return (
              <g key={`ring-${r}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={THEME.ring}
                  strokeWidth={0.6}
                  strokeDasharray={r === ringCount - 1 ? "none" : "3 6"}
                  opacity={0.7}
                />
                {/* Date label at top of ring */}
                {dateLabels[r] && (
                  <text
                    x={cx}
                    y={cy - radius - 6}
                    textAnchor="middle"
                    fill={THEME.ringText}
                    fontSize={8}
                    fontFamily="system-ui, sans-serif"
                    opacity={0.8}
                  >
                    {dateLabels[r].label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Center glyph */}
          <CenterGlyph cx={cx} cy={cy} size={38} />

          {/* Edges (behind nodes) */}
          {edges.map((edge, i) => (
            <EdgeLine key={`e-${i}`} edge={edge} nodes={nodes} cx={cx} cy={cy} />
          ))}

          {/* Nodes — viewport-culled for performance */}
          {(() => {
            const margin = 60;
            const vw = dimensions.width;
            const vh = dimensions.height;
            return nodes
              .map((node) => {
                const { x, y } = polarToCartesian(cx, cy, node.angle, node.radius);
                const sx = x * scale + pan.x;
                const sy = y * scale + pan.y;
                return { node, sx, sy, visible: sx > -margin && sx < vw + margin && sy > -margin && sy < vh + margin };
              })
              .filter((item) => item.visible)
              .map(({ node }) => {
                const isMatch = !query || node.label.toLowerCase().includes(query.toLowerCase());
                const shouldDim = query.length > 0 && !isMatch;
                return (
                  <ShapeNode
                    key={node.id}
                    node={node}
                    cx={cx}
                    cy={cy}
                    onHover={setHoveredNode}
                    onClick={setSelectedNode}
                    isSelected={selectedNode?.id === node.id}
                    dimmed={shouldDim}
                  />
                );
              });
          })()}

          {/* Tooltip */}
          <Tooltip node={hoveredNode} cx={cx} cy={cy} />
        </g>
      </svg>

      {/* Bottom Legend */}
      <div
        className="absolute bottom-3 left-4 z-10 flex items-center gap-4 px-3 py-2 rounded-lg text-[9px]"
        style={{ backgroundColor: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)", border: "1px solid #e2e8f0" }}
      >
        {Object.entries(TYPE_STYLE).map(([type, style]) => (
          <div key={type} className="flex items-center gap-1.5">
            {style.shape === "diamond" ? (
              <svg width={8} height={8} viewBox="0 0 8 8">
                <polygon points="4,0 8,4 4,8 0,4" fill={style.color} opacity={0.85} />
              </svg>
            ) : style.shape === "hex" ? (
              <svg width={8} height={8} viewBox="0 0 8 8">
                <polygon points="6,4 4.5,0.6 1.5,0.6 0,4 1.5,7.4 4.5,7.4" fill={style.color} opacity={0.85} />
              </svg>
            ) : (
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: style.color, opacity: 0.85 }} />
            )}
            <span style={{ color: THEME.text }}>{style.label}</span>
          </div>
        ))}
        <div className="w-px h-3 mx-1" style={{ backgroundColor: "#e2e8f0" }} />
        <span style={{ color: THEME.ringText }}>
          core = oldest · outer = newer
        </span>
      </div>

      {/* Bottom-right: date + download */}
      <div className="absolute bottom-3 right-4 z-10 text-[9px]" style={{ color: THEME.ringText }}>
        {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(248,250,252,0.8)" }}>
          <div className="flex items-center gap-2" style={{ color: THEME.text }}>
            <RefreshCw size={14} className="animate-spin" />
            <span className="text-xs">Loading memory constellation…</span>
          </div>
        </div>
      )}

      {/* Chat Overlay */}
      {chatMessages.length > 0 && (
        <div
          className="absolute bottom-16 right-4 z-20 w-80 max-h-56 overflow-auto rounded-xl shadow-lg flex flex-col"
          style={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #e2e8f0" }}
        >
          <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: "#f1f5f9" }}>
            <div className="flex items-center gap-2">
              <Bot size={13} className="text-blue-500" />
              <span className="text-xs font-semibold" style={{ color: THEME.textDark }}>Mosaic Bot</span>
            </div>
            <button onClick={() => setChatMessages([])} className="text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          </div>
          <div className="p-3 space-y-2 overflow-auto">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`text-[11px] leading-relaxed ${msg.role === "user" ? "text-right" : "text-left"}`}>
                <span className="text-[8px] font-medium mr-1" style={{ color: msg.role === "user" ? "#6366f1" : "#3b82f6" }}>
                  {msg.role === "user" ? "You" : "Bot"}
                </span>
                <div className={`inline-block px-2.5 py-1.5 rounded-lg text-left ${msg.role === "user" ? "rounded-tr-none" : "rounded-tl-none"}`}
                  style={{
                    backgroundColor: msg.role === "user" ? "#eef2ff" : "#f8fafc",
                    color: msg.role === "user" ? "#4338ca" : THEME.textDark,
                    border: `1px solid ${msg.role === "user" ? "#c7d2fe" : "#e2e8f0"}`,
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="text-[10px] italic" style={{ color: THEME.ringText }}>Thinking…</div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Chat Input Bar */}
      <form
        onSubmit={handleChatSubmit}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 w-[55%] max-w-md rounded-full px-4 py-2 shadow-md"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          border: "1px solid #e2e8f0",
          backdropFilter: "blur(12px)",
        }}
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
          placeholder="Ask Mosaic Bot…"
          className="flex-1 bg-transparent text-xs outline-none border-none focus:ring-0"
          style={{ color: THEME.textDark }}
        />
        <button
          type="submit"
          disabled={chatLoading || !chatInput.trim()}
          className="p-1.5 rounded-full transition-colors disabled:opacity-30"
          style={{ backgroundColor: chatInput.trim() ? "#3b82f6" : "#e2e8f0", color: chatInput.trim() ? "#fff" : "#94a3b8" }}
        >
          <Send size={13} />
        </button>
      </form>

      {/* Loop Modal */}
      {showLoopModal && <LoopBuilderModal onClose={() => setShowLoopModal(false)} />}

      {/* Node Detail Panel (slide-in from left) */}
      {selectedNode && (
        <div
          className="absolute top-14 left-4 z-30 w-72 max-h-[70%] overflow-auto rounded-xl shadow-lg"
          style={{
            backgroundColor: "rgba(255,255,255,0.97)",
            border: "1px solid #e2e8f0",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#f1f5f9" }}>
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: selectedNode.color }}
              />
              <span className="text-xs font-semibold" style={{ color: THEME.textDark }}>
                {TYPE_STYLE[selectedNode.type]?.label || selectedNode.type}
              </span>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Label */}
            <div>
              <div className="text-[9px] font-medium uppercase tracking-wider mb-1" style={{ color: THEME.ringText }}>
                Label
              </div>
              <div className="text-xs font-medium break-words" style={{ color: THEME.textDark }}>
                {selectedNode.label}
              </div>
            </div>

            {/* Type + Shape */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${selectedNode.color}15`, color: selectedNode.color }}>
                {selectedNode.type}
              </span>
              <span className="text-[10px]" style={{ color: THEME.ringText }}>
                {selectedNode.size.toFixed(1)}px · importance {(selectedNode.importance || 0).toFixed(2)}
              </span>
            </div>

            {/* Date */}
            {selectedNode.date && (
              <div>
                <div className="text-[9px] font-medium uppercase tracking-wider mb-1" style={{ color: THEME.ringText }}>
                  Date
                </div>
                <div className="text-xs" style={{ color: THEME.text }}>
                  {(() => {
                    try {
                      const yr = selectedNode.date!.getFullYear();
                      if (yr < 2000 || yr > 2035) return "—";
                      return selectedNode.date!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                    } catch {
                      return "—";
                    }
                  })()}
                </div>
              </div>
            )}

            {/* Content preview */}
            {selectedNode.meta?.content && (
              <div>
                <div className="text-[9px] font-medium uppercase tracking-wider mb-1" style={{ color: THEME.ringText }}>
                  Content Preview
                </div>
                <div className="text-[11px] leading-relaxed p-2 rounded-lg" style={{ backgroundColor: "#f8fafc", color: THEME.textDark, border: "1px solid #e2e8f0" }}>
                  {selectedNode.meta.content.length > 300
                    ? selectedNode.meta.content.slice(0, 300) + "…"
                    : selectedNode.meta.content}
                </div>
              </div>
            )}

            {/* Provider/Model */}
            {selectedNode.meta?.provider && (
              <div>
                <div className="text-[9px] font-medium uppercase tracking-wider mb-1" style={{ color: THEME.ringText }}>
                  Provider
                </div>
                <div className="text-xs font-mono" style={{ color: THEME.text }}>
                  {selectedNode.meta.provider} · {selectedNode.meta.model}
                </div>
              </div>
            )}

            {/* Tool Count */}
            {selectedNode.meta?.toolCount !== undefined && (
              <div>
                <div className="text-[9px] font-medium uppercase tracking-wider mb-1" style={{ color: THEME.ringText }}>
                  Tools Available
                </div>
                <div className="text-xs" style={{ color: THEME.text }}>
                  {selectedNode.meta.toolCount} tools
                </div>
              </div>
            )}

            {/* Box ID */}
            {selectedNode.meta?.boxId && (
              <div>
                <div className="text-[9px] font-medium uppercase tracking-wider mb-1" style={{ color: THEME.ringText }}>
                  Vault Box
                </div>
                <div className="text-[10px] font-mono" style={{ color: THEME.text }}>
                  {selectedNode.meta.boxId}
                </div>
              </div>
            )}

            {/* ═══════ Agent Capability Map (Phase 1) ═══════ */}
            {selectedNode.type === "agent" && (
              <div className="border-t border-gray-200/50 pt-3 space-y-3">
                {/* Loading state */}
                {agentDetail.loading && (
                  <div className="flex items-center gap-2 py-1">
                    <Loader size={12} className="animate-spin text-cyan-500" />
                    <span className="text-[10px] text-gray-400">Loading agent data…</span>
                  </div>
                )}

                {/* ── Skills ── */}
                {agentDetail.config?.skills?.length > 0 && (
                  <div>
                    <div className="text-[9px] font-medium uppercase tracking-wider mb-1.5" style={{ color: THEME.ringText }}>
                      Skills ({agentDetail.config.skills.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {agentDetail.config.skills.map((skill: string) => (
                        <span
                          key={skill}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium border"
                          style={{ backgroundColor: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd' }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── MCP Access ── */}
                {agentDetail.mcps.length > 0 && (
                  <div>
                    <div className="text-[9px] font-medium uppercase tracking-wider mb-1.5" style={{ color: THEME.ringText }}>
                      MCP Access ({agentDetail.mcps.length} servers)
                    </div>
                    <div className="space-y-1">
                      {agentDetail.mcps.map((mcp) => (
                        <div key={mcp.name} className="flex items-center justify-between text-[10px]">
                          <span className="flex items-center gap-1">
                            <Zap size={10} className="text-emerald-500" />
                            {mcp.name}
                          </span>
                          <span className="text-gray-400">{mcp.toolCount} tools</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1 text-right">
                      {agentDetail.mcps.reduce((s, m) => s + m.toolCount, 0)} total tools
                    </div>
                  </div>
                )}

                {/* ── Recent Sessions ── */}
                {agentDetail.sessions.length > 0 && (
                  <div>
                    <div className="text-[9px] font-medium uppercase tracking-wider mb-1.5" style={{ color: THEME.ringText }}>
                      Recent Sessions ({agentDetail.sessions.length})
                    </div>
                    <div className="space-y-1">
                      {agentDetail.sessions.map((sess: any) => (
                        <div key={sess.id || Math.random()} className="flex items-center justify-between text-[10px]">
                          <span className="truncate max-w-[140px]" style={{ color: THEME.text }}>
                            {sess.title || sess.id || 'Session'}
                          </span>
                          <span className="text-gray-400 shrink-0">
                            {(() => {
                              try {
                                const ts = sess.timestamp || sess.createdAt || sess.lastMessageAt;
                                if (!ts) return '—';
                                return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                              } catch { return '—'; }
                            })()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Config snapshot ── */}
                {agentDetail.config && (
                  <div>
                    <div className="text-[9px] font-medium uppercase tracking-wider mb-1.5" style={{ color: THEME.ringText }}>
                      Config
                    </div>
                    <div className="space-y-0.5 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-gray-400">ID</span>
                        <span className="font-mono" style={{ color: THEME.text }}>{agentDetail.config.id?.slice(0, 8)}…</span>
                      </div>
                      {agentDetail.config.systemPrompt && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">System Prompt</span>
                          <span style={{ color: THEME.text }}>{agentDetail.config.systemPrompt.length > 20 ? agentDetail.config.systemPrompt.slice(0, 20) + '…' : agentDetail.config.systemPrompt}</span>
                        </div>
                      )}
                      {agentDetail.config.temperature !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Temperature</span>
                          <span style={{ color: THEME.text }}>{agentDetail.config.temperature}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  const parts: string[] = [
                    `🔍 About this graph node: "${selectedNode.label}"`,
                    `Type: ${selectedNode.type}`,
                  ];
                  if (selectedNode.date) parts.push(`Date: ${selectedNode.date.toLocaleDateString()}`);
                  if (selectedNode.importance) parts.push(`Importance: ${selectedNode.importance.toFixed(2)}`);
                  if (selectedNode.meta?.provider) parts.push(`Provider: ${selectedNode.meta.provider}`);
                  if (selectedNode.meta?.model) parts.push(`Model: ${selectedNode.meta.model}`);
                  if (selectedNode.meta?.boxId) parts.push(`Vault Box: ${selectedNode.meta.boxId}`);
                  if (selectedNode.meta?.content) {
                    const c = String(selectedNode.meta.content);
                    parts.push(`Content:\n${c.length > 600 ? c.slice(0, 600) + '…' : c}`);
                  }
                  if (selectedNode.meta?.toolCount) parts.push(`Tools: ${selectedNode.meta.toolCount}`);
                  // Agent detail enrichment
                  if (selectedNode.type === "agent" && agentDetail.config) {
                    parts.push(`\n📋 Agent Configuration:`);
                    if (agentDetail.config.id) parts.push(`  ID: ${agentDetail.config.id}`);
                    if (agentDetail.config.skills?.length) {
                      parts.push(`  Skills: ${agentDetail.config.skills.join(', ')}`);
                    }
                    if (agentDetail.config.systemPrompt) {
                      const sp = String(agentDetail.config.systemPrompt).slice(0, 200);
                      parts.push(`  System Prompt: ${sp}${agentDetail.config.systemPrompt.length > 200 ? '…' : ''}`);
                    }
                    if (agentDetail.config.temperature !== undefined) {
                      parts.push(`  Temperature: ${agentDetail.config.temperature}`);
                    }
                    if (agentDetail.mcps.length) {
                      parts.push(`\n🔗 MCP Access:`);
                      agentDetail.mcps.forEach((m) => parts.push(`  • ${m.name} (${m.toolCount} tools)`));
                    }
                    if (agentDetail.sessions.length) {
                      parts.push(`\n💬 Recent Sessions:`);
                      agentDetail.sessions.forEach((s: any) => parts.push(`  • ${s.title || s.id || 'Session'}`));
                    }
                  }
                  parts.push(`\nExplain what this node means in the broader Stargate Memory graph.`);
                  sendToBot(parts.join('\n'));
                  setSelectedNode(null);
                }}
                className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors hover:opacity-90"
                style={{ backgroundColor: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" }}
              >
                Ask about this
              </button>
              <button
                onClick={() => setSelectedNode(null)}
                className="px-3 py-1.5 rounded-lg text-[11px] transition-colors hover:bg-gray-100"
                style={{ color: THEME.ringText, border: "1px solid #e2e8f0" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StargateGraphPanel;
