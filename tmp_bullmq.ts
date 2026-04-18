import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redis = new IORedis({
  host: '100.117.220.15',
  port: 6379,
  password: 'Vu31101994@',
  maxRetriesPerRequest: null
});
const q = new Queue('device_controll', { connection: redis });

async function check() {
  const counts = await q.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed');
  console.log('Job counts:', counts);
  const failed = await q.getFailed(0, 5);
  for (const job of failed) {
    console.log(`Failed job ${job.id}:`, job.failedReason);
  }
}
check().finally(() => redis.quit());
