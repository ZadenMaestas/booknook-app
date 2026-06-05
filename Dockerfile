# syntax=docker/dockerfile:1
FROM oven/bun:1

WORKDIR /app

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # PDF handling (cover extraction, PDF EPUB conversion) \
    poppler-utils \
    # Cover image resizing
    imagemagick \
    # CBZ + CBR archive support
    7zip \
    # Health check
    curl \
    # TLS / certs
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Debian ships ImageMagick 6 as 'convert'; shim the 'magick' name used by the app
RUN ln -sf /usr/bin/convert /usr/local/bin/magick

# ── Bun dependencies ──────────────────────────────────────────────────────────
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Application source ────────────────────────────────────────────────────────
COPY . .

# ── Runtime data dirs (overridden by volume mounts in production) ─────────────
RUN mkdir -p books comics cache/covers data

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fs http://localhost:3001/login > /dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
