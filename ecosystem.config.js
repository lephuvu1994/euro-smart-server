/**
 * PM2 Ecosystem Configuration
 * ─────────────────────────────
 * Manages all 4 microservices in the euro-smart-server monorepo.
 *
 * Usage:
 *   pm2 start ecosystem.config.js              # Start all services
 *   pm2 start ecosystem.config.js --only core-api
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js              # Zero-downtime reload
 *   pm2 stop all && pm2 delete all              # Stop & cleanup
 *   pm2 save && pm2 startup                     # Auto-start on reboot
 */

module.exports = {
  apps: [
    // ── core-api: Main REST API ──
    {
      name: 'core-api',
      script: 'dist/apps/core-api/main.js',
      instances: 'max', // Cluster mode: 1 instance per CPU core
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 5000, // Wait 5s for graceful shutdown
      listen_timeout: 10000, // Wait 10s for app to be ready
      env: {
        NODE_ENV: 'development',
        HTTP_PORT: 3001,
      },
      env_staging: {
        NODE_ENV: 'staging',
        HTTP_PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        HTTP_PORT: 3001,
      },
    },

    // ── socket-gateway: WebSocket server ──
    {
      name: 'socket-gateway',
      script: 'dist/apps/socket-gateway/main.js',
      instances: 1, // Fork mode — WebSocket state is per-process
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
        SOCKET_GATEWAY_PORT: 3002,
      },
      env_staging: {
        NODE_ENV: 'staging',
        SOCKET_GATEWAY_PORT: 3002,
      },
      env_production: {
        NODE_ENV: 'production',
        SOCKET_GATEWAY_PORT: 3002,
      },
    },

    // ── iot-gateway: MQTT bridge ──
    {
      name: 'iot-gateway',
      script: 'dist/apps/iot-gateway/main.js',
      instances: 1, // Fork mode — single MQTT connection
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
        IOT_GATEWAY_PORT: 3003,
      },
      env_staging: {
        NODE_ENV: 'staging',
        IOT_GATEWAY_PORT: 3003,
      },
      env_production: {
        NODE_ENV: 'production',
        IOT_GATEWAY_PORT: 3003,
      },
    },

    // ── worker-service: BullMQ job processor ──
    {
      name: 'worker-service',
      script: 'dist/apps/worker-service/main.js',
      instances: 1, // Fork mode — single BullMQ worker
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      kill_timeout: 10000, // Longer timeout for jobs to complete
      env: {
        NODE_ENV: 'development',
        WORKER_SERVICE_PORT: 3004,
      },
      env_staging: {
        NODE_ENV: 'staging',
        WORKER_SERVICE_PORT: 3004,
      },
      env_production: {
        NODE_ENV: 'production',
        WORKER_SERVICE_PORT: 3004,
      },
    },
  ],
};
