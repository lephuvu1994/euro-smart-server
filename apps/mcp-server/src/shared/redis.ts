import Redis from 'ioredis';
import { Queue } from 'bullmq';

/**
 * Shared Redis + BullMQ singletons for the MCP server.
 *
 * Previously each tool file created its own Redis connection and Queue instance.
 * Centralised here so that the process uses exactly ONE Redis connection
 * and ONE Queue instance for `device_controll`.
 */

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_USERNAME = process.env.REDIS_USERNAME || 'default';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_TLS = process.env.REDIS_ENABLE_TLS === 'true';

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  username: REDIS_USERNAME,
  password: REDIS_PASSWORD,
  tls: REDIS_TLS ? {} : undefined,
  // suppress "MaxListenersExceededWarning" in long-running processes
  maxRetriesPerRequest: null,
});

/**
 * Shared BullMQ Queue — must match `APP_BULLMQ_QUEUES.DEVICE_CONTROL`
 * in core-api to avoid a second connection attempt.
 */
export const deviceQueue = new Queue('device_controll', {
  connection: redis,
});
