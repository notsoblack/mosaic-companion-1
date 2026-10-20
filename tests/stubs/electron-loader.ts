/**
 * A minimal Electron stub that covers what the ADDON LOADER actually touches.
 *
 * The repo's own tests/stubs/electron.ts predates the buckets work and lacks
 * net/protocol/session, which protocol.ts (imported by loader.ts) needs. This
 * adds them so the REAL installDevAddon() and activateAddon() can run — the
 * point is to exercise the app's own install path, which hand-editing
 * addon-state.json does not.
 */

import fs from "fs";
import os from "os";
import path from "path";

/**
 * Throwaway userData root, created at stub load.
 *
 * electron/utils/index.ts does path.join(app.getPath("userData"), ...) at
 * MODULE LOAD, so this has to resolve before any importer's body runs. Reading
 * an unset MOSAIC_USERDATA returned undefined and killed the bundle with
 * ERR_INVALID_ARG_TYPE before main() was ever reached — a harness that only
 * works with an env var its own documented command never sets.
 *
 * Set MOSAIC_USERDATA to point the harness at a real userData instead.
 */
const userDataDir = process.env.MOSAIC_USERDATA
  || fs.mkdtempSync(path.join(os.tmpdir(), "mosaic-addon-loader-"));

const app = {
  isPackaged: false,
  getPath(name: string) {
    if (name === "userData") return userDataDir;
    if (name === "home") return process.env.HOME!;
    return process.env.HOME!;
  },
  getName: () => "mosaic-companion",
  getVersion: () => "0.1.13",
  on: () => undefined,
  whenReady: async () => undefined,
};

const session = { defaultSession: { protocol: { handle: () => undefined } } };

const net = {
  fetch: async () => {
    throw new Error("net.fetch is not available in this harness");
  },
  isOnline: () => true,
};

const protocol = { handle: () => undefined, registerSchemesAsPrivileged: () => undefined };

const BrowserWindow = class {
  static getAllWindows() {
    return [];
  }
};

const ipcMain = { handle: () => undefined, on: () => undefined, removeHandler: () => undefined };
const ipcRenderer = { invoke: async () => ({}), on: () => undefined, send: () => undefined };
const contextBridge = { exposeInMainWorld: () => undefined };

const shell = { openExternal: async () => undefined };
const dialog = { showMessageBox: async () => ({ response: 0 }) };

export {
  app, session, net, protocol, BrowserWindow,
  ipcMain, ipcRenderer, contextBridge, shell, dialog,
};
export default { app, session, net, protocol, BrowserWindow, ipcMain, ipcRenderer, contextBridge, shell, dialog };