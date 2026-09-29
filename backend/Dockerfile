# Build from the REPO ROOT context:
#   docker build -f backend/Dockerfile -t devops-app .
# Produces a single image: Express API serving the built React UI.
# ============================================================================
# STAGE 1: Frontend build (React/Vite -> static assets)
# ============================================================================
FROM node:20-alpine AS frontend
WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ============================================================================
# STAGE 2: Backend deps
# ============================================================================
FROM node:20-alpine AS builder
WORKDIR /build
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ============================================================================
# STAGE 3: Runtime
# ============================================================================
FROM node:20-alpine
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /build/node_modules ./node_modules
COPY --chown=nodejs:nodejs backend/app.js ./
COPY --chown=nodejs:nodejs backend/package.json ./
COPY --chown=nodejs:nodejs backend/src ./src
COPY --chown=nodejs:nodejs backend/scripts ./scripts
# SQL migrations (from the top-level database/ dir)
COPY --chown=nodejs:nodejs database/migrations ./migrations
# Built UI
COPY --from=frontend --chown=nodejs:nodejs /ui/dist ./public

ENV NODE_ENV=production \
    FRONTEND_DIST=/app/public \
    MIGRATIONS_DIR=/app/migrations

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "app.js"]
