# ============================
# Stage 1: Builder
# ============================
FROM node:18-bullseye-slim AS builder

WORKDIR /app

# Enable corepack (for Yarn support)
RUN corepack enable

# Copy dependency files and install all dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy full source code
COPY . .

# Generate both Prisma clients
RUN npx prisma generate --schema=./apps/web-api/prisma/schema.prisma
RUN npx prisma generate --schema=./apps/web-api/prisma/oso-schema.prisma

# Build the app
RUN yarn build

# ============================
# Stage 2: Production
# ============================
FROM node:18-bullseye-slim

# Create a non-root user for security
RUN groupadd -r app && useradd -r -g app app

WORKDIR /app
USER app

# Copy built artifacts and only required files
COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web-api/prisma ./apps/web-api/prisma
COPY --from=builder /app/node_modules/.prisma ./dist/apps/web-api/.prisma

# Expose your application port
EXPOSE 3000

# Start command with better error handling
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./apps/web-api/prisma/schema.prisma && npm run start:prod"]
