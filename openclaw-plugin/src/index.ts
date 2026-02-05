/**
 * @nox/memory-qdrant
 *
 * OpenClaw Memory Plugin using Qdrant via mcporter
 *
 * This plugin implements HARD ENFORCEMENT of Qdrant memory recall:
 * - Every agent turn automatically queries Qdrant via mcporter
 * - Relevant memories are injected into the prompt
 * - No LLM decision required - it happens automatically
 * - Uses the same Qdrant instance and embeddings as mcporter
 */

import { beforeAgentStart, getMemoryStatus } from "./auto-recall.js";
import { searchMemories, storeMemory, isHealthy, getStats } from "./qdrant-client.js";

// Re-export components
export * from "./qdrant-client.js";
export * from "./auto-recall.js";

/**
 * OpenClaw Plugin API interface
 */
interface OpenClawPluginApi {
  runtime: unknown;
  registerHook: (hookName: string, handler: Function) => void;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

/**
 * Empty config schema
 */
function emptyPluginConfigSchema() {
  return {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" as const, default: true },
    },
  };
}

/**
 * Plugin register function
 */
async function register(api: OpenClawPluginApi) {
  const log = api.log || console;

  log.info("[nox-memory-qdrant] Registering plugin (mcporter mode)...");

  // Check mcporter/Qdrant health
  const healthy = await isHealthy();
  if (!healthy) {
    log.warn("[nox-memory-qdrant] Warning: mcporter/Qdrant not reachable at startup");
  } else {
    log.info("[nox-memory-qdrant] mcporter/Qdrant connection verified");
  }

  // Register the before_agent_start hook
  if (api.registerHook) {
    api.registerHook("before_agent_start", beforeAgentStart);
    log.info("[nox-memory-qdrant] Registered before_agent_start hook");
  }

  log.info("[nox-memory-qdrant] Plugin registered successfully");
}

/**
 * The OpenClaw Plugin export
 */
const plugin = {
  id: "nox-memory-qdrant",
  name: "Nox Memory Qdrant",
  description: "Automatic Qdrant memory recall via mcporter (Hard Enforcement)",
  configSchema: emptyPluginConfigSchema(),
  register,
};

export default plugin;
export { plugin, register };

// Utility exports
export const utils = {
  searchMemories,
  storeMemory,
  getMemoryStatus,
  isHealthy,
  getStats,
};

/**
 * CLI test
 */
if (process.argv.includes("--test")) {
  (async () => {
    console.log("=== Testing @nox/memory-qdrant plugin ===\n");

    console.log("--- Health Check ---");
    const healthy = await isHealthy();
    console.log(`mcporter/Qdrant healthy: ${healthy}`);

    if (healthy) {
      console.log("\n--- Testing Search ---");
      const results = await searchMemories("Martin Grieß Brüggen", 3);
      console.log(`Found ${results.length} results:`);
      for (const r of results) {
        console.log(`  - ${r.content?.substring(0, 80)}...`);
      }

      console.log("\n--- Testing Hook ---");
      const hookResult = await beforeAgentStart({
        prompt: "Wer ist Martin Grieß?",
      });
      if (hookResult?.prependContext) {
        console.log("Hook returned prependContext:");
        console.log(hookResult.prependContext.substring(0, 300) + "...");
      } else {
        console.log("Hook returned no context");
      }
    }

    console.log("\n--- Status ---");
    console.log(await getMemoryStatus());

    console.log("\n=== Test Complete ===");
  })();
}
