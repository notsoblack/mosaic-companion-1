/**
 * ChatBuzzBridge — Nostr relay bridge (READ-ONLY)
 *
 * Connects to a private Nostr relay in read-only mode.
 * No key generation, import, or signing. Publishing is disabled.
 * Future NIP-07 / NIP-46 browser-extension integration can be added later.
 */

import { EventEmitter } from "events";

// ── Types ──────────────────────────────────────────────────────────

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface BuzzBridgeStatus {
  connected: boolean;
  relayUrl: string;
  pubkey: string | null;
  channelSubscriptions: number;
  lastEventTime: number | null;
  error: string | null;
}

export interface BuzzEvent {
  type:
    | "connected"
    | "disconnected"
    | "error"
    | "event"
    | "auth_challenge"
    | "notice"
    | "auth_success"
    | "agent_response"
    | "channel_message"
    | "subscribe_ack"
    | "unsubscribe_ack";
  payload?: any;
  timestamp: number;
}

// ── BuzzRelayClient (WebSocket wrapper) ────────────────────────────

class BuzzRelayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private relayUrl: string;
  private connecting = false;
  private connected = false;
  private subscriptions = new Map<string, any>();
  private lastEventTime: number | null = null;
  private reconnectTimer: any = null;
  private challenge: string | null = null;

  constructor(relayUrl: string) {
    super();
    this.relayUrl = relayUrl;
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connecting = false;
        reject(new Error("Connection timeout"));
      }, 15000);

      try {
        this.ws = new WebSocket(this.relayUrl);
      } catch (e: any) {
        clearTimeout(timeout);
        this.connecting = false;
        reject(new Error(`Failed to create WebSocket: ${e.message}`));
        return;
      }

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.connecting = false;
        this.emit("connected", { relayUrl: this.relayUrl });
        resolve();
      };

      this.ws.onmessage = (msg: MessageEvent) => {
        try {
          const data = JSON.parse(msg.data);
          this._handleMessage(data);
        } catch {
          console.warn("[BuzzRelayClient] Non-JSON message:", msg.data);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.connecting = false;
        this.emit("disconnected");
        this._scheduleReconnect();
      };

      this.ws.onerror = (err: any) => {
        clearTimeout(timeout);
        this.connecting = false;
        this.emit("error", { error: err.message || "WebSocket error" });
        reject(new Error(`WebSocket error: ${err.message || "unknown"}`));
      };
    });
  }

  private _handleMessage(data: any[]): void {
    if (!Array.isArray(data) || data.length < 1) return;

    const msgType = data[0];

    switch (msgType) {
      case "EVENT": {
        const subId = data[1];
        const event = data[2] as NostrEvent;
        this.lastEventTime = Date.now();
        const cb = this.subscriptions.get(subId);
        if (cb) cb(event);
        this.emit("event", { subId, event });
        break;
      }
      case "EOSE": {
        const subId = data[1];
        this.emit("eose", { subId });
        break;
      }
      case "NOTICE": {
        const notice = data[1];
        this.emit("notice", { notice });
        break;
      }
      case "AUTH": {
        this.challenge = data[1];
        this.emit("auth_challenge", { challenge: this.challenge });
        console.warn("[BuzzRelayClient] AUTH challenge received but signing is disabled in read-only mode.");
        break;
      }
      case "OK": {
        const eventId = data[1];
        const accepted = data[2];
        const reason = data[3];
        this.emit("publish_ack", { eventId, accepted, reason });
        break;
      }
      default:
        this.emit("unknown_message", { data });
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.connected) {
        this.connect().catch(() => {});
      }
    }, 5000);
  }

  subscribe(filter: { kinds?: number[]; authors?: string[]; tags?: string[][]; since?: number }, callback: (event: NostrEvent) => void): string {
    if (!this.connected) {
      throw new Error("Relay not ready — cannot subscribe");
    }
    const subId = `sub-${Date.now()}`;
    const f: any = {};
    if (filter.kinds?.length) f.kinds = filter.kinds;
    if (filter.authors?.length) f.authors = filter.authors;
    if (filter.since) f.since = filter.since;
    this.subscriptions.set(subId, callback);
    this.ws?.send(JSON.stringify(["REQ", subId, f]));
    return subId;
  }

  unsubscribe(subId: string): void {
    this.subscriptions.delete(subId);
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(["CLOSE", subId]));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.subscriptions.clear();
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.connected = false;
    this.connecting = false;
  }

  isReady(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  getStatus() {
    return {
      connected: this.connected,
      relayUrl: this.relayUrl,
      subscriptions: this.subscriptions.size,
      lastEventTime: this.lastEventTime,
      challenge: this.challenge,
    };
  }
}

// ── BuzzBridgeReadonly (no key custody) ────────────────────────────

class BuzzBridgeReadonly extends EventEmitter {
  private relay: BuzzRelayClient | null = null;
  private channelCallbacks = new Map<string, (event: NostrEvent) => void>();
  private _status: BuzzBridgeStatus = {
    connected: false,
    relayUrl: "",
    pubkey: null,
    channelSubscriptions: 0,
    lastEventTime: null,
    error: null,
  };

  constructor() {
    super();
  }

  status(): BuzzBridgeStatus {
    return { ...this._status };
  }

  async connect(relayUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.relay) {
        this.relay.disconnect();
      }

      this.relay = new BuzzRelayClient(relayUrl);

      this.relay.on("connected", () => {
        this._status.connected = true;
        this._status.relayUrl = relayUrl;
        this._status.error = null;
        this.emit("buzz_event", { type: "connected", payload: { relayUrl }, timestamp: Date.now() });
      });

      this.relay.on("disconnected", () => {
        this._status.connected = false;
        this.emit("buzz_event", { type: "disconnected", timestamp: Date.now() });
      });

      this.relay.on("error", (data: any) => {
        this._status.error = data.error;
        this.emit("buzz_event", { type: "error", payload: data, timestamp: Date.now() });
      });

      this.relay.on("event", (data: any) => {
        this._status.lastEventTime = Date.now();
        this.emit("buzz_event", { type: "event", payload: data, timestamp: Date.now() });
      });

      this.relay.on("notice", (data: any) => {
        this.emit("buzz_event", { type: "notice", payload: data, timestamp: Date.now() });
      });

      this.relay.on("auth_challenge", (data: any) => {
        this.emit("buzz_event", { type: "auth_challenge", payload: data, timestamp: Date.now() });
      });

      await this.relay.connect();

      return { success: true };
    } catch (e: any) {
      this._status.error = e.message;
      this._status.connected = false;
      return { success: false, error: e.message };
    }
  }

  disconnect(): void {
    if (this.relay) {
      this.relay.disconnect();
      this.relay = null;
    }
    this.channelCallbacks.clear();
    this._status.connected = false;
    this._status.channelSubscriptions = 0;
    this._status.lastEventTime = null;
    this.emit("buzz_event", { type: "disconnected", timestamp: Date.now() });
  }

  subscribeToChannel(channelUuid: string, callback: (event: NostrEvent) => void): string | null {
    if (!this.relay?.isReady()) {
      console.error("[BuzzBridgeReadonly] Cannot subscribe: relay not ready");
      return null;
    }

    this.channelCallbacks.set(channelUuid, callback);
    this._status.channelSubscriptions = this.channelCallbacks.size;

    const subId = this.relay.subscribe(
      { kinds: [1, 42], tags: [["#t", channelUuid]] },
      (event: NostrEvent) => {
        callback(event);
        this.emit("buzz_event", {
          type: "channel_message",
          payload: { channelUuid, event },
          timestamp: Date.now(),
        });
      }
    );

    this.emit("buzz_event", {
      type: "subscribe_ack",
      payload: { channelUuid, subId },
      timestamp: Date.now(),
    });

    return subId;
  }

  unsubscribe(subId: string): void {
    this.relay?.unsubscribe(subId);
    this._status.channelSubscriptions = this.channelCallbacks.size;
  }

  async dispatchAgentJob(_agentId: string, _task: string, _channelTag: string): Promise<{ success: boolean; error: string }> {
    return {
      success: false,
      error:
        "Publishing to Nostr is disabled in read-only mode. " +
        "Install a NIP-07/NIP-46 browser extension (e.g., nos2x, Alby) " +
        "to sign and publish events.",
    };
  }

  async importKey(_nsecOrHex: string): Promise<{ success: boolean; error: string }> {
    return {
      success: false,
      error:
        "Key import is disabled. Mosaic does not hold Nostr private keys. " +
        "Use a NIP-07/NIP-46 signer extension instead.",
    };
  }

  async signEvent(_event: Partial<NostrEvent>): Promise<{ success: boolean; error: string }> {
    return {
      success: false,
      error: "Signing is disabled in read-only mode.",
    };
  }

  getPublicKey(): string | null {
    return null;
  }
}

// ── Singleton ────────────────────────────────────────────────────

let bridge: BuzzBridgeReadonly | null = null;

export async function initChat(_config?: any): Promise<void> {
  if (!bridge) {
    bridge = new BuzzBridgeReadonly();
  }
}

export function getBuzzBridge(): BuzzBridgeReadonly {
  if (!bridge) {
    bridge = new BuzzBridgeReadonly();
  }
  return bridge;
}

export { BuzzBridgeReadonly };
