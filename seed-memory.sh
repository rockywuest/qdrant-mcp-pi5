#!/bin/bash
# seed-memory.sh — Bulk-load memories into Qdrant via mcporter
# Usage: ./seed-memory.sh

set -e

store() {
  echo "  Storing: ${1:0:60}..."
  mcporter call qdrant-memory.qdrant-store information="$1" > /dev/null 2>&1
}

echo "Seeding Qdrant memory..."
echo ""

# Add your memories here:
store "Example: The project started on January 25, 2026"
store "Example: The main server runs on a Raspberry Pi 5 with 8GB RAM"
store "Example: Backups run daily at 03:00 via systemd timer"

echo ""
echo "Done! Test with:"
echo "  mcporter call qdrant-memory.qdrant-find query=\"When did the project start?\""
