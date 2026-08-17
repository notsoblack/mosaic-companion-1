---
name: dashboard-graph-satellite-patterns
description: Render satellite constellations outside main SVG graphs.
trigger: |
  When a dashboard graph needs to show related data (assets, licenses, nodes) 
  as a visually distinct cluster outside the main time-ring or force-layout 
  constellation. Also when the same entity type arrives from multiple sources
  (e.g. Node Manager API + Web3 scanner) and must be visualized with source 
  attribution and no duplication.
---

# Dashboard Graph Satellite Patterns

## Scope

A **satellite constellation** is a secondary cluster of nodes rendered at a
fixed screen position, outside the main graph's pan/zoom coordinate system.
It behaves like a "moon" — always visible in the viewport corner, connected to
the main graph by theme but independently positioned.

Use this skill when:
- The main graph uses time rings, force layout, or polar coordinates
- A subset of data (ANFEs, licenses, nodes) needs to be grouped visually
- Data arrives from multiple sources with conflicting coordinates
- Nodes must remain visible regardless of main graph zoom/pan state

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  MAIN CONSTELLATION                                  │
│  ┌────────┐    ┌────────┐    ┌────────┐            │
│  │ Agent  │────│  Box   │────│  MCP   │            │
│  └────────┘    └────────┘    └────────┘            │
│       \           |            /                    │
│        \    ┌────────┐    /                         │
│         └───│  Loop  │───┘                         │
│             └────────┘                              │
│                                                     │
│                              ╭──────────────╮       │
│                             ╱                ╲      │
│                            │   [Hub Hex]     │     │
│                            │  Node Manager    │     │
│                             ╲   /  |  \      ╱      │
│                              ╲ /   |   \    ╱       │
│                            [sh]  [sh]  [sh]       │
│                           Lvl11 Lvl14 Lvl10       │
│                            ╰──────────────╯        │
│                            SATELLITE CONSTELLATION │
│                            (fixed position)        │
└─────────────────────────────────────────────────────┘
```

## Implementation

### 1. Separate Satellite Rendering from Main Graph

The satellite must be rendered in its OWN `<g>` element, AFTER the main graph's
transform group, so it is NOT affected by pan/zoom:

```tsx
<svg width={dimensions.width} height={dimensions.height}>
  {/* Main graph — affected by pan/zoom */}
  <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
    {nodes.map(n => <ShapeNode key={n.id} ... />)}
    {edges.map(e => <EdgeLine key={e.id} ... />)}
  </g>

  {/* Satellite — fixed screen position */}
  <g>
    <SatelliteConstellation
      hubX={dimensions.width - 160}
      hubY={dimensions.height - 140}
      data={satelliteData}
    />
  </g>
</svg>
```

**Critical:** Do NOT put the satellite inside the panned `<g>`. It must be a
sibling at the SVG root level.

### 2. Satellite Constellation Component

```tsx
interface SatelliteNode {
  id: string;
  label: string;
  level?: number;        // drives size
  color: string;         // source attribution color
  source?: string;        // "node-manager" | "web3" | ...
}

const SatelliteConstellation: React.FC<{
  hubX: number;
  hubY: number;
  data: SatelliteNode[];
  hubLabel?: string;
  orbitRadius?: number;
}> = ({ hubX, hubY, data, hubLabel = "Hub", orbitRadius = 70 }) => {
  return (
    <g>
      {/* Orbit ring (decorative) */}
      <circle
        cx={hubX}
        cy={hubY}
        r={orbitRadius}
        fill="none"
        stroke="#334155"
        strokeWidth={0.5}
        strokeDasharray="4 8"
        opacity={0.5}
      />

      {/* Section label */}
      <text
        x={hubX}
        y={hubY - orbitRadius - 20}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize={9}
        fontWeight="600"
      >
        {hubLabel.toUpperCase()}
      </text>

      {/* Hub node */}
      <g transform={`translate(${hubX}, ${hubY})`}>
        {/* Glow */}
        <circle cx={0} cy={0} r={22} fill="#f59e0b" opacity={0.08} />
        {/* Hex shape */}
        <polygon
          points={`16,0 8,-13.8 -8,-13.8 -16,0 -8,13.8 8,13.8`}
          fill="#f59e0b"
          opacity={0.9}
        />
        {/* Inner circle */}
        <circle cx={0} cy={0} r={6} fill="#0f172a" />
        {/* Label */}
        <text y={30} textAnchor="middle" fill="#e2e8f0" fontSize={8}>
          {hubLabel}
        </text>
      </g>

      {/* Satellite nodes */}
      {data.map((node, i) => {
        const angle = (i / Math.max(data.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const dist = 45 + (i % 2) * 12; // Staggered distance
        const sx = hubX + Math.cos(angle) * dist;
        const sy = hubY + Math.sin(angle) * dist;
        const size = 7 + (node.level ?? 1) * 0.5;

        return (
          <g key={node.id}>
            {/* Connection line */}
            <line
              x1={hubX}
              y1={hubY}
              x2={sx}
              y2={sy}
              stroke={node.color}
              strokeWidth={1}
              opacity={0.5}
            />
            {/* Node shape (shield) */}
            <g transform={`translate(${sx}, ${sy})`}>
              <polygon
                points={(() => {
                  const r = size;
                  const tw = r * 0.7;
                  const mw = r * 0.9;
                  return `${-tw},${-r*0.7} ${tw},${-r*0.7} ${mw},0 0,${r} ${-mw},0`;
                })()}
                fill={node.color}
                opacity={0.9}
              />
              <circle cx={0} cy={0} r={2.5} fill="#0f172a" />
            </g>
            {/* Label */}
            <text
              x={sx}
              y={sy + size + 8}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize={7}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </g>
  );
};
```

### 3. Multi-Source Data Aggregation

When the same asset type comes from multiple APIs, create a unified type with
source attribution:

```typescript
interface Asset {
  id: string;
  source: "node-manager" | "web3" | "manual";
  level: number;
  name: string;
  status: string;
  ownerAddress?: string;
  chain?: string;
  // Source-specific metadata as optional fields
  delegatedTo?: string;   // Node Manager only
  image?: string;         // Web3 NFT only
}

async function discoverAssets(): Promise<Asset[]> {
  const [nodeAssets, web3Assets] = await Promise.all([
    discoverFromNodeManager(),
    discoverFromWeb3(),
  ]);

  // Deduplicate by id + source combo (same ID from different sources = different assets)
  const seen = new Set<string>();
  return [...nodeAssets, ...web3Assets].filter(a => {
    const key = `${a.source}:${a.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

**Key rule:** Same `id` from different sources are DIFFERENT assets (different
wallets own them). Only deduplicate exact `{source, id}` pairs.

### 4. Source Color Attribution

Assign consistent colors per source for visual recognition:

| Source | Color | Hex | Usage |
|--------|-------|-----|-------|
| Node Manager | Amber | `#f59e0b` | Hub node |
| Node Manager ANFEs | Gold | `#eab308` | Satellite shields |
| Web3 | Cyan | `#22d3ee` | Main constellation nodes |
| Manual/Custom | Purple | `#a855f7` | User-added entries |

**In the main graph:** Show only Web3 assets (they have their own coordinates).
**In the satellite:** Show only Node Manager assets (clustered around hub).

This prevents duplication AND gives each source its visual territory.

### 5. Removing Duplicates from Main Constellation

Filter the main graph's node list to exclude assets that belong in the satellite:

```typescript
const mainGraphNodes = allNodes.filter(n =>
  n.type !== "anfe" || n.meta?.anfeSource !== "node-manager"
);
```

The satellite renders its OWN nodes directly in SVG — they don't go through the
main graph's node list at all.

## Pitfalls

1. **Putting satellites inside the panned `<g>`** — The satellite will zoom away
   when user pans the main graph. Always render as sibling `<g>` at SVG root.

2. **Not filtering source-specific nodes from main graph** — Node Manager ANFEs
   will appear BOTH in main rings AND in satellite. Always filter by source before
   adding to the main node list.

3. **Hard-coding satellite position** — Use `dimensions.width - offset` and
   `dimensions.height - offset` so it stays in corner regardless of screen size.

4. **Forgetting orbit ring** — The dashed circle makes it clear this is a separate
   system, not a disconnected floating node.

5. **Same color for hub and satellites** — Hub should be a darker/brighter shade
   (amber `#f59e0b`) than satellites (gold `#eab308`) to show hierarchy.

6. **Node Manager `getStatus().address` is a NODE ID, not a wallet** —
   `HyperCycleNodeManagerClient.getStatus()` returns `address: "80ad4ea14c33cd2a"`
   which is the **node identifier**, NOT the Ethereum wallet. Calling
   `getLicenses(nodeId)` returns empty. **Fix:** Call `getLicenses()` with NO
   filter, then derive the wallet from `licenses[0].owner` or
   `licenses[0].ownerAddress`.

7. **License response field names vary** — The Node Manager `/api/licenses` endpoint
   returns objects with fields like `owner`, `ownerAddress`, `wallet`, or nested
   under `metadata.{owner,delegatedTo,level}`. Always check multiple field names:
   ```typescript
   const wallet = license.owner || license.ownerAddress || license.wallet
                || license.metadata?.owner || status.address;
   ```

8. **Hub ANFE count label for diagnostics** — When satellites are missing, the
   user can't tell if it's a rendering bug or a data bug. Always render a count
   label below the hub label: `"Node Manager (2 ANFEs)"` or `"no ANFEs"`.
   This makes data pipeline failures immediately visible.

## Verification

- [ ] Satellite renders at fixed position regardless of main graph pan/zoom
- [ ] Orbit ring is visible (dashed, low opacity)
- [ ] Hub node is larger than satellites
- [ ] Connection lines exist hub → each satellite
- [ ] Node Manager assets do NOT appear in main graph
- [ ] Web3 assets appear in main graph as cyan nodes
- [ ] Labels show level/name clearly
- [ ] No duplication (same asset from different sources shown separately)

## Related

- `command-center-ui-patterns` — Main dashboard shell architecture
- `stargate-pool-integration` — Telemetry hooks and live badges
