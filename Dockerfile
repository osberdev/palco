# PALCO image: the built Nuxt server plus the database scripts it needs at startup.
# Three stages: `build` compiles the application with every dependency, `deps`
# installs only the production dependencies, and the final stage carries neither
# compilers nor development dependencies.

ARG NODE_IMAGE=node:24.19.0-bookworm-slim
ARG BUN_IMAGE=oven/bun:1.3.14-debian

FROM ${BUN_IMAGE} AS bun

# ── build ─────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
# bcrypt is a native addon: without a prebuilt binary for this Node ABI it is
# compiled from source, which needs these tools. They stay in this stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
# Everything, because `postinstall` runs `nuxt prepare` against the whole project.
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build

# ── deps ──────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
# `postinstall` runs `nuxt prepare`, which needs the development modules; the
# production install only has to compile bcrypt, so the hook is dropped here.
# Peer dependencies (eslint, typescript, vue-tsc) are only wanted by build tools.
RUN npm pkg delete scripts.postinstall \
  && bun install --frozen-lockfile --production --omit=peer

# ── runtime ───────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
# tzdata so that TZ selects the local day: the server decides "today", past dates
# and the gate's opening hours with its own clock.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=America/Mexico_City
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
# The database scripts run from source (Node strips the types) and import the
# server's domain, data and repositories.
COPY package.json ./
COPY scripts ./scripts
COPY server ./server
COPY types ./types
COPY utils ./utils
COPY docker/app ./docker/app
USER node
EXPOSE 3000
CMD ["sh", "docker/app/start.sh"]
