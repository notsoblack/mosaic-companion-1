import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Compute Portal IPC Handler
// ═════════════════════════════════════════════════════════════════════════════
// Purpose: Lightweight addon that loads Compute Portal marketplace in a
// sandboxed BrowserView within Mosaic Companion.
//
// Architecture: Renderer shows an iframe wrapper with dark-themed chrome
// matching Mosaic Companion.  This file registers any IPC the renderer
// might need.  Currently the view is a simple iframe so there is no main-
// process IPC, but the stub is here for future features (e.g. wallet
// address sharing, referral-code injection, deep-linking).
//
// Dr. Robert review notes addressed:
//   ✅ manifest.json uses existing key names ("id" not "manifestVersion")
//   ✅ "route": "browser://compute-portal" (NOT "mosaic://")
//   ✅ ipcNamespace matches manifest.id
//   ✅ No main/index.js bundling requirement (esbuild only bundles
//      entryPoints: ["electron/main.ts", "electron/preload.ts"])
//   ✅ All IPC channel names namespaced "compute-portal:"
// ─────────────────────────────────────────────────────────────────────────────

export function registerComputePortalIpc(ipcMainRef: typeof ipcMain) {
  // ── 1. Health check ──
  // Renderer can call this to verify the addon is wired correctly.
  ipcMainRef.handle("compute-portal:status", () => ({
    ready: true,
    version: "1.0.0",
    url: "https://computeportal.io/r/CP-2B9535B3",
  }));

  // ── 2. Get referral / tracking data (stub for Phase 2) ──
  // If we later inject a Mosaic user ID or wallet address into the
  // iframe via postMessage or URL query param, the renderer can
  // request it here.
  ipcMainRef.handle("compute-portal:get-referral-context", async () => {
    // Phase 2: read from vault or settings
    // For now return empty so the iframe loads normally
    return {
      walletAddress: null,
      referralCode: null,
    };
  });

  // ── 3. Log external navigation attempts for analytics ──
  ipcMainRef.handle("compute-portal:log-nav", async (_evt, payload: { url: string; type: string }) => {
    // Future: emit telemetry, update vault, etc.
    console.log("[ComputePortal] nav:", payload.type, payload.url);
    return { logged: true };
  });

  console.log("[ComputePortal] IPC handlers registered (namespace: compute-portal)");
}
