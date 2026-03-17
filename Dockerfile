FROM node:22-alpine AS builder

# Install dependencies needed for native modules (argon2, serialport)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./

# Enable Yarn 4
RUN corepack enable && corepack prepare yarn@4.9.2 --activate

# Install deps (node_modules mode)
RUN yarn install --immutable

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN yarn generate

# Copy source code
COPY . .

# Build all services
RUN yarn build

# ── Production stage ──
FROM node:22-alpine AS production

RUN apk add --no-cache tini

ENV NODE_ENV=production

WORKDIR /app

# Copy prisma client (generated) and engine
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy prisma migrations (for migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Copy built dist — each app has its own generated package.json
COPY --from=builder /app/dist ./dist

# Install production dependencies per service (using generated package.json)
# We use core-api's generated package.json as the base since it has the most deps
RUN cd dist/apps/core-api && npm install --omit=dev 2>/dev/null || true

EXPOSE 3001 3002 3003 3004

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default: start core-api (overridden per service in docker-compose/render.yaml)
CMD ["node", "dist/apps/core-api/main.js"]
