# PM2 Deployment Guide

## Prerequisites

```bash
# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install Yarn 4
corepack enable && corepack prepare yarn@4.9.2 --activate
```

## Deploy

```bash
# 1. Clone & install
git clone <your-repo-url> /opt/euro-smart-server
cd /opt/euro-smart-server
cp .env.example .env   # Edit with real values
yarn install --immutable

# 2. Generate Prisma & build
yarn generate
yarn build

# 3. Run database migrations
yarn migrate:prod

# 4. Start all services
pm2 start ecosystem.config.js --env production

# 5. Save & enable auto-start on reboot
pm2 save
pm2 startup
```

## Commands

| Command | Description |
|---------|-------------|
| `pm2 start ecosystem.config.js` | Start all services |
| `pm2 start ecosystem.config.js --only core-api` | Start single service |
| `pm2 reload all` | Zero-downtime reload |
| `pm2 stop all` | Stop all services |
| `pm2 restart all` | Restart all services |
| `pm2 logs` | View all logs |
| `pm2 logs core-api` | View specific service logs |
| `pm2 monit` | Real-time monitoring dashboard |
| `pm2 status` | Show status table |

## Update Deployment

```bash
cd /opt/euro-smart-server
git pull origin main
yarn install --immutable
yarn generate
yarn build
yarn migrate:prod
pm2 reload ecosystem.config.js --env production
```

## Log Management

```bash
# Install PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```
