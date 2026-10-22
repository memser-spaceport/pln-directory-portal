# syntax=docker/dockerfile:1.7
#
# Builds the `web-api` (directory-service) image.
#
#   builder    – full dependency install + Prisma clients + `yarn build`
#   prod-deps  – production-only node_modules (+ Prisma clients) for runtime
#   runtime    – slim image with only dist/, node_modules and Prisma migrations
#
# `builder` and `prod-deps` only depend on package.json / yarn.lock, so they stay
# cached between source-only commits. The runtime image must never contain
# devDependencies, the sources or build tooling.

ARG NODE_VERSION=22.23.4

# ============================
# Stage 1: builder
# ============================
FROM node:${NODE_VERSION}-bookworm AS builder

WORKDIR /app

# Skip binaries that are irrelevant for a server build and Nx Cloud, which is
# unreachable from the build network (it only adds a long timeout to `nx build`).
ENV CYPRESS_INSTALL_BINARY=0 \
    SENTRYCLI_SKIP_DOWNLOAD=1 \
    HUSKY=0 \
    NX_NO_CLOUD=true \
    NX_DAEMON=false

RUN corepack enable

COPY package.json yarn.lock ./
COPY patches ./patches
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile

COPY . .

RUN npx prisma generate --schema=apps/web-api/prisma/schema.prisma \
 && npx prisma generate --schema=apps/web-api/prisma/oso-schema.prisma

RUN yarn build

# ============================
# Stage 2: production dependencies
# ============================
FROM node:${NODE_VERSION}-bookworm AS prod-deps

WORKDIR /app

ENV SENTRYCLI_SKIP_DOWNLOAD=1 \
    HUSKY=0

RUN corepack enable

COPY package.json yarn.lock ./
COPY patches ./patches
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --production

# Prisma clients are generated into node_modules, so they must be generated
# against the node_modules that ship in the image.
COPY apps/web-api/prisma ./apps/web-api/prisma
RUN npx prisma generate --schema=apps/web-api/prisma/schema.prisma \
 && npx prisma generate --schema=apps/web-api/prisma/oso-schema.prisma

# ============================
# Stage 3: runtime
# ============================
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# openssl: Prisma engines (debian-openssl-3.0.x) link against libssl.
# ca-certificates: outbound HTTPS (AWS, OpenSearch, AI providers, ...).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app app \
 && mkdir -p /app && chown app:app /app

WORKDIR /app

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=builder   --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./
COPY --chown=app:app apps/web-api/prisma ./apps/web-api/prisma
# Forest Admin rewrites this file on startup outside production.
COPY --chown=app:app .forestadmin-schema.json ./

# Fail the build (not the deploy) if the bundle requires a package that is
# missing from the production node_modules.
RUN --mount=type=bind,source=tools/docker/check-runtime-deps.js,target=/tmp/check-runtime-deps.js \
    node /tmp/check-runtime-deps.js dist/apps/web-api/main.js

USER app

EXPOSE 3000

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema=./apps/web-api/prisma/schema.prisma && exec node dist/apps/web-api/main.js"]
