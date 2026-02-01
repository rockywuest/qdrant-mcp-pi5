# Qdrant MCP on Raspberry Pi 5

**Persistent semantic memory for AI agents — local, private, $0 cost.**

Give your AI agent a real memory that survives reboots, searches by meaning (not keywords), and runs entirely on a Raspberry Pi 5 with no cloud dependencies.

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

## Links

- [Qdrant MCP Server](https://github.com/qdrant/mcp-server-qdrant)
- [mcporter](https://github.com/steipete/mcporter)
- [OpenClaw](https://github.com/openclaw/openclaw)
- [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [MCP Specification](https://modelcontextprotocol.io)

---

## License

MIT
