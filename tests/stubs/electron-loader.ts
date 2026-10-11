/**
 * A minimal Electron stub that covers what the ADDON LOADER actually touches.
 *
 * The repo's own tests/stubs/electron.ts predates the buckets work and lacks
 * net/protocol/session, which protocol.ts (imported by loader.ts) needs. This
 * adds them so the REAL installDevAddon() and activateAddon() can run — the
 * point is to exercise the app's own install path, which hand-editing
 * addon-state.json does not.
 */

const app = {
  isPackaged: false,
  getPath(name: string) {
    if (name === "userData") return process.env.MOSAIC_USERDATA!;
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