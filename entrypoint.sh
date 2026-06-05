#!/bin/sh
set -e

# Ensure data directories exist (volume mounts may be empty on first run)
mkdir -p \
    /app/data \
    /app/books \
    /app/comics \
    /app/cache/covers

exec bun run app.ts
