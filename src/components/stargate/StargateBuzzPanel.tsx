import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plug, Unplug, RefreshCw, Activity, Terminal, ShieldAlert,
  Settings, Save, X, Eye, Radio, Clock, Hash, MessageSquare,
  Send, AlertTriangle, CheckCircle2, Copy, Ban, Zap,
  Target, Globe,
} from "lucide-react";
import { toast } from "react-toastify";
import { AgentJobsPanel } from "./AgentJobsPanel";
import { StargateNavigatorPanel } from "./StargateNavigatorPanel";

// ── Types ──────────────────────────────────────────────────────────

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

interface BuzzEventLog {
  id: string;
  type: "event" | "auth_challenge" | "notice" | "connected" | "disconnected" | "error" | "subscribe_ack";
  timestamp: number;
  payload?: any;
}

interface BuzzStatus {
  connected: boolean;
  relayUrl: string;
  pubkey: string | null;
  channelSubscriptions: number;
  lastEventTime: number | null;
  error: string | null;
}

interface ChannelSub {
  id: string;
  channelUuid: string;
  createdAt: number;
  eventCount: number;
}

// ── Component ─────────────────────────────────────────────────────

interface StargateBuzzPanelProps {
  userAgents?: any[];
}

/** Sub-tab IDs for the Buzz panel */
type BuzzSubTab = "relay" | "jobs" | "navigator";

export const StargateBuzzPanel: React.FC<StargateBuzzPanelProps> = ({ userAgents = [] }) => {
  // ── Sub-tab state ──────────────────────────────────────────────
  const [activeSubTab, setActiveSubTab] = useState<BuzzSubTab>("relay");
  // ── State ────────────────────────────────────────────────────────
  const [status, setStatus] = useState<BuzzStatus>({
    connected: false,
    relayUrl: "wss://hpec-stargate.communities.buzz.xyz",
    pubkey: null,
    channelSubscriptions: 0,
    lastEventTime: null,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [configRelay, setConfigRelay] = useState("wss://hpec-stargate.communities.buzz.xyz");
  const [savingConfig, setSavingConfig] = useState(false);

  // Event log (read-only)
  const [events, setEvents] = useState<BuzzEventLog[]>([]);
  const [eventFilter, setEventFilter] = useState<"all" | "event" | "auth_challenge" | "notice" | "error">("all");
  const eventsRef = useRef<BuzzEventLog[]>([]);
  const MAX_EVENTS = 200;

  // Channel subscriptions
  const [channels, setChannels] = useState<ChannelSub[]>([]);

  // NIP-07 extension detection
  const [nip07Detected, setNip07Detected] = useState(false);
  const [nip07Checked, setNip07Checked] = useState(false);

  // Auth challenge state
  const [authChallenge, setAuthChallenge] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"none" | "received" | "required">("none");

  // Deploy form (read-only — shows error on attempt)
  const [taskText, setTaskText] = useState("");
  const [selectedChannelTag, setSelectedChannelTag] = useState("hpec-stargate");

  // ── NIP-07 detection ───────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const hasNip07 = typeof window !== "undefined" && !!(window as any).nostr;
      setNip07Detected(hasNip07);
      setNip07Checked(true);
    };
    check();
    // Re-check periodically in case extension is installed after load
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── Load status ──────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const s = await (window as any).chatAPI?.buzzStatus?.();
      if (s) setStatus(s);
    } catch (e) {
      console.error("[BuzzPanel] status error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(() => loadStatus(), 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // ── Event log collector ──────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = (window as any).chatAPI?.onBuzzIncomingMessage?.((event: any) => {
      const now = Date.now();
      const entry: BuzzEventLog = {
        id: event.id || `evt-${now}-${Math.random().toString(36).slice(2, 8)}`,
        type: "event",
        timestamp: event.created_at ? event.created_at * 1000 : now,
        payload: event,
      };
      eventsRef.current = [entry, ...eventsRef.current].slice(0, MAX_EVENTS);
      setEvents([...eventsRef.current]);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ── Listen for bridge status events (auth_challenge, notice, etc) ─
  useEffect(() => {
    // The bridge emits buzz_event via the EventEmitter, but the renderer
    // only gets incoming messages through onBuzzIncomingMessage. For auth
    // challenges and notices, we rely on the status polling + any messages
    // that come through the IPC channel.
    //
    // We'll simulate auth challenge detection by checking status.error for
    // auth-related strings, and by monitoring events for kind 22242 (AUTH).
    const checkAuth = () => {
      const recent = eventsRef.current.slice(0, 10);
      const authEvt = recent.find(e => e.type === "event" && e.payload?.kind === 22242);
      if (authEvt) {
        setAuthChallenge("detected");
        setAuthStatus("received");
      }
      // Also check if status has an auth-related error
      if (status.error?.toLowerCase().includes("auth") || status.error?.toLowerCase().includes("challenge")) {
        setAuthStatus("required");
      }
    };
    const interval = setInterval(checkAuth, 3000);
    return () => clearInterval(interval);
  }, [status.error]);

  // ── Channel subscription manager ─────────────────────────────────
  const handleSubscribe = useCallback(async (channelUuid: string) => {
    try {
      const result = await (window as any).chatAPI?.buzzSubscribe?.(channelUuid);
      if (result?.success && result?.subId) {
        setChannels(prev => [...prev, {
          id: result.subId,
          channelUuid,
          createdAt: Date.now(),
          eventCount: 0,
        }]);
        toast.success(`Subscribed to ${channelUuid}`);
      } else {
        throw new Error(result?.error || "Subscribe failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Subscribe failed");
    }
  }, []);

  const handleUnsubscribe = useCallback(async (subId: string) => {
    try {
      await (window as any).chatAPI?.buzzUnsubscribe?.(subId);
      setChannels(prev => prev.filter(c => c.id !== subId));
      toast.success("Unsubscribed");
    } catch (e: any) {
      toast.error(e.message || "Unsubscribe failed");
    }
  }, []);

  // ── Config ─────────────────────────────────────────────────────
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await (window as any).chatAPI?.buzzSetRelay?.(configRelay);
      toast.success("Relay updated — reconnecting…");
      setShowConfig(false);
      await loadStatus();
    } catch (e: any) {
      toast.error(e.message || "Failed to save config");
    } finally {
      setSavingConfig(false);
    }
  };

  // ── Deploy (read-only error) ───────────────────────────────────
  const handleDeploy = async () => {
    toast.error(
      "Publishing is disabled in read-only mode. Install a NIP-07 extension (nos2x, Alby) to sign and publish events.",
      { autoClose: 6000 }
    );
  };

  // ── Helpers ──────────────────────────────────────────────────────
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleTimeString();
  };

  const formatAge = (ts: number | null) => {
    if (!ts) return "—";
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  };

  const filteredEvents = events.filter(e => eventFilter === "all" || e.type === eventFilter);

  const statusBadge = () => {
    if (status.connected) {
      return (
        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded-full border border-emerald-500/30 flex items-center gap-1">
          <Radio size={10} className="animate-pulse" /> Connected
        </span>
      );
    }
    if (status.error) {
      return (
        <span className="px-2 py-0.5 bg-red-500/20 text-red-300 text-xs rounded-full border border-red-500/30 flex items-center gap-1">
          <AlertTriangle size={10} /> Error
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-gray-700/40 text-gray-400 text-xs rounded-full border border-gray-600/30 flex items-center gap-1">
        <Ban size={10} /> Disconnected
      </span>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-3" />
        Loading Buzz Relay Dashboard…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-gray-200">
      {/* ═══════════════════════════════════════════════════════════
          SUB-TAB BAR (Relay | Jobs | Navigator)
          ═══════════════════════════════════════════════════════════ */}
      <div className="px-6 pt-4 flex items-center gap-1 border-b border-gray-800">
        {[
          { id: "relay" as const, label: "Relay", icon: Radio },
          { id: "jobs" as const, label: "Agent Jobs", icon: Target },
          { id: "navigator" as const, label: "Navigator", icon: Globe },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${
              activeSubTab === tab.id
                ? "border-amber-500 text-amber-400 bg-amber-500/10"
                : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            }`}
          >
            <tab.icon size={12} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════ */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
              <Radio size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Buzz Relay Dashboard</h2>
              <p className="text-xs text-gray-400">Read-only Nostr relay monitor — no keys held by Mosaic</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge()}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 flex items-center gap-1"
            >
              <Settings size={12} /> Config
            </button>
          </div>
        </div>

        {/* NIP-07 Extension Status */}
        <div className={`mb-4 p-3 rounded-lg border flex items-start gap-3 ${
          nip07Detected
            ? "bg-emerald-900/20 border-emerald-700/40"
            : "bg-amber-900/20 border-amber-700/40"
        }`}>
          {nip07Detected ? (
            <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <ShieldAlert size={16} className="text-amber-400 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <div className="text-sm font-medium">
              {nip07Detected ? "NIP-07 Extension Detected" : "No NIP-07 Extension Found"}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {nip07Detected
                ? "A Nostr signing extension is installed. Future publishing support can use this for secure, browser-based signing."
                : "Install nos2x, Alby, or another NIP-07 extension to enable secure publishing without exposing keys to Mosaic."}
            </div>
          </div>
        </div>

        {/* Config Panel */}
        {showConfig && (
          <div className="mb-4 p-4 bg-gray-900/60 border border-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Settings size={14} /> Relay Configuration
              </h3>
              <button onClick={() => setShowConfig(false)} className="text-gray-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Relay URL</label>
                <input
                  type="text"
                  value={configRelay}
                  onChange={e => setConfigRelay(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="wss://relay.example.com"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Default Channel Tag</label>
                <input
                  type="text"
                  value={selectedChannelTag}
                  onChange={e => setSelectedChannelTag(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="hpec-stargate"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save size={12} /> {savingConfig ? "Saving…" : "Save & Connect"}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            CONNECTION HEALTH
            ═══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="p-3 bg-gray-900/40 border border-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <Radio size={10} /> Relay
            </div>
            <div className="text-sm text-white font-mono truncate" title={status.relayUrl}>
              {status.relayUrl}
            </div>
          </div>
          <div className="p-3 bg-gray-900/40 border border-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <Clock size={10} /> Last Event
            </div>
            <div className="text-sm text-white">{formatAge(status.lastEventTime)}</div>
            <div className="text-xs text-gray-500">{formatTime(status.lastEventTime)}</div>
          </div>
          <div className="p-3 bg-gray-900/40 border border-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <Hash size={10} /> Subscriptions
            </div>
            <div className="text-sm text-white">{status.channelSubscriptions}</div>
          </div>
          <div className="p-3 bg-gray-900/40 border border-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <ShieldAlert size={10} /> NIP-42 Auth
            </div>
            <div className={`text-sm font-medium ${
              authStatus === "received" ? "text-amber-400" :
              authStatus === "required" ? "text-red-400" :
              "text-emerald-400"
            }`}>
              {authStatus === "received" ? "Challenge Received" :
               authStatus === "required" ? "Auth Required" :
               "Not Required"}
            </div>
            {authStatus === "received" && (
              <div className="text-xs text-gray-500 mt-0.5">
                Relay sent AUTH challenge. Read-only mode — signing disabled.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          RELAY TAB CONTENT
          ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "relay" && (
        <>
          {/* ═══════════════════════════════════════════════════════════
              CHANNEL SUBSCRIPTION MANAGER
              ═══════════════════════════════════════════════════════════ */}
          <div className="p-6 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Zap size={14} /> Channel Subscriptions
            </h3>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={selectedChannelTag}
                onChange={e => setSelectedChannelTag(e.target.value)}
                className="flex-1 max-w-xs px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                placeholder="Channel UUID or tag"
              />
              <button
                onClick={() => handleSubscribe(selectedChannelTag)}
                disabled={!status.connected || !selectedChannelTag.trim()}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg flex items-center gap-1.5"
              >
                <Plug size={14} /> Subscribe
              </button>
            </div>
            {channels.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                No active subscriptions. Connect to relay and subscribe to a channel.
              </div>
            ) : (
              <div className="space-y-2">
                {channels.map(ch => (
                  <div key={ch.id} className="p-3 bg-gray-900/40 border border-gray-800 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Radio size={14} className="text-emerald-400" />
                      <div>
                        <div className="text-sm text-white font-mono">{ch.channelUuid}</div>
                        <div className="text-xs text-gray-400">
                          Sub ID: {ch.id.slice(0, 16)}… · {ch.eventCount} events
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnsubscribe(ch.id)}
                      className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 text-xs rounded border border-red-700/40 flex items-center gap-1"
                    >
                      <Unplug size={12} /> Unsub
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════
              EVENT LOG VIEWER
              ═══════════════════════════════════════════════════════════ */}
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal size={14} /> Event Log
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{events.length} events</span>
                <select
                  value={eventFilter}
                  onChange={e => setEventFilter(e.target.value as any)}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="event">Events</option>
                  <option value="auth_challenge">Auth</option>
                  <option value="notice">Notices</option>
                  <option value="error">Errors</option>
                </select>
                <button
                  onClick={() => { eventsRef.current = []; setEvents([]); }}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-300"
                >
                  Clear
                </button>
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No events received yet. Subscribe to a channel to see Nostr events.
              </div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {filteredEvents.map((evt, i) => {
                  const isEvent = evt.type === "event" && evt.payload;
                  const kind = isEvent ? evt.payload.kind : null;
                  const content = isEvent ? evt.payload.content : null;
                  const pubkey = isEvent ? evt.payload.pubkey : null;

                  return (
                    <div
                      key={evt.id}
                      className={`p-2 rounded border text-xs ${
                        evt.type === "error" ? "bg-red-900/20 border-red-700/40 text-red-200" :
                        evt.type === "auth_challenge" ? "bg-amber-900/20 border-amber-700/40 text-amber-200" :
                        evt.type === "notice" ? "bg-blue-900/20 border-blue-700/40 text-blue-200" :
                        "bg-gray-900/40 border-gray-800 text-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            evt.type === "event" ? "bg-emerald-500/20 text-emerald-300" :
                            evt.type === "auth_challenge" ? "bg-amber-500/20 text-amber-300" :
                            evt.type === "notice" ? "bg-blue-500/20 text-blue-300" :
                            "bg-red-500/20 text-red-300"
                          }`}>
                            {evt.type.toUpperCase()}
                          </span>
                          {kind !== null && (
                            <span className="text-gray-500">kind:{kind}</span>
                          )}
                        </div>
                        <span className="text-gray-500">{formatAge(evt.timestamp)}</span>
                      </div>
                      {pubkey && (
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-gray-500">pubkey:</span>
                          <span className="font-mono text-gray-400">{pubkey.slice(0, 16)}…{pubkey.slice(-8)}</span>
                          <button
                            onClick={() => copyToClipboard(pubkey, "Pubkey")}
                            className="text-gray-500 hover:text-white"
                          >
                            <Copy size={10} />
                          </button>
                        </div>
                      )}
                      {content && (
                        <div className="text-gray-300 break-words whitespace-pre-wrap">
                          {content.length > 300 ? content.slice(0, 300) + "…" : content}
                        </div>
                      )}
                      {!content && evt.payload && (
                        <div className="text-gray-500 font-mono">
                          {JSON.stringify(evt.payload).slice(0, 200)}
                          {JSON.stringify(evt.payload).length > 200 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════
              READ-ONLY NOTICE + DEPLOY (disabled)
              ═══════════════════════════════════════════════════════════ */}
          <div className="p-6">
            <div className="p-4 bg-gray-900/60 border border-gray-700 rounded-lg mb-4">
              <div className="flex items-start gap-3">
                <ShieldAlert size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">Read-Only Mode</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Mosaic does not hold Nostr private keys. The bridge connects to relays
                    and receives events, but cannot sign or publish. To enable publishing,
                    install a NIP-07 browser extension (nos2x, Alby, or similar) and
                    refresh this panel.
                  </div>
                </div>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Send size={14} /> Publish (Disabled)
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={taskText}
                onChange={e => setTaskText(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none opacity-50"
                placeholder="Publishing is disabled in read-only mode…"
                disabled
              />
              <button
                onClick={handleDeploy}
                disabled
                className="px-4 py-2 bg-gray-700 text-gray-500 text-sm rounded-lg flex items-center gap-1.5 cursor-not-allowed"
                title="Publishing disabled — install NIP-07 extension"
              >
                <Ban size={14} /> Publish
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SUB-TAB CONTENT: JOBS
          ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "jobs" && (
        <div className="p-6">
          <AgentJobsPanel userAgents={userAgents} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SUB-TAB CONTENT: NAVIGATOR
          ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "navigator" && (
        <div className="p-6">
          <StargateNavigatorPanel />
        </div>
      )}
    </div>
  );
};

export default StargateBuzzPanel;
