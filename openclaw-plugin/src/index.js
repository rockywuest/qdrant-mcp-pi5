"use strict";
const { beforeAgentStart, getMemoryStatus } = require("./auto-recall.js");
const { searchMemories, storeMemory, isHealthy, getStats } = require("./qdrant-client.js");

// Re-exports
Object.assign(exports, require("./qdrant-client.js"));
Object.assign(exports, require("./auto-recall.js"));

function emptyPluginConfigSchema() {
    return {
        type: "object",
        additionalProperties: false,
        properties: {
            enabled: { type: "boolean", default: true },
        },
    };
}

// SYNCHRONOUS register function - NO async!
function register(api) {
    const log = api.log || console;
    log.info("[nox-memory-qdrant] Registering plugin (mcporter mode)...");

    // Health check in background (non-blocking)
    isHealthy().then(healthy => {
        if (!healthy) {
            log.warn("[nox-memory-qdrant] Warning: mcporter/Qdrant not reachable");
        } else {
            log.info("[nox-memory-qdrant] mcporter/Qdrant connection verified");
        }
    }).catch(() => {});

    // Use api.on() for typed hooks - this is the correct method!
    if (api.on) {
        api.on("before_agent_start", beforeAgentStart);
        log.info("[nox-memory-qdrant] Registered before_agent_start hook via api.on()");
    } else if (api.registerHook) {
        api.registerHook("before_agent_start", beforeAgentStart, {
            name: "nox-memory-qdrant-recall",
            description: "Auto-inject Qdrant memories"
        });
        log.info("[nox-memory-qdrant] Registered before_agent_start hook via registerHook()");
    }

    log.info("[nox-memory-qdrant] Plugin registered successfully");
}

const plugin = {
    id: "nox-memory-qdrant",
    name: "Nox Memory Qdrant",
    description: "Automatic Qdrant memory recall via mcporter (Hard Enforcement)",
    configSchema: emptyPluginConfigSchema(),
    register,
};

exports.plugin = plugin;
exports.default = plugin;
exports.register = register;

exports.utils = {
    searchMemories,
    storeMemory,
    getMemoryStatus,
    isHealthy,
    getStats,
};
