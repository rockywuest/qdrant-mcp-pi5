/**
 * Auto-Recall Hook for OpenClaw
 *
 * Implements the before_agent_start hook to automatically inject
 * relevant Qdrant memories before each agent turn.
 *
 * This is HARD ENFORCEMENT - Qdrant is queried on EVERY agent turn.
 */

import { searchMemories, isHealthy } from "./qdrant-client.js";

export interface AgentStartContext {
  /** The user's message that triggered this agent turn */
  prompt?: string;
  /** Previous messages in the conversation */
  messages?: unknown[];
}

export interface AgentContext {
  agentId?: string;
  sessionKey?: string;
  workspaceDir?: string;
}

/**
 * OpenClaw hook result format
 */
export interface HookResult {
  /** Additional system prompt content */
  systemPrompt?: string;
  /** Content to prepend to the user prompt */
  prependContext?: string;
}

/**
 * Extract the user's latest message from the prompt or messages
 */
function extractUserMessage(context: AgentStartContext): string | null {
  if (context.prompt && typeof context.prompt === "string") {
    return context.prompt;
  }

  if (context.messages && Array.isArray(context.messages)) {
    const lastMessage = context.messages[context.messages.length - 1];
    if (lastMessage && typeof lastMessage === "object") {
      const msg = lastMessage as Record<string, unknown>;
      if (msg.role === "user" && typeof msg.content === "string") {
        return msg.content;
      }
    }
  }

  return null;
}

/**
 * Before Agent Start Hook - HARD ENFORCEMENT
 *
 * Called by OpenClaw before each agent turn starts.
 * Automatically queries Qdrant for relevant memories and injects them.
 */
export async function beforeAgentStart(
  event: AgentStartContext,
  ctx?: AgentContext
): Promise<HookResult | undefined> {
  const userMessage = extractUserMessage(event);

  if (!userMessage || userMessage.length < 5) {
    return undefined;
  }

  // Skip for very short or common messages
  const skipPatterns = [
    /^(hi|hey|hallo|moin|ok|ja|nein|danke|thanks)$/i,
    /^HEARTBEAT/i,
  ];
  if (skipPatterns.some(p => p.test(userMessage.trim()))) {
    return undefined;
  }

  // Check mcporter/Qdrant health
  const healthy = await isHealthy();
  if (!healthy) {
    console.warn("[nox-memory-qdrant] mcporter/Qdrant not healthy, skipping auto-recall");
    return undefined;
  }

  console.log(`[nox-memory-qdrant] Auto-recall for: "${userMessage.substring(0, 50)}..."`);

  try {
    // Search Qdrant via mcporter (handles embedding internally)
    const startTime = Date.now();
    const memories = await searchMemories(userMessage, 5);
    console.log(`[nox-memory-qdrant] Found ${memories.length} results in ${Date.now() - startTime}ms`);

    if (memories.length === 0) {
      return undefined;
    }

    // Format memories for injection
    const memoryText = memories
      .map((m, i) => {
        const score = typeof m.score === "number" ? `[${(m.score * 100).toFixed(0)}%]` : "";
        const source = m.metadata?.source || m.metadata?.file || "";
        const sourceInfo = source ? ` (Quelle: ${source})` : "";
        return `${i + 1}. ${score} ${m.content}${sourceInfo}`;
      })
      .join("\n\n");

    const prependContext = `## QDRANT MEMORY RECALL (automatisch, Hard Enforcement)

Relevante Informationen aus der Vektordatenbank:

${memoryText}

---
Diese Informationen wurden automatisch abgerufen. Nutze sie in deiner Antwort und zitiere die Quelle wenn du Fakten verwendest.
`;

    console.log(`[nox-memory-qdrant] Injecting ${memories.length} memories`);

    return {
      prependContext,
    };

  } catch (error) {
    console.error("[nox-memory-qdrant] Error during recall:", error);
    return undefined;
  }
}

/**
 * Get memory status for reporting
 */
export async function getMemoryStatus(): Promise<string> {
  const healthy = await isHealthy();
  return healthy ? "Qdrant (via mcporter): healthy" : "Qdrant: unavailable";
}
