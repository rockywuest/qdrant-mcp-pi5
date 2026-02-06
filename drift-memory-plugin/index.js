"use strict";
/**
 * drift-memory Plugin for OpenClaw
 * 
 * Biological-style memory with co-occurrence tracking.
 * Injects identity + recent memories at session start.
 */

const { execSync } = require("child_process");
const path = require("path");

const DRIFT_DIR = "/home/piclawbot/drift-memory";

/**
 * Check if drift-memory is available
 */
function isHealthy() {
  try {
    const fs = require("fs");
    return fs.existsSync(path.join(DRIFT_DIR, "session_prime.py"));
  } catch {
    return false;
  }
}

/**
 * Get priming context from drift-memory
 */
function getPrimingContext() {
  try {
    const output = execSync(`python3 ${DRIFT_DIR}/session_prime.py`, {
      encoding: "utf-8",
      timeout: 5000,
      cwd: DRIFT_DIR,
    });
    return output.trim();
  } catch (error) {
    console.error("[drift-memory] Prime error:", error.message);
    return null;
  }
}

/**
 * before_agent_start hook handler
 */
async function beforeAgentStart(event, ctx) {
  console.log("[drift-memory] >>> before_agent_start CALLED <<<");
  
  if (!isHealthy()) {
    console.log("[drift-memory] Not healthy, skipping");
    return undefined;
  }

  const context = getPrimingContext();
  if (context && context.length > 0) {
    console.log("[drift-memory] Injecting context (", context.length, "chars)");
    return {
      prependContext: `## DRIFT-MEMORY CONTEXT

${context}

---
*Co-occurrence tracking active. Memories recalled together become linked.*
`,
    };
  }
  console.log("[drift-memory] No context to inject");
  return undefined;
}

/**
 * Get status
 */
function getStatus() {
  try {
    const output = execSync(`python3 ${DRIFT_DIR}/memory_manager.py stats`, {
      encoding: "utf-8",
      timeout: 5000,
      cwd: DRIFT_DIR,
    });
    return output.trim();
  } catch {
    return "drift-memory unavailable";
  }
}

/**
 * Plugin register function - MUST BE SYNCHRONOUS
 */
function register(api) {
  const log = api.log || console;
  log.info("[drift-memory] Registering plugin...");

  if (!isHealthy()) {
    log.warn("[drift-memory] Warning: drift-memory not found at " + DRIFT_DIR);
  } else {
    log.info("[drift-memory] Found drift-memory at " + DRIFT_DIR);
  }

  // Use api.on() for typed hooks - this is the correct method!
  if (api.on) {
    api.on("before_agent_start", beforeAgentStart);
    log.info("[drift-memory] Registered before_agent_start hook via api.on()");
  } else if (api.registerHook) {
    // Fallback to registerHook if api.on is not available
    api.registerHook("before_agent_start", beforeAgentStart, {
      name: "drift-memory-prime",
      description: "Inject identity and recent memories from drift-memory"
    });
    log.info("[drift-memory] Registered before_agent_start hook via registerHook()");
  }

  log.info("[drift-memory] Plugin registered successfully");
}

/**
 * Plugin export
 */
const plugin = {
  id: "drift-memory",
  name: "Drift Memory",
  description: "Biological-style memory with co-occurrence tracking",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean", default: true },
    },
  },
  register,
};

module.exports = plugin;
module.exports.default = plugin;
module.exports.plugin = plugin;
module.exports.register = register;
module.exports.beforeAgentStart = beforeAgentStart;
module.exports.getStatus = getStatus;
module.exports.isHealthy = isHealthy;
