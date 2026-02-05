/**
 * Qdrant Client for Nox Memory Plugin
 *
 * Uses mcporter CLI to access Qdrant (same instance as OpenClaw)
 * This ensures we use the same data and embeddings.
 */

import { execSync, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, unknown>;
}

// Cache for health check
let lastHealthCheck = 0;
let isHealthyCache = false;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check if mcporter and Qdrant are healthy
 */
export async function isHealthy(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return isHealthyCache;
  }

  try {
    const { stdout } = await execAsync("mcporter list 2>&1", { timeout: 10000 });
    isHealthyCache = stdout.includes("qdrant-memory") && stdout.includes("healthy");
    lastHealthCheck = now;
    return isHealthyCache;
  } catch (error) {
    console.error("[nox-memory-qdrant] mcporter health check failed:", error);
    isHealthyCache = false;
    lastHealthCheck = now;
    return false;
  }
}

/**
 * Search for similar memories using mcporter qdrant-find
 */
export async function searchMemories(
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  try {
    // Call mcporter to run qdrant-find
    // mcporter uses the configured embedding model internally
    const escapedQuery = query.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const cmd = `mcporter run qdrant-memory qdrant-find --query "${escapedQuery}" 2>&1`;

    const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });

    if (stderr && !stderr.includes("INFO")) {
      console.warn("[nox-memory-qdrant] mcporter stderr:", stderr);
    }

    // Parse the JSON output from mcporter
    // The output format depends on mcp-server-qdrant
    try {
      const results = JSON.parse(stdout);

      if (Array.isArray(results)) {
        return results.slice(0, limit).map((r: any, i: number) => ({
          id: r.id || `result-${i}`,
          score: r.score || 1.0,
          content: r.content || r.text || r.document || JSON.stringify(r),
          metadata: r.metadata || {},
        }));
      }

      // Single result or different format
      if (results.content || results.text) {
        return [{
          id: results.id || "result-0",
          score: results.score || 1.0,
          content: results.content || results.text,
          metadata: results.metadata || {},
        }];
      }

      return [];
    } catch (parseError) {
      // Output might be plain text, not JSON
      if (stdout.trim()) {
        return [{
          id: "text-result",
          score: 1.0,
          content: stdout.trim(),
          metadata: { format: "text" },
        }];
      }
      return [];
    }
  } catch (error) {
    console.error("[nox-memory-qdrant] Search error:", error);
    return [];
  }
}

/**
 * Store a memory entry using mcporter qdrant-store
 */
export async function storeMemory(
  content: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  try {
    const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const metaStr = metadata ? JSON.stringify(metadata) : "{}";
    const cmd = `mcporter run qdrant-memory qdrant-store --content "${escapedContent}" --metadata '${metaStr}' 2>&1`;

    await execAsync(cmd, { timeout: 30000 });
    return true;
  } catch (error) {
    console.error("[nox-memory-qdrant] Store error:", error);
    return false;
  }
}

/**
 * Get collection statistics (simplified)
 */
export async function getStats(): Promise<{
  pointsCount: number;
  status: string;
}> {
  // mcporter doesn't expose stats directly, return placeholder
  const healthy = await isHealthy();
  return {
    pointsCount: -1, // Unknown
    status: healthy ? "healthy" : "unavailable",
  };
}

// Legacy exports for compatibility
export function getClient(): null {
  return null; // Not using HTTP client anymore
}

export async function ensureCollection(): Promise<void> {
  // mcporter handles collection management
}
