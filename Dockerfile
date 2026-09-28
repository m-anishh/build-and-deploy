# ============================================================================
# STAGE 1: Builder
# ============================================================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /build

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# ============================================================================
# STAGE 2: Runtime
# ============================================================================
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy node_modules from builder stage
COPY --from=builder --chown=nodejs:nodejs /build/node_modules ./node_modules

# Copy application files
COPY --chown=nodejs:nodejs app.js .
COPY --chown=nodejs:nodejs package.json .
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs migrations ./migrations
COPY --chown=nodejs:nodejs scripts ./scripts

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Start application
CMD ["node", "app.js"]
