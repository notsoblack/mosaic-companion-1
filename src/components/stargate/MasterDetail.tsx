// =============================================================================
// MASTER-DETAIL LAYOUT — Reusable split-pane layout for Stargate
// Inspired by Hermes Desktop: list on left, detail on right
// =============================================================================

import React, { useState } from "react";

interface MasterDetailProps {
  children: React.ReactNode;
  split?: "normal" | "wide" | "equal";
  className?: string;
}

export const MasterDetail: React.FC<MasterDetailProps> = ({
  children,
  split = "normal",
  className = "",
}) => {
  const splitClass = {
    normal: "grid-cols-[320px_1fr]",
    wide: "grid-cols-[380px_1fr]",
    equal: "grid-cols-2",
  };

  return (
    <div className={`grid h-full min-h-0 ${splitClass[split]} gap-0 ${className}`}>
      {children}
    </div>
  );
};

// ── List Column (left) ──

interface ListColumnProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
}

export const ListColumn: React.FC<ListColumnProps> = ({
  children,
  header,
  className = "",
}) => {
  return (
    <div className={`flex flex-col min-h-0 border-r border-gray-800 ${className}`}>
      {header && (
        <div className="flex-none border-b border-gray-800">{header}</div>
      )}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
};

// ── Detail Column (right) ──

interface DetailColumnProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const DetailColumn: React.FC<DetailColumnProps> = ({
  children,
  footer,
  className = "",
}) => {
  return (
    <div className={`flex flex-col min-h-0 bg-gray-950 ${className}`}>
      <div className="flex-1 overflow-y-auto">{children}</div>
      {footer && (
        <div className="flex-none border-t border-gray-800 px-4 py-2 text-xs text-gray-500">
          {footer}
        </div>
      )}
    </div>
  );
};

// ── Cap Row (list item with toggle) ──

interface CapRowProps {
  active?: boolean;
  busy?: boolean;
  enabled?: boolean;
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  onSelect?: () => void;
  onToggle?: (enabled: boolean) => void;
  toggleLabel?: string;
  className?: string;
}

export const CapRow: React.FC<CapRowProps> = ({
  active = false,
  busy = false,
  enabled = true,
  title,
  subtitle,
  meta,
  onSelect,
  onToggle,
  toggleLabel,
  className = "",
}) => {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
        active
          ? "bg-cyan-500/10 border-r-2 border-cyan-400"
          : "hover:bg-gray-900 border-r-2 border-transparent"
      } ${className}`}
    >
      {/* Toggle switch */}
      {onToggle && (
        <label
          className="shrink-0 flex items-center cursor-pointer"
          onClick={(e) => e.stopPropagation()}
          title={toggleLabel || `${enabled ? "Disable" : "Enable"} ${title}`}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div
            className={`relative w-8 h-4 rounded-full transition-colors ${
              busy
                ? "bg-gray-600 opacity-50"
                : enabled
                ? "bg-cyan-500 peer-checked:bg-cyan-500"
                : "bg-gray-600"
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </div>
        </label>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${enabled ? "text-gray-200" : "text-gray-500"}`}>
            {title}
          </span>
          {meta && (
            <span className="shrink-0 text-xs text-gray-500">{meta}</span>
          )}
        </div>
        {subtitle && (
          <div className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1.5">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

// ── List Strip (header bar for ListColumn) ──

interface ListStripProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export const ListStrip: React.FC<ListStripProps> = ({
  left,
  right,
  className = "",
}) => {
  return (
    <div className={`flex items-center justify-between px-4 py-2 ${className}`}>
      <div className="flex items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
};

// ── Tool Chip (badge showing tool count) ──

export const ToolChip: React.FC<{ count: number }> = ({ count }) => (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400">
    {count} tool{count !== 1 ? "s" : ""}
  </span>
);

// ── Panel Empty State ──

export const PanelEmpty: React.FC<{ title?: string; description: string; action?: React.ReactNode }> = ({
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
    {title && (
      <div className="text-sm font-medium text-gray-300 mb-1">{title}</div>
    )}
    <div className="text-xs text-gray-500">{description}</div>
    {action && <div className="mt-3">{action}</div>}
  </div>
);

// ── Compact Number Formatter ──

export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ── Trust Badge Colors ──

export const TRUST_RANK: Record<string, number> = {
  builtin: 2,
  trusted: 1,
  community: 0,
};

export function trustTone(level: string): string {
  switch (level) {
    case "builtin":
      return "bg-gray-600/20 text-gray-400 border-gray-600/30";
    case "trusted":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
    default:
      return "bg-amber-500/15 text-amber-400 border-amber-500/25";
  }
}
