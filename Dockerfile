# Stage 1: Builder
# Use Node.js 18 Bullseye image which includes OpenSSL 1.1 for Prisma
FROM node:18-bullseye-slim AS builder

# Enable corepack to use the yarn version from package.json
RUN corepack enable

# Create a non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Set the working directory and give the new user ownership
WORKDIR /app
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
RUN yarn install --frozen-lockfile

# Copy the rest of the application source code
COPY --chown=nodejs:nodejs . .

# Generate Prisma client using the correct schema path
RUN npx prisma generate --schema=./apps/web-api/prisma/schema.prisma

# Build the application
RUN yarn run build

# Stage 2: Production
# Use a fresh slim image for the final production image
FROM node:18-bullseye-slim

# Set production environment
ENV NODE_ENV=production

# Enable corepack to use the yarn version from package.json
RUN corepack enable

# Create a non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Set the working directory and give the new user ownership
WORKDIR /app
RUN chown -R nodejs:nodejs /app

# Set cache directories for tools to prevent permission errors
ENV COREPACK_HOME=/app/.corepack-cache
ENV YARN_CACHE_FOLDER=/app/.yarn-cache
ENV NPM_CONFIG_CACHE=/app/.npm-cache

# Switch to the non-root user
USER nodejs

# Copy package files from the builder
COPY --chown=nodejs:nodejs --from=builder /app/package*.json /app/yarn.lock ./

# Install only production dependencies
RUN yarn install --production --frozen-lockfile

# Copy built application, prisma schema and migrations from the builder stage
COPY --chown=nodejs:nodejs --from=builder /app/dist ./dist
COPY --chown=nodejs:nodejs --from=builder /app/apps/web-api/prisma ./prisma

# Expose the application port
EXPOSE 3000

# Add a health check to ensure the application is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD [ "node", "-e", "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode === 200 ? 0 : 1))" ]

# The command to run the application
CMD [ "npm", "run", "start:migrate:prod" ]