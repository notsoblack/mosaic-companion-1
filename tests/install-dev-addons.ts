/**
 * Install the two add-ons through the app's own dev-install path.
 *
 * installDevAddon() has no consent dialog, so a dev install implicitly grants
 * every permission the manifest declares — the documented stand-in for the
 * registry installer's consent prompt. Hand-editing addon-state.json instead
 * leaves grantedPermissions stale, which is exactly why loops-addon refused to
 * activate with "buckets:publish beyond what was granted".
 *
 * This calls the REAL function, so permissions, buckets and activation are all
 * recorded by the same code the UI uses.
 */

import fs from "fs";
import path from "path";

import { installDevAddon, activateAddon } from "../electron/addons/loader";
import { removeAddonEntry, loadAddonState } from "../electron/addons/state";

/**
 * Add-on folders to install, resolved relative to this file.
 *
 * Paths come from argv or from sibling directories next to this script, never
 * from a hardcoded absolute path — a `/tmp/...` literal only ever worked on the
 * machine that wrote it.
 *
 *   npx esbuild tests/install-dev-addons.ts --bundle --platform=node \
 *     --alias:electron=./tests/stubs/electron-loader.ts \
 *     --outfile=dist/install-dev-addons.cjs --log-level=error \
 *     && node dist/install-dev-addons.cjs <loops-dir> <graph-dir>
 *
 * With no arguments it falls back to `<repo>/../<name>/addons/<id>`, which is
 * where a sibling git worktree of mosaic-addons normally lives.
 */
function resolveTargets(): Array<[string, string]> {
  const wanted = ["loops-addon", "graph-addon"];
  const fromArgs = process.argv.slice(2).filter(Boolean);

  if (fromArgs.length) {
    if (fromArgs.length !== wanted.length) {
      throw new Error(`expected ${wanted.length} addon directories, got ${fromArgs.length}`);
    }
    return wanted.map((id, i) => [id, path.resolve(fromArgs[i])]);
  }

  const sibling = (name: string) => path.resolve(__dirname, "..", "..", name, "addons");
  return [
    ["loops-addon", path.join(sibling("mosaic-addons-loops"), "loops-addon")],
    ["graph-addon", path.join(sibling("mosaic-addons-graph"), "graph-addon")],
  ];
}

async function main() {
  const TARGETS = resolveTargets();

  // Named `addonPath`, not `path`: the loop variable would shadow the `path`
  // module import and turn `path.join(...)` into a string method call.
  for (const [id, addonPath] of TARGETS) {
    console.log(`\n=== ${id} ← ${addonPath}`);
    const manifest = path.join(addonPath, "manifest.json");
    if (!fs.existsSync(manifest)) {
      console.error(`  no manifest.json at ${manifest} — skipping`);
      console.error(`  pass the add-on directory as an argument, e.g.`);
      console.error(`    node dist/install-dev-addons.cjs ${addonPath}`);
      process.exitCode = 1;
      continue;
    }
    // Clear any existing entry so installDev writes a correct one.
    if (loadAddonState().addons[id]) {
      removeAddonEntry(id);
      console.log("  removed existing entry");
    }
    const res = await installDevAddon(addonPath);
    console.log("  installDev:", JSON.stringify(res));
    if (!res.success) continue;

    const act = await activateAddon(id);
    console.log("  activate  :", JSON.stringify(act));
  }

  console.log("\n=== resulting state ===");
  const s = loadAddonState();
  for (const [id] of TARGETS) {
    const e = s.addons[id];
    if (!e) {
      console.log(`  ${id}: ABSENT`);
      continue;
    }
    console.log(`  ${id}`);
    console.log(`     activated : ${e.activated}`);
    console.log(`     permissions: ${JSON.stringify(e.grantedPermissions)}`);
    console.log(`     buckets   : ${JSON.stringify(e.buckets)}`);
    console.log(`     lastError : ${e.lastError ?? "(none)"}`);
  }
}

main().catch((e) => {
  console.error(`failed: ${e}`);
  process.exit(1);
});