"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.beforeAgentStart = beforeAgentStart;
exports.getMemoryStatus = getMemoryStatus;
const { searchMemories, isHealthy } = require("./qdrant-client.js");

/**
 * Extract actual user query from potentially modified message content
 */
function extractUserQuery(content) {
    let text = null;
    
    if (typeof content === "string") {
        text = content;
    } else if (Array.isArray(content)) {
        for (const part of content) {
            if (part && part.type === "text" && part.text) {
                text = part.text;
                break;
            }
        }
    }
    
    if (!text) return null;
    
    // If this looks like injected context, try to find the user query
    if (text.includes("DRIFT-MEMORY") || text.includes("QDRANT MEMORY") || text.startsWith("##")) {
        // Split by --- and look for user content after all injected blocks
        const parts = text.split(/\n---\n?/);
        
        // Work backwards to find actual user content
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i].trim();
            
            // Skip empty parts
            if (!part) continue;
            
            // Skip parts that look like injected context
            if (part.startsWith("##") || 
                part.startsWith("*") ||
                part.includes("DRIFT-MEMORY") ||
                part.includes("QDRANT MEMORY") ||
                part.includes("Co-occurrence") ||
                part.includes("security-critical") ||
                part.includes("IDENTITY") ||
                part.includes("BOOT.md")) {
                continue;
            }
            
            // This looks like user content
            if (part.length > 3) {
                return part;
            }
        }
        
        return null;  // Only injected context found
    }
    
    return text;
}

function extractUserMessage(event, ctx) {
    if (!event.messages || !Array.isArray(event.messages)) {
        return null;
    }
    
    // Find the LAST user message with actual query content
    for (let i = event.messages.length - 1; i >= 0; i--) {
        const msg = event.messages[i];
        if (msg && msg.role === "user") {
            const query = extractUserQuery(msg.content);
            if (query && query.length > 3) {
                const metaMatch = query.match(/^\[\w+ .*?\] (.*)$/s); return metaMatch ? metaMatch[1] : query;
            }
        }
    }
    return null;
}

async function beforeAgentStart(event, ctx) {
    const userMessage = extractUserMessage(event, ctx);
    
    if (!userMessage) {
        console.log("[nox-memory-qdrant] No user query found (only system content)");
        return undefined;
    }
    
    if (userMessage.length < 5) return undefined;
    
    const skipPatterns = [/^(hi|hey|hallo|moin|ok|ja|nein|danke|thanks|NO_REPLY)$/i, /^HEARTBEAT/i];
    if (skipPatterns.some(p => p.test(userMessage.trim()))) return undefined;
    
    const healthy = await isHealthy();
    if (!healthy) return undefined;
    
    console.log(`[nox-memory-qdrant] User query: "${userMessage.substring(0, 80)}"`);
    
    try {
        const startTime = Date.now();
        const memories = await searchMemories(userMessage, 5);
        console.log(`[nox-memory-qdrant] Found ${memories.length} results in ${Date.now() - startTime}ms`);
        
        if (memories.length === 0) return undefined;
        
        const memoryText = memories.map((m, i) => {
            const score = typeof m.score === "number" ? `[${(m.score * 100).toFixed(0)}%]` : "";
            return `${i + 1}. ${score} ${m.content}`;
        }).join("\n\n");
        
        console.log(`[nox-memory-qdrant] Injecting ${memories.length} memories`);
        return { prependContext: `## QDRANT MEMORY\n\n${memoryText}\n\n---` };
    } catch (error) {
        console.error("[nox-memory-qdrant] Error:", error.message);
        return undefined;
    }
}

async function getMemoryStatus() {
    return (await isHealthy()) ? "Qdrant: healthy" : "Qdrant: unavailable";
}
