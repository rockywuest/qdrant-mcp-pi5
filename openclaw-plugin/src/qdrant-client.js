"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHealthy = isHealthy;
exports.searchMemories = searchMemories;
exports.storeMemory = storeMemory;
exports.getStats = getStats;
exports.getClient = getClient;
exports.ensureCollection = ensureCollection;

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

// Cache for health check
let lastHealthCheck = 0;
let isHealthyCache = false;
const HEALTH_CHECK_INTERVAL = 30000;

async function isHealthy() {
    const now = Date.now();
    if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
        return isHealthyCache;
    }
    try {
        const { stdout } = await execFileAsync("mcporter", ["list"], { timeout: 10000 });
        isHealthyCache = stdout.includes("qdrant-memory") && stdout.includes("healthy");
        lastHealthCheck = now;
        return isHealthyCache;
    } catch (error) {
        isHealthyCache = false;
        lastHealthCheck = now;
        return false;
    }
}

/**
 * Search using execFile (no shell interpretation!)
 */
async function searchMemories(query, limit = 5) {
    try {
        // Truncate very long queries to avoid issues
        const safeQuery = query.substring(0, 200);
        
        // Use execFile to avoid shell interpretation entirely
        const { stdout } = await execFileAsync(
            "mcporter",
            ["call", "qdrant-memory.qdrant-find", `query=${safeQuery}`],
            { timeout: 30000 }
        );
        
        // Parse output
        try {
            const results = JSON.parse(stdout);
            if (Array.isArray(results)) {
                return results.slice(0, limit).map((r, i) => ({
                    id: r.id || `result-${i}`,
                    score: r.score || 1.0,
                    content: r.content || r.text || r.document || (typeof r === "string" ? r : ""),
                    metadata: r.metadata || {},
                }));
            }
            return [];
        } catch {
            // Plain text output - parse line by line
            const lines = stdout.split("\n").filter(l => l.trim());
            return lines.slice(0, limit).map((line, i) => ({
                id: `result-${i}`,
                score: 0.8,
                content: line.replace(/<[^>]+>/g, "").trim(),
                metadata: {},
            }));
        }
    } catch (error) {
        console.error("[nox-memory-qdrant] Search error:", error.message);
        return [];
    }
}

async function storeMemory(text, metadata = {}) {
    try {
        const args = ["call", "qdrant-memory.qdrant-store", `information=${text}`];
        if (Object.keys(metadata).length > 0) {
            args.push(`metadata=${JSON.stringify(metadata)}`);
        }
        await execFileAsync("mcporter", args, { timeout: 30000 });
        return true;
    } catch (error) {
        console.error("[nox-memory-qdrant] Store error:", error.message);
        return false;
    }
}

async function getStats() {
    const healthy = await isHealthy();
    return { healthy, backend: "mcporter/qdrant" };
}

// Compatibility exports
function getClient() { return null; }
function ensureCollection() { return Promise.resolve(); }
