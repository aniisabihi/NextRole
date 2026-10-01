import { Queue, type ConnectionOptions } from "bullmq";
import { loadEnv } from "../config/env.js";

export const REMINDER_QUEUE_NAME = "reminders";
const DEFAULT_PREFIX = "bull";
const TEST_PREFIX = "test";

let prefixOverride: string | undefined;
let queue: Queue | undefined;

/** Parse a redis:// or rediss:// URL into BullMQ/ioredis connection options. */
export function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const db = u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: db !== undefined && Number.isInteger(db) ? db : undefined,
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

/**
 * Queue key prefix. Order: explicit override → BULLMQ_PREFIX env → "test" under
 * NODE_ENV=test → "bull". Keeps tests isolated from a running dev worker.
 */
export function getQueuePrefix(): string {
  if (prefixOverride) return prefixOverride;
  const env = loadEnv();
  if (env.BULLMQ_PREFIX) return env.BULLMQ_PREFIX;
  return env.NODE_ENV === "test" ? TEST_PREFIX : DEFAULT_PREFIX;
}

/** Override prefix (tests). Must be called before first getReminderQueue(), or after closeReminderQueue(). */
export function setQueuePrefix(prefix: string | undefined): void {
  prefixOverride = prefix;
}

/**
 * Producer connection: offline queue disabled so enqueue fails fast when Redis
 * is down (callers catch/log; sweep repairs). Worker connections must instead
 * use `maxRetriesPerRequest: null` (see createWorkerConnection).
 */
export function createQueueConnection(): ConnectionOptions {
  return {
    ...parseRedisUrl(loadEnv().REDIS_URL),
    enableOfflineQueue: false,
  };
}

/**
 * Worker connection: BullMQ requires `maxRetriesPerRequest: null` for blocking
 * commands. Separate from the producer connection (offline queue disabled).
 */
export function createWorkerConnection(): ConnectionOptions {
  return {
    ...parseRedisUrl(loadEnv().REDIS_URL),
    maxRetriesPerRequest: null,
  };
}

export function getReminderQueue(): Queue {
  if (!queue) {
    queue = new Queue(REMINDER_QUEUE_NAME, {
      connection: createQueueConnection(),
      prefix: getQueuePrefix(),
    });
    queue.on("error", (err) => {
      console.error("[reminder-queue] redis error:", err.message);
    });
  }
  return queue;
}

export async function closeReminderQueue(): Promise<void> {
  if (!queue) return;
  const q = queue;
  queue = undefined;
  await q.close();
}
