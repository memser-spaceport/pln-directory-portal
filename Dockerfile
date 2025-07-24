# Stage 1: Builder
# Use Node.js 18 Bullseye image which includes OpenSSL 1.1 for Prisma
FROM node:18-bullseye-slim AS builder

# Enable corepack to use the yarn version from package.json
RUN corepack enable

# Create a non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Set the working directory and give the new user ownership
WORKDIR /app

# Give the new user ownership of the working directory
RUN chown -R nodejs:nodejs /app

# Set cache directories for tools to prevent permission errors
ENV COREPACK_HOME=/app/.corepack-cache
ENV YARN_CACHE_FOLDER=/app/.yarn-cache
ENV NPM_CONFIG_CACHE=/app/.npm-cache
ENV CYPRESS_INSTALL_BINARY=0

# Switch to the non-root user
USER nodejs

# Copy package files and install all dependencies (including dev) for building
COPY --chown=nodejs:nodejs package*.json yarn.lock ./

# Install all dependencies (including dev) for building
RUN yarn install --frozen-lockfile

# Copy the rest of the application source code
COPY --chown=nodejs:nodejs . .

# Generate Prisma client using the correct schema path
RUN npx prisma generate --schema=./apps/web-api/prisma/schema.prisma
RUN npx prisma generate --schema=./apps/web-api/prisma/oso-schema.prisma

# Build the application
RUN yarn run build

# Stage 2: Production
# Use a fresh slim image for the final production image
FROM node:18-bullseye-slim

# Create a non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Set the working directory and give the new user ownership
WORKDIR /app

# Give the new user ownership of the working directory
RUN chown -R nodejs:nodejs /app

# Enable corepack to use the yarn version from package.json
# RUN corepack enable

# Set cache directories for tools to prevent permission errors
ENV COREPACK_HOME=/app/.corepack-cache
ENV YARN_CACHE_FOLDER=/app/.yarn-cache
ENV NPM_CONFIG_CACHE=/app/.npm-cache
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Switch to the non-root user
USER nodejs

# Copy package files from the builder
COPY --chown=nodejs:nodejs --from=builder /app/package*.json /app/yarn.lock ./
COPY --chown=nodejs:nodejs --from=builder /app/dist ./dist
COPY --chown=nodejs:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs --from=builder /app/apps/web-api/prisma ./apps/web-api/prisma
COPY --chown=nodejs:nodejs --from=builder /app/node_modules/.prisma ./dist/apps/web-api/.prisma

# Expose the application port
EXPOSE 3000

# The command to run the application
CMD [ "npm", "run", "start:migrate:prod" ]
