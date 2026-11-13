#!/usr/bin/env bash
# Builds the game server into one file, server-dist/main.mjs (ROADMAP G5.7), for hosts like Render.
# The server needs only `ws` and the engine, so instead of `npm ci` for the whole project (three,
# vite, playwright…, which ran a free build machine out of memory) this installs just esbuild and
# ws into a scratch folder and bundles src/server/main.ts. Run it: `node server-dist/main.mjs`.
# Usage: bash scripts/build-server.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# keep in step with package.json
ESBUILD=0.25.12
WS=8.22.2

TOOLS="$(mktemp -d)"
trap 'rm -rf "$TOOLS"' EXIT
npm install --prefix "$TOOLS" --no-save --no-package-lock --no-audit --no-fund --loglevel=error "esbuild@$ESBUILD" "ws@$WS"

# NODE_PATH lets esbuild find ws in the scratch folder; ws's optional native add-ons stay out (it
# falls back to plain JS); the banner gives the ESM bundle a `require` for ws's CommonJS internals
NODE_PATH="$TOOLS/node_modules" "$TOOLS/node_modules/.bin/esbuild" src/server/main.ts \
  --bundle --platform=node --format=esm --target=node22 \
  --external:bufferutil --external:utf-8-validate \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
  --outfile=server-dist/main.mjs --log-level=warning

echo "built server-dist/main.mjs ($(wc -c < server-dist/main.mjs | tr -d ' ') bytes)"
