# ==============================================================================
# ⚡ YuriPay - Production Dockerfile (Stateful Daemon Runtime)
# ==============================================================================
# CATATAN ARSITEKTUR:
# YuriPay adalah stateful gateway yang membutuhkan background polling realtime
# dan SQLite WAL persistence. Docker memastikan proses berjalan stabil 24/7.
# ==============================================================================

FROM node:20-alpine AS base

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies (production)
RUN npm ci --only=production

# Copy application files
COPY . .

# Ensure database directory exists for SQLite storage
RUN mkdir -p database

# Expose both isolated ports
# Port 3000: Admin Dashboard & Kasir Internal
# Port 3001: Customer Checkout Gateway & Public API
EXPOSE 3000 3001

ENV NODE_ENV=production
ENV DASHBOARD_PORT=3000
ENV PAYMENT_PORT=3001

# Run stateful Node.js server
CMD ["node", "server.js"]
