# ============================
# Stage 1: Builder
# ============================
FROM node:18-bookworm AS builder

WORKDIR /app

# Enable corepack (for Yarn support)
RUN corepack enable

# Copy dependency files
COPY package.json yarn.lock ./
COPY .forestadmin-schema.json ./
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma clients
RUN npx prisma generate --schema=apps/web-api/prisma/schema.prisma
RUN npx prisma generate --schema=apps/web-api/prisma/oso-schema.prisma

# Build the app
RUN yarn build

# ============================
# Stage 2: Production
# ============================
FROM node:18-bookworm

# Install system dependencies for pdf2pic (GraphicsMagick + Ghostscript)
RUN apt-get update && \
    apt-get install -y graphicsmagick ghostscript && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

# Copy built artifacts and only required files
COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web-api/prisma ./apps/web-api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/.forestadmin-schema.json ./

# Fix permissions
RUN chown -R app:app /app && chmod -R u+w /app

USER app

EXPOSE 3000

# Start command with better error handling
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./apps/web-api/prisma/schema.prisma && npm run start:prod"]
