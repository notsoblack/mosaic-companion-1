import React, { useState, useEffect, useRef } from 'react';
import { Server, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// ComputePortalView
// ═════════════════════════════════════════════════════════════════════════════
// A Mosaic-themed iframe wrapper for Compute Portal.
//
// What we fixed from the original addon:
//   ✅ iframe sandboxed with allow-same-origin + allow-scripts
//   ✅ Dark themed chrome matching Mosaic Companion (not a white iframe)
//   ✅ Loading state with spinner
//   ✅ Error boundary (shows retry button if iframe fails to load)
//   ✅ "Open in Browser" external link button
//   ✅ Console-safe (no console.log without conditional)
//
// Future Phase 2 features:
//   • postMessage bridge for wallet address injection
//   • Referral-code appending (?ref=CP-2B9535B3)
//   • Overlay badges for "Verified Provider", "HPEC DAO Affiliate"
// ─────────────────────────────────────────────────────────────────────────────

const COMPUTE_PORTAL_URL = 'https://computeportal.io/r/CP-2B9535B3';

export function ComputePortalView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ready: boolean; version: string } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Verify main-process IPC is wired
    if (window.electronAPI?.computePortal?.status) {
      window.electronAPI.computePortal
        .status()
        .then((s: any) => setStatus(s))
        .catch(() => {
          /* IPC optional — addon works without it */
        });
    }
  }, []);

  const handleLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleError = () => {
    setLoading(false);
    setError('Compute Portal could not be loaded. Check your internet connection.');
  };

  const openExternal = async () => {
    try {
      await window.electronAPI?.shell?.openExternal?.(COMPUTE_PORTAL_URL);
    } catch {
      window.open(COMPUTE_PORTAL_URL, '_blank');
    }
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  if (error) {
    return (
      <div className="h-full bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-100 mb-2">
            Compute Portal Unavailable
          </h3>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={retry}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-sm hover:bg-indigo-500/20 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <button
              onClick={openExternal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm hover:bg-gray-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Browser
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a2e] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00FF88]/10 border border-[#00FF88]/30 flex items-center justify-center">
            <Server className="w-4 h-4 text-[#00FF88]" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-100 tracking-wide">
              Compute Portal
            </h1>
            <p className="text-[10px] text-gray-600 font-mono">
              {status?.version ? `v${status.version} · ` : ''}computeportal.io
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Loading spinner */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Loading marketplace…
            </div>
          )}

          <button
            onClick={openExternal}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-500 hover:text-gray-300"
            title="Open in Browser"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Content: iframe ── */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f] z-10">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-[#00FF88] mx-auto mb-3" />
              <p className="text-xs text-gray-600 font-mono">Loading Compute Portal…</p>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={COMPUTE_PORTAL_URL}
          title="Compute Portal"
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-payment"
          allow="payment"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  );
}
