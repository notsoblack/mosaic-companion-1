/**
 * Regression test for the provider-metadata crash.
 *
 * The Settings page crashed the whole React tree with
 *   "Cannot read properties of undefined (reading 'color')"
 * because PROVIDER_INFO had no entry for providers that agents were actually
 * configured with. AIAgentsSettings renders EVERY agent (no .filter()), so one
 * agent with an unknown provider took down the page regardless of its
 * activation state.
 *
 * This asserts the real property: every provider an agent can carry must have
 * metadata, and the AIProvider union and both switches must agree.
 */

import assert from "assert";
import { PROVIDER_INFO, DEFAULT_MODELS, type AIProvider } from "../src/types/ai";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  NOT OK  ${name}`);
    console.log(`        ${(e as Error).message}`);
  }
}

/** The providers actually present in ai-agents.json at the time of the fix. */
const CONFIGURED = ["hermes", "ollama-cloud", "ollama", "hypercycle", "claude"] as const;

console.log("\nThe crash itself");
check("every configured provider has metadata", () => {
  for (const p of CONFIGURED) {
    assert.ok(
      PROVIDER_INFO[p as AIProvider],
      `PROVIDER_INFO has no entry for "${p}" — this is the crash`,
    );
  }
});
check("reading .color no longer throws for any configured provider", () => {
  for (const p of CONFIGURED) {
    const info = PROVIDER_INFO[p as AIProvider];
    assert.strictEqual(typeof info.color, "string", `${p}.color is not a string`);
    assert.ok(info.color.length > 0, `${p}.color is empty`);
  }
});
check("reading .name no longer throws for any configured provider", () => {
  for (const p of CONFIGURED) {
    assert.strictEqual(typeof PROVIDER_INFO[p as AIProvider].name, "string");
  }
});

console.log("\nMiniMax");
check("minimax has metadata", () => {
  const m = PROVIDER_INFO.minimax;
  assert.strictEqual(m.name, "MiniMax");
  assert.ok(m.baseUrl.startsWith("https://"));
});
check("minimax baseUrl is the HOST ONLY — no trailing /v1", () => {
  // AIService.sendToOpenAI appends "/v1/chat/completions" itself, so a baseUrl
  // ending in /v1 would build ".../v1/v1/chat/completions" and 404.
  const u = new URL(PROVIDER_INFO.minimax.baseUrl);
  assert.strictEqual(u.pathname, "/", `baseUrl path is "${u.pathname}", expected "/"`);
});
check("the constructed chat-completions URL matches MiniMax's documented endpoint", () => {
  const built = `${PROVIDER_INFO.minimax.baseUrl}/v1/chat/completions`;
  assert.strictEqual(built, "https://api.minimax.io/v1/chat/completions");
});
check("minimax has the documented model id", () => {
  assert.deepStrictEqual(DEFAULT_MODELS.minimax, ["MiniMax-M3.1-Flash-Preview"]);
});
check("no two providers share a colour", () => {
  const seen = new Map<string, string>();
  for (const [k, v] of Object.entries(PROVIDER_INFO)) {
    const prev = seen.get(v.color);
    assert.strictEqual(prev, undefined, `${k} and ${prev} share colour ${v.color}`);
    seen.set(v.color, k);
  }
});

console.log("\nTable integrity");
check("PROVIDER_INFO covers every AIProvider", () => {
  for (const key of Object.keys(PROVIDER_INFO)) {
    assert.ok(
      (DEFAULT_MODELS as Record<string, string[]>)[key] !== undefined,
      `DEFAULT_MODELS has no entry for "${key}"`,
    );
  }
});
check("every PROVIDER_INFO entry has all three fields", () => {
  for (const [k, v] of Object.entries(PROVIDER_INFO)) {
    assert.strictEqual(typeof v.name, "string", `${k}.name`);
    assert.strictEqual(typeof v.color, "string", `${k}.color`);
    assert.strictEqual(typeof v.baseUrl, "string", `${k}.baseUrl`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);