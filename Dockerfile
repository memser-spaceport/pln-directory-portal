# ============================
# Stage 1: Builder
# ============================
FROM node:20.19-bookworm AS builder

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock ./
COPY .forestadmin-schema.json ./
COPY patches ./patches

RUN yarn install --frozen-lockfile

COPY . .

RUN npx prisma generate --schema=apps/web-api/prisma/schema.prisma
RUN npx prisma generate --schema=apps/web-api/prisma/oso-schema.prisma

RUN yarn build

# ============================
# Stage 2: Production dependencies
# ============================
FROM node:20.19-bookworm AS prod-deps

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock ./
COPY patches ./patches

RUN yarn install --frozen-lockfile --production=true \
  && yarn cache clean

# ============================
# Stage 3: Production
# ============================
FROM node:20.19-bookworm-slim

RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

COPY --from=prod-deps /app/package.json /app/yarn.lock ./
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web-api/prisma ./apps/web-api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/.forestadmin-schema.json ./

RUN chown -R app:app /app && chmod -R u+w /app

USER app

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=./apps/web-api/prisma/schema.prisma && npm run start:prod"]
