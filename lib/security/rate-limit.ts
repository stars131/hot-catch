import { AppError } from "@/lib/errors";
import { getRedisConnection } from "@/lib/jobs/connection";

/**
 * 轻量固定窗口限流,复用仓库既有的 ioredis 连接约定。
 *
 * - 生产环境:必须走 Redis(INCR + EXPIRE)。Redis 不可用时 fail-closed(拒绝请求),
 *   绝不静默放行,也绝不回退到进程内存(多实例下不可靠)。
 * - 开发/测试环境:Redis 可用则用 Redis;不可用时使用显式的进程内存兜底,
 *   仅用于本地自测与单测,不承诺跨实例。
 *
 * 仅用于付费自测这类低频、需要防滥用的动作,不替代业务级幂等。
 */

type RateLimitOptions = {
  /** 限流键(调用方需自带用户/动作前缀,保证按用户隔离)。 */
  key: string;
  /** 窗口内允许的最大次数。 */
  limit: number;
  /** 窗口长度(秒)。 */
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** 距离窗口重置的秒数(尽力而为)。 */
  resetSeconds: number;
};

const memoryBuckets = new Map<string, { count: number; expiresAt: number }>();

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function consumeMemory(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = memoryBuckets.get(options.key);
  if (!bucket || bucket.expiresAt <= now) {
    const expiresAt = now + options.windowSeconds * 1000;
    memoryBuckets.set(options.key, { count: 1, expiresAt });
    return { allowed: true, remaining: options.limit - 1, resetSeconds: options.windowSeconds };
  }
  bucket.count += 1;
  const resetSeconds = Math.max(0, Math.ceil((bucket.expiresAt - now) / 1000));
  if (bucket.count > options.limit) {
    return { allowed: false, remaining: 0, resetSeconds };
  }
  return { allowed: true, remaining: Math.max(0, options.limit - bucket.count), resetSeconds };
}

/**
 * 消费一次限流配额。超限返回 allowed=false;调用方据此抛 RATE_LIMITED。
 * 生产环境 Redis 故障时 fail-closed(allowed=false,resetSeconds 为窗口长度)。
 */
export async function consumeRateLimit(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${options.key}`;
  try {
    const connection = getRedisConnection();
    if (connection.status === "wait") await connection.connect();
    const count = await connection.incr(redisKey);
    if (count === 1) {
      await connection.expire(redisKey, options.windowSeconds);
    }
    const ttl = await connection.ttl(redisKey);
    const resetSeconds = ttl >= 0 ? ttl : options.windowSeconds;
    if (count > options.limit) {
      return { allowed: false, remaining: 0, resetSeconds };
    }
    return {
      allowed: true,
      remaining: Math.max(0, options.limit - count),
      resetSeconds,
    };
  } catch {
    // 生产环境不允许静默放行:Redis 不可用时直接拒绝,保护付费上游。
    if (isProduction()) {
      return { allowed: false, remaining: 0, resetSeconds: options.windowSeconds };
    }
    // 开发/测试:显式进程内存兜底,仅供本地自测。
    return consumeMemory(options);
  }
}

/** 便捷封装:超限直接抛 RATE_LIMITED,附带可读的重试提示。 */
export async function enforceRateLimit(options: RateLimitOptions): Promise<void> {
  const result = await consumeRateLimit(options);
  if (!result.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `操作过于频繁,请在 ${result.resetSeconds} 秒后再试。`,
      429,
    );
  }
}

/** 仅供测试:清空进程内存桶。 */
export function resetRateLimitMemory(): void {
  memoryBuckets.clear();
}
