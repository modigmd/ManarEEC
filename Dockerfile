# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      build-essential \
      verilator \
      binutils-riscv64-unknown-elf \
      nlohmann-json3-dev \
      util-linux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY eec-riscv-playground/package.json eec-riscv-playground/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY eec-riscv-playground/ ./
RUN npm run setup:sim \
    && npm test \
    && npm run build \
    && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime

# Assembly remains available at runtime; Verilator and C++ headers are build-only.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      binutils-riscv64-unknown-elf \
      libstdc++6 \
      util-linux \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/sim/linker.ld ./sim/linker.ld
COPY --from=build --chown=node:node /app/vendor/picorv32/LICENSE ./vendor/picorv32/LICENSE
COPY --from=build --chown=node:node /app/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
RUN mkdir -p /app/.cache/assembly && chown -R node:node /app/.cache

USER node
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node --input-type=module -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(async response => { const body = await response.json(); process.exit(response.ok && body.simulator ? 0 : 1); }).catch(() => process.exit(1))"

CMD ["node", "server/index.mjs", "--production"]
