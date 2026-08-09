/**
 * midnight-city.ts — Credential storage for midnight.city API key
 *
 * Lives in the Electron main process. Encrypts the API key at rest using
 * Electron's safeStorage (OS keychain / keyring).
 *
 * Storage: ~/.config/mosaic-companion/midnight-city.json
 *   { agentId, apiKeyEncrypted, profession, apiBase }
 */

import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(app.getPath("userData"), "midnight-city.json");

export interface MidnightCredentials {
  agentId: string;
  apiKey: string;
  profession: string;
  apiBase: string;
}

interface StoredConfig {
  agentId?: string;
  apiKeyEncrypted?: string;
  profession?: string;
  apiBase?: string;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function readConfig(): StoredConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch (e) {
    console.error("[MidnightCity] Failed to read config:", e);
  }
  return {};
}

function writeConfig(cfg: StoredConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
  } catch (e) {
    console.error("[MidnightCity] Failed to write config:", e);
  }
}

/** Encrypt if safeStorage available; otherwise prefix as plain. */
function encryptIfPossible(plain: string): string {
  if (!plain) return "";
  // Guard: safeStorage cannot be used before app is ready
  if (!app.isReady()) return "plain:" + plain;
  if (safeStorage.isEncryptionAvailable()) {
    return "enc:" + safeStorage.encryptString(plain).toString("base64");
  }
  return "plain:" + plain;
}

/** Decrypt if safeStorage available; handles enc: / plain: / legacy. */
function decryptIfPossible(cipher: string): string {
  if (!cipher) return "";
  // Guard: safeStorage cannot be used before app is ready — defer decryption
  if (!app.isReady()) {
    console.warn("[MidnightCity] App not ready — deferring apiKey decryption");
    return "";
  }
  if (cipher.startsWith("enc:")) {
    try {
      const blob = Buffer.from(cipher.slice(4), "base64");
      return safeStorage.decryptString(blob);
    } catch (e) {
      console.error("[MidnightCity] Failed to decrypt apiKey:", e);
      return "";
    }
  }
  if (cipher.startsWith("plain:")) return cipher.slice(6);
  return cipher; // legacy un-prefixed
}

/* ── Public API ─────────────────────────────────────────────────── */

export function getCredentials(): MidnightCredentials | null {
  const cfg = readConfig();
  if (!cfg.agentId) return null;
  return {
    agentId: cfg.agentId,
    apiKey: cfg.apiKeyEncrypted ? decryptIfPossible(cfg.apiKeyEncrypted) : "",
    profession: cfg.profession || "miner",
    apiBase: cfg.apiBase || "https://midnight.city/observer",
  };
}

/** Get non-sensitive config for renderer (apiKey omitted). */
export function getConfigPublic(): Omit<MidnightCredentials, "apiKey"> & { configured: boolean } {
  const cfg = readConfig();
  if (!cfg.agentId) return { configured: false, agentId: "", profession: "miner", apiBase: "https://midnight.city/observer" };
  return {
    configured: true,
    agentId: cfg.agentId,
    profession: cfg.profession || "miner",
    apiBase: cfg.apiBase || "https://midnight.city/observer",
  };
}

export function setCredentials(creds: MidnightCredentials): void {
  writeConfig({
    agentId: creds.agentId,
    apiKeyEncrypted: creds.apiKey ? encryptIfPossible(creds.apiKey) : undefined,
    profession: creds.profession,
    apiBase: creds.apiBase,
  });
}

export function clearCredentials(): void {
  try {
    if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
  } catch (e) {
    console.error("[MidnightCity] Failed to clear config:", e);
  }
}

/** Get decrypted API key for the background service. */
export function getApiKey(): string {
  const cfg = readConfig();
  if (!cfg.apiKeyEncrypted) return "";
  return decryptIfPossible(cfg.apiKeyEncrypted);
}
