// =============================================================================
// ACTIVITY FEED — Unified logging panel for all Stargate systems
// Collects logs from: Node Manager, Midnight City, Loops, MCP, Vault, Web3
// =============================================================================

import React, { useState, useRef, useEffect } from "react";
import { useStargateStore } from "../../stores/stargateStore";
import { Terminal, Trash2, Download, Filter, ChevronDown } from "lucide-react";

const SOURCE_COLORS: Record<string, { dot: string; text: string }> = {
  midnight: { dot: "bg-pink-400", text: "text-pink-400" },
  nodeManager: { dot: "bg-blue-400", text: "text-blue-400" },
  loopEngine: { dot: "bg-purple-400", text: "text-purple-400" },
  mcp: { dot: "bg-cyan-400", text: "text-cyan-400" },
  vault: { dot: "bg-emerald-400", text: "text-emerald-400" },
  web3: { dot: "bg-amber-400", text: "text-amber-400" },
  sidebar: { dot: "bg-gray-400", text: "text-gray-400" },
  default: { dot: "bg-gray-500", text: "text-gray-400" },
};

const LEVEL_ICONS: Record<string, string> = {
  info: "🔵",
  warn: "🟡",
  error: "🔴",
  success: "🟢",
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const ActivityFeed: React.FC = () => {
  const { logs, clearLogs, addLog } = useStargateStore();
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sources = Array.from(new Set(logs.map((l) => l.source)));
  const filtered = filterSource ? logs.filter((l) => l.source === filterSource) : logs;

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  const handleExport = () => {
    const text = filtered
      .map((l) => `[${fmtTime(l.time)}] [${l.source}] ${l.level.toUpperCase()}: ${l.message}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stargate-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("sidebar", "info", "Activity feed exported");
  };

  return (
    <div className={`flex flex-col bg-gray-950 border-t border-gray-800 transition-all duration-200 ${expanded ? "h-48" : "h-9"}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            title={expanded ? "Collapse" : "Expand"}
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
          </button>
          <Terminal size={13} className="text-cyan-400" />
          <span className="text-xs font-semibold text-gray-300">Activity Feed</span>
          <span className="text-[10px] text-gray-500 ml-1">({filtered.length})</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Source filter */}
          <select
            value={filterSource || ""}
            onChange={(e) => setFilterSource(e.target.value || null)}
            className="text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Auto-scroll toggle */}
          <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-0"
            />
            Auto-scroll
          </label>

          <button
            onClick={handleExport}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
            title="Export logs"
          >
            <Download size={12} />
          </button>

          <button
            onClick={() => {
              clearLogs();
              addLog("sidebar", "info", "Activity feed cleared");
            }}
            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
            title="Clear logs"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Log entries */}
      {expanded && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-xs font-mono"
          style={{ scrollbarWidth: "thin" }}
        >
          {filtered.length === 0 ? (
            <div className="text-gray-600 text-center py-4">
              No activity yet. Actions will appear here.
            </div>
          ) : (
            filtered.map((log) => {
              const colors = SOURCE_COLORS[log.source] || SOURCE_COLORS.default;
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 py-0.5 hover:bg-gray-900/50 rounded px-1 transition-colors"
                >
                  <span className="text-gray-600 shrink-0 w-16 text-right">
                    {fmtTime(log.time)}
                  </span>
                  <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${colors.dot}`}
                  />
                  <span className={`font-semibold shrink-0 w-20 truncate ${colors.text}`}>
                    {log.source}
                  </span>
                  <span className="text-gray-300 break-all">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;
