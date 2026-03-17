# VPS Deployment Guide

## Overview

Deploy euro-smart-server directly on a VPS using **systemd** for process management and **Nginx** as reverse proxy.

## Quick Setup

```bash
# Run the automated setup script
chmod +x deploy/vps/setup.sh
sudo ./deploy/vps/setup.sh
```

## Manual Setup

### 1. Install Node.js & Dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo corepack enable && corepack prepare yarn@4.9.2 --activate
```

### 2. Clone & Build

```bash
git clone <your-repo-url> /opt/euro-smart-server
cd /opt/euro-smart-server
cp .env.example .env   # Edit with real values
yarn install --immutable
yarn generate
yarn build
yarn migrate:prod
```

### 3. Install Services

```bash
sudo cp deploy/vps/euro-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now euro-core-api euro-socket-gateway euro-iot-gateway euro-worker-service
```

### 4. Configure Nginx

```bash
sudo cp deploy/vps/nginx.conf /etc/nginx/sites-available/euro-smart
sudo ln -s /etc/nginx/sites-available/euro-smart /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
# Edit server_name in the nginx config to your domain
sudo nginx -t && sudo systemctl reload nginx
```

### 5. SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com -d ws.yourdomain.com
```

## Service Management

| Command | Description |
|---------|-------------|
| `sudo systemctl status euro-core-api` | Check status |
| `sudo systemctl restart euro-core-api` | Restart service |
| `sudo systemctl stop euro-core-api` | Stop service |
| `journalctl -u euro-core-api -f` | View live logs |
| `journalctl -u euro-core-api --since "1 hour ago"` | Recent logs |

## Update Deployment

```bash
cd /opt/euro-smart-server
git pull origin main
yarn install --immutable
yarn generate
yarn build
yarn migrate:prod
sudo systemctl restart euro-core-api euro-socket-gateway euro-iot-gateway euro-worker-service
```
