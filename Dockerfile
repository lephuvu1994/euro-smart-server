FROM node:22-alpine AS builder

# Install dependencies needed for native modules (argon2, serialport)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./

# Copy prisma schema BEFORE yarn install
# Required because postinstall runs 'prisma generate' which needs schema.prisma
COPY prisma ./prisma/

# Enable Yarn 4
RUN corepack enable && corepack prepare yarn@4.9.2 --activate

# Install deps — postinstall will run prisma generate automatically
RUN yarn install --immutable

# Copy source code
COPY . .

# Build all services
RUN yarn build

# ── Production stage ──
FROM node:22-alpine AS production

RUN apk add --no-cache tini

ENV NODE_ENV=production

WORKDIR /app

# Copy ALL node_modules from builder
# Avoids cascade dependency issues (pino-pretty → colorette → ..., @prisma/client → .prisma/client)
# Packages loaded dynamically (pino transport, prisma engine) need their full dep tree
COPY --from=builder /app/node_modules ./node_modules

# Copy prisma migrations
COPY --from=builder /app/prisma ./prisma

# Copy built dist
COPY --from=builder /app/dist ./dist

# Copy entrypoint script (auto migrate on startup)
COPY deploy/docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3001 3002 3003 3004

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default: start core-api (overridden per service in docker-compose/render.yaml)
CMD ["node", "dist/apps/core-api/main.js"]
