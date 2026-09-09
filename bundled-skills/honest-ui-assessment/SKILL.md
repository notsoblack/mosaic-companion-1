---
name: honest-ui-assessment
description: 'Use when auditing UI buttons for real execution vs. theater.'
trigger: 'Use when implementing or reviewing UI action buttons (Run, Save, Execute) to verify they actually perform the claimed operation.'
---

# Honest UI Feature Assessment

## The Rule

Every UI action must trace to an actual backend call, API invocation, or persistent state change. If it doesn't, it's **theater** — not a feature.

## The 3-Step Audit

### Step 1: Follow the click

```
User clicks [Run]
  → onClick handler fires?
  → Does it call a real execution function?
  → Does that function call an actual API?
  → Does the API touch real state?
```

If any arrow answers "no" — the feature is **not executing**.

### Step 2: Classify

| What happens | Classification | User sees |
|--------------|----------------|---------|
| Real API call with side effects | **Execution** | ✅ "Job submitted" |
| Mock/simulated response | **Simulation** | ⚠️ "Dry-run complete" |
| Writes to localStorage only | **Persistence** | ⚠️ "Saved locally" |
| Changes a React state string | **Theater** | ❌ Button flips status |

### Step 3: Report honestly

> "The [Feature] is [classification]. Here's what actually happens: [trace]. It does NOT [what user expects]."

Then present **Option A / Option B**.

## Red Flags (Theater Detection)

| Smell | Example | Classification |
|-------|---------|---------------|
| `// TODO: wire to actual execution` | `handleRun` in LoopsPanel | Theater |
| `Math.random() < 0.15` for failure | `simulateNode` dry-run | Simulation |
| `status: "running"` string flip | `handlePause` changes string | Theater |
| Returns static mock data | `{entries: [{label: "mock"}]}` | Simulation |
| No error handling | No try/catch around "execution" | Theater |

## Option A / Option B Pattern

### Option A: Honest Scope (default)
- Remove misleading buttons
- Rename to honest labels ("Designer" not "Manager")
- Keep what works (CRUD, export, simulation)
- Document what is/isn't executing

### Option B: Full Implementation
- Wire to real APIs
- Add execution engine
- Add checkpoint persistence
- More work, higher risk

**Decision rule:** Default to A unless user explicitly requests B.

## When User Asks "Are You Satisfied?"

**Wrong:** "Yes, it works great!" (without checking execution)

**Right:** "For a designer, yes. For a runtime, no — here's why: [trace]. I recommend Option A."

## When External Toolchains Are Required

When a feature claims to "package" or "build" something for an external platform
(HyperCycle Node Factory, Docker registry, etc.), verify that the generated
artifacts match the **official toolchain's output**, not just any working code.

### The Pattern

| What the UI shows | What the backend generates | What the platform expects |
|---|---|---|
| "Aimify Your Model" wizard | Basic Flask scaffold | `config.yml` + `app/shims/` + `pyhypercycle_aim` |
| "Build Docker Image" button | Flat `manifest.json` with extra fields | HyperCycle-compliant `manifest.json` (name, short_name, version, doc_url, license, tos) |
| "Register with Node Factory" | No `test.py` generated | Endpoint validation tests |

### How to Audit

1. **Clone the official toolchain** (`aim-py-gen`, `hypercycle-cli`, etc.)
2. **Run it with sample inputs** — observe the exact file tree and format
3. **Compare to your generated output** — file by file, field by field
4. **Document discrepancies** — which files are missing, which fields are wrong

### How to Report (for demos)

> "The UI workflow is production-ready — select assets, auto-fill metadata, configure, build with live progress. **However**, the generated artifacts need `<toolchain>` integration. Currently we generate a basic scaffold; the official toolchain produces `config.yml`, `app/shims/`, and `pyhypercycle_aim` infrastructure. For this demo, we show the vision and acknowledge the backend gap. The fix is wiring `AIMForgeService` into `<toolchain>` invocation."

### Option A / Option B for Toolchain Gaps

| Option | Effort | Result |
|---|---|---|
| **A. Demo UI only** | 0h | Don't click Build, focus on Selection → Config |
| **B. Fix generation** | 4-6h | Generate proper artifacts, invoke official toolchain |
| **C. Hybrid** | 2-3h | Generate `config.yml` via existing service, then invoke toolchain |

**Decision rule:** Default to A for stakeholder demos. B/C only after explicit user direction.

See `references/session-2026-08-21-aimify-backend-gap-honest-assessment.md` for the full `aim-py-gen` vs `AimifierService.ts` analysis with file-by-file comparison.

---

## Real Example: Stargate Loop Designer

**Theater (before):**
```typescript
const handleRun = (loop) => {
  const run = { id: `run-${Date.now()}`, status: "running" };
  setRuns([run, ...runs]);
  // TODO: wire to actual execution engine
};
```

**Honest (after):**
```typescript
const handleTest = async (loop) => {
  setTestingLoop(loop);
  const result = await executeLoopDryRun(loop);
  setTestResult(result);
  setTestingLoop(null);
};
```

Header: "Loop Designer" — "Design topologies · Validate · Export"

## Related Skills

- `systematic-debugging` — 4-phase root cause investigation
- `detective-debugging` — evidence-driven analysis
- `simplify-code` — reducing over-engineered scope
