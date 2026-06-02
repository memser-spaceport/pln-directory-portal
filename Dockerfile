# syntax=docker/dockerfile:1.7

FROM node:20.19-bullseye AS deps
WORKDIR /app
RUN corepack enable

COPY package.json yarn.lock ./
COPY patches ./patches

RUN --mount=type=cache,target=/root/.cache/yarn \
    yarn install --frozen-lockfile

FROM node:20.19-bullseye AS builder
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate --schema=./apps/web-api/prisma/schema.prisma
RUN npx prisma generate --schema=./apps/web-api/prisma/oso-schema.prisma

RUN yarn nx build web-api --configuration=production

FROM node:20.19-bullseye AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN groupadd -r app && useradd -r -g app app

COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web-api/prisma ./apps/web-api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/.forestadmin-schema.json ./

RUN chown -R app:app /app

USER app
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=./apps/web-api/prisma/schema.prisma && npm run start:prod"]
