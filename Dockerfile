FROM node:20-alpine

# Install dependencies needed for native modules
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

# Build the application
RUN yarn build

# Expose application port
EXPOSE 3001

# Start production server
CMD ["node", "dist/apps/core-api/main"]
