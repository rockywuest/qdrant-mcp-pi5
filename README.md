# Qdrant MCP on Raspberry Pi 5

![Qdrant MCP on Pi 5](assets/hero.png)

**Persistent semantic memory for AI agents — local, private, $0 cost.**

Give your AI agent a real memory that survives reboots, searches by meaning (not keywords), and runs entirely on a Raspberry Pi 5 with no cloud dependencies.

> **New:** Includes an [OpenClaw Hard Enforcement Plugin](#hard-enforcement-plugin-openclaw) that automatically injects memories before every response — no LLM decision required.

> **Recommended:** Pair with [drift-memory](https://github.com/driftcornwall/drift-memory) for behavioral pattern tracking. See [Hybrid Architecture](#hybrid-architecture-qdrant--drift-memory).

---

## The Problem

AI agents forget. Between sessions, context compaction loses details, and text-based memory search only finds exact keyword matches. A typical agent can make **10+ memory errors in its first week** — wrong dates, stale data, presenting old topics as new.

## The Solution

Local vector database (Qdrant) with MCP (Model Context Protocol) integration. Facts are stored as 384-dimensional embeddings and retrieved by **semantic similarity** — meaning-based, not keyword-based.

```
"What's the wifi password?" → finds "Office wifi: network 'Workspace5G', password is 'correct-horse-battery'"
```

The words don't match, but the meaning does. That's the difference.

---

## Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| **Raspberry Pi 5** | 8GB RAM | Hardware |
| **Qdrant MCP Server** | v0.8.1 | Vector storage + search |
| **all-MiniLM-L6-v2** | 384-dim | Embedding model (ONNX, CPU) |
| **mcporter** | v0.7.3 | MCP client / bridge |
| **OpenClaw** | 2026.1.30 | Agent framework (optional) |

## Performance (Pi 5, ARM64)

| Operation | Time | Notes |
|-----------|------|-------|
| Store (embed + write) | ~3s | Includes model load |
| Search (embed + cosine) | ~3s | Includes model load |
| RAM spike | ~200MB | During inference, then drops |
| Storage | ~KB per entry | SQLite-backed, negligible |

---

## Quick Start (5 minutes)

### 1. Install dependencies

```bash
# Qdrant MCP Server
pip3 install mcp-server-qdrant

# mcporter (MCP client)
npm install -g mcporter
```

### 2. Create mcporter config

```bash
mkdir -p ~/.mcporter
```

Create `~/.mcporter/mcporter.json`:

```json
{
  "mcpServers": {
    "qdrant-memory": {
      "command": "mcp-server-qdrant",
      "description": "Persistent vector memory using local Qdrant storage",
      "env": {
        "QDRANT_LOCAL_PATH": "/home/pi/.qdrant-data",
        "COLLECTION_NAME": "agent-memory"
      }
    }
  }
}
```

> **Note:** Use an absolute path for `QDRANT_LOCAL_PATH`. Tilde (`~`) is not expanded in environment variables passed by mcporter. If `mcporter list` can't find the server, also try the full path for `command` (e.g. `/home/pi/.local/bin/mcp-server-qdrant`).

### 3. Verify it works

```bash
# Check server is registered
mcporter list

# Store a memory
mcporter call qdrant-memory.qdrant-store \
  information="The project runs on a Raspberry Pi 5 in my office"

# Search by meaning
mcporter call qdrant-memory.qdrant-find \
  query="Where does the project run?"
```

That's it. No Docker, no cloud accounts, no GPU.

---

## How It Works

```
Agent wants to remember something
  ↓
mcporter call qdrant-memory.qdrant-store information="..."
  ↓
mcp-server-qdrant spawns (STDIO)
  ↓
all-MiniLM-L6-v2 creates 384-dim embedding (ONNX, CPU)
  ↓
Qdrant stores vector + text in local SQLite
  ↓
Process exits cleanly

Agent wants to recall something
  ↓
mcporter call qdrant-memory.qdrant-find query="..."
  ↓
Query embedded with same model
  ↓
Cosine similarity search over stored vectors
  ↓
Top results returned by semantic relevance
```

Key insight: The MCP server is **stateless** — it spawns per-call, does its work, and exits. No daemon process eating RAM. Qdrant's local mode uses SQLite, so data persists without a running server.

---

## Seed Script

Use `seed-memory.sh` to bulk-load memories:

```bash
./seed-memory.sh
```

Or store individual facts:

```bash
mcporter call qdrant-memory.qdrant-store \
  information="Weekly standup is every Monday at 09:00 in the main conference room" \
  metadata='{"type": "recurring", "day": "monday"}'
```

The optional `metadata` field accepts any JSON — useful for filtering or categorization.

---

## Use Cases

### AI Agent Memory
Store decisions, corrections, and facts. Before generating responses, search memory to verify claims. Prevents confabulation.

### Personal Knowledge Base
"Where did I put the spare keys?" / "What was the name of that restaurant?" — semantic search over your life notes.

### Shared Memory
Second collection for household or team info — schedules, appointments, decisions. Query via chat bot or voice assistant.

### Project Context
Store architecture decisions, meeting notes, requirements. New team members can query: "Why did we choose Postgres over MongoDB?"

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QDRANT_LOCAL_PATH` | required | Absolute path to local storage directory |
| `COLLECTION_NAME` | required | Qdrant collection name |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | HuggingFace model ID |

### Multiple Collections

```json
{
  "mcpServers": {
    "work-memory": {
      "command": "mcp-server-qdrant",
      "env": {
        "QDRANT_LOCAL_PATH": "/home/pi/.qdrant-data",
        "COLLECTION_NAME": "work"
      }
    },
    "personal-memory": {
      "command": "mcp-server-qdrant",
      "env": {
        "QDRANT_LOCAL_PATH": "/home/pi/.qdrant-data",
        "COLLECTION_NAME": "personal"
      }
    }
  }
}
```

### Running on k3s / Docker

If you prefer containerized Qdrant instead of local SQLite mode:

```yaml
# k3s / Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qdrant
spec:
  replicas: 1
  selector:
    matchLabels:
      app: qdrant
  template:
    metadata:
      labels:
        app: qdrant
    spec:
      containers:
      - name: qdrant
        image: qdrant/qdrant:latest
        ports:
        - containerPort: 6333
        volumeMounts:
        - name: qdrant-storage
          mountPath: /qdrant/storage
      volumes:
      - name: qdrant-storage
        persistentVolumeClaim:
          claimName: qdrant-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: qdrant
spec:
  selector:
    app: qdrant
  ports:
  - port: 6333
    targetPort: 6333
```

Then point mcporter at the server instead of using local mode:

```json
{
  "mcpServers": {
    "qdrant-memory": {
      "command": "mcp-server-qdrant",
      "env": {
        "QDRANT_URL": "http://qdrant:6333",
        "COLLECTION_NAME": "agent-memory"
      }
    }
  }
}
```

> **Note:** You cannot use both `QDRANT_URL` and `QDRANT_LOCAL_PATH` simultaneously. Use `QDRANT_URL` for server mode (Docker/k3s), `QDRANT_LOCAL_PATH` for embedded local mode (no server needed).

---

## Important Notes

- **OpenClaw v2026.1.30** does not support `mcpServers` in its config schema (gateway crash-loops). Use mcporter as the bridge — it works seamlessly via the bundled mcporter skill.
- **First call is slower** (~3-5s) as the ONNX model loads. Subsequent calls in quick succession reuse the process.
- **Embedding model runs on CPU** — no GPU needed. The all-MiniLM-L6-v2 model is optimized for ONNX runtime on ARM64.
- **Data is local** — nothing leaves your device. No API keys needed for the vector DB.

---

## Hard Enforcement Plugin (OpenClaw)

The basic setup above requires the LLM to *decide* to query Qdrant. In practice, agents "forget" to use memory tools — they're optional, and LLMs skip them when rushing to answer.

**Hard Enforcement** solves this: an OpenClaw plugin that automatically queries Qdrant before every response and injects relevant memories into the prompt. No LLM decision required.

### How It Works

```
User message arrives
  ↓
before_agent_start hook fires
  ↓
Plugin extracts user query
  ↓
mcporter calls qdrant-find
  ↓
Top 5 results injected as prependContext
  ↓
LLM sees memories BEFORE generating response
```

### Installation

```bash
cd openclaw-plugin
npm install
npm run build

# Copy to OpenClaw extensions
sudo cp -r . /usr/lib/node_modules/openclaw/extensions/nox-memory-qdrant/

# Restart OpenClaw
sudo systemctl restart openclaw-gateway
```

### Plugin Structure

```
openclaw-plugin/
├── package.json              # @nox/memory-qdrant
├── openclaw.plugin.json      # Plugin manifest
├── tsconfig.json
└── src/
    ├── index.ts              # Plugin entry + register()
    ├── qdrant-client.ts      # mcporter CLI wrapper
    └── auto-recall.ts        # before_agent_start hook
```

### What Gets Injected

When a user asks "Wer ist Martin Grieß?", the plugin:

1. Calls `mcporter run qdrant-memory qdrant-find --query "Wer ist Martin Grieß?"`
2. Gets results from Qdrant (semantic search)
3. Injects them as:

```markdown
## QDRANT MEMORY RECALL (automatisch, Hard Enforcement)

Relevante Informationen aus der Vektordatenbank:

1. [87%] Martin Grieß ist Head of Data bei H. & J. Brüggen KG (Quelle: people.md)
2. [72%] Martin arbeitet eng mit dem CDO Rocky Wüst zusammen (Quelle: org.md)

---
Diese Informationen wurden automatisch abgerufen.
```

The LLM sees this context **before** it starts generating — no decision to "use memory" needed.

### Configuration

The plugin has minimal config:

```json
{
  "enabled": true
}
```

Skip patterns (short messages like "hi", "ok", "danke") are handled automatically to avoid unnecessary queries.

### Performance

| Metric | Value |
|--------|-------|
| Latency per query | ~100-500ms |
| Health check cache | 30 seconds |
| Max results | 5 (configurable) |

### Soft vs Hard Enforcement

| Approach | How it works | Reliability |
|----------|-------------|-------------|
| **Soft** (AGENTS.md rules) | LLM instructed to use Qdrant | ~60-70% |
| **Hard** (this plugin) | Hook injects memories automatically | ~99% |

Use both together for maximum coverage: hard enforcement catches everything, soft enforcement teaches the LLM to cite sources properly.

---

## Hybrid Architecture: Qdrant + drift-memory

Qdrant excels at **semantic retrieval** — finding facts by meaning. But it doesn't track *how* the agent uses knowledge over time.

[drift-memory](https://github.com/driftcornwall/drift-memory) complements Qdrant with **co-occurrence tracking**:

| System | Good at | Example Query |
|--------|---------|---------------|
| **Qdrant** | Facts, entities, semantic similarity | "Who is Martin Grieß?" |
| **drift-memory** | Behavioral patterns, preferences | "What communication style works best?" |

### How They Work Together

```
┌─────────────────────────────────────────────────────────────┐
│                    HYBRID MEMORY STACK                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐     ┌─────────────────────┐        │
│  │       Qdrant        │     │    drift-memory     │        │
│  │       (WHAT)        │     │       (HOW)         │        │
│  │                     │     │                     │        │
│  │  • 384-dim vectors  │     │  • YAML files       │        │
│  │  • Cosine similarity│     │  • Co-occurrence    │        │
│  │  • Hard enforcement │     │  • Biological decay │        │
│  │  • ~3s latency      │     │  • <100ms latency   │        │
│  └─────────────────────┘     └─────────────────────┘        │
│           ↓                           ↓                      │
│   "What do I know             "How does the user            │
│    about X?"                   prefer to work?"              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Insight

From the drift-memory maintainers:

> "Co-occurrence tells you HOW the agent uses its knowledge. Vector embeddings tell you WHAT is semantically similar. They serve different purposes."

Memories retrieved together become linked. Over sessions, patterns emerge organically — no manual relationship tagging needed.

### Integration

1. Use Qdrant for **fact retrieval** (this repo)
2. Use drift-memory for **behavioral patterns** ([drift-memory repo](https://github.com/driftcornwall/drift-memory))
3. Both can run on Pi 5 with minimal resource conflict

---

## Links

- [Qdrant MCP Server](https://github.com/qdrant/mcp-server-qdrant)
- [mcporter](https://github.com/steipete/mcporter)
- [OpenClaw](https://github.com/openclaw/openclaw)
- [drift-memory](https://github.com/driftcornwall/drift-memory) — Biological-style memory with co-occurrence tracking
- [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [MCP Specification](https://modelcontextprotocol.io)

---

## License

MIT
