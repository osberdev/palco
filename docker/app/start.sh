#!/bin/sh
# The application container: the same pre-flight check as `bun run start`, then
# the built server.
set -eu
cd /app
node --import ./scripts/resolve-ts.ts scripts/start-check.ts
exec node .output/server/index.mjs
