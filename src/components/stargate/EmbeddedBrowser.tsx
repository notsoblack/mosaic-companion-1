// =============================================================================
// EMBEDDED BROWSER — <webview> inside Electron for live game visualization
// Used in Midnight City panel to show agent moving around in real-time
// =============================================================================

import React, { useRef, useEffect, useState } from "react";
import { ExternalLink, Minimize2, Maximize2, X, RefreshCw } from "lucide-react";

interface EmbeddedBrowserProps {
  url: string;
  title?: string;
  onClose?: () => void;
  height?: string;
}

export const EmbeddedBrowser: React.FC<EmbeddedBrowserProps> = ({
  url,
  title = "Live View",
  onClose,
  height = "340px",
}) => {
  const webviewRef = useRef<any>(null); // webview is not standard HTML
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const handleDidStart = () => setIsLoading(true);
    const handleDidStop = () => setIsLoading(false);
    const handleDidNavigate = (e: any) => {
      setCurrentUrl(e.url);
      setIsLoading(false);
    };

    wv.addEventListener("did-start-loading", handleDidStart);
    wv.addEventListener("did-stop-loading", handleDidStop);
    wv.addEventListener("did-navigate", handleDidNavigate);

    return () => {
      wv.removeEventListener("did-start-loading", handleDidStart);
      wv.removeEventListener("did-stop-loading", handleDidStop);
      wv.removeEventListener("did-navigate", handleDidNavigate);
    };
  }, []);

  const handleReload = () => {
    webviewRef.current?.reload();
  };

  const handleOpenExternal = () => {
    window.open(currentUrl, "_blank");
  };

  return (
    <div
      className={`border border-slate-700 rounded-lg overflow-hidden bg-slate-900 flex flex-col transition-all duration-300 ${
        isExpanded ? "fixed inset-4 z-50" : "relative"
      }`}
      style={{ height: isExpanded ? "auto" : height }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isLoading ? "bg-yellow-400 animate-pulse" : "bg-emerald-400"}`} />
          <span className="text-xs font-medium text-slate-200">{title}</span>
          {isLoading && (
            <span className="text-[10px] text-slate-400 animate-pulse">Loading…</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReload}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title="Reload"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title="Open in browser"
          >
            <ExternalLink size={13} />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title={isExpanded ? "Minimize" : "Expand"}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-red-900/40 text-slate-400 hover:text-red-300 transition-colors"
              title="Close"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Webview */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-400">Loading Midnight City…</span>
            </div>
          </div>
        )}
        {
          /* @ts-ignore — webview is Electron-specific */
          <webview
            ref={webviewRef}
            src={url}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              backgroundColor: "#0f172a",
            }}
            allowpopups={true}
            nodeintegration={false}
            webpreferences="contextIsolation=true"
            partition="persist:midnight-city"
          />
        }
      </div>

      {/* URL bar (mini) */}
      <div className="px-3 py-1 bg-slate-800/50 border-t border-slate-700 flex items-center gap-2">
        <span className="text-[10px] text-slate-500 font-mono truncate">
          {currentUrl}
        </span>
      </div>
    </div>
  );
};

export default EmbeddedBrowser;
