/**
 * 滑动窗口限流中间件
 *
 * 免费层:      100  请求/分钟，1,000  请求/小时
 * Pro 层:      2000 请求/分钟，50,000 请求/小时
 * Enterprise:  不限
 *
 * 存储：进程内 Map（本地调试用）。
 * 生产环境应换成 Redis / TableStore，保证多实例间共享计数。
 */

const PLANS = {
  free:       { rpm: 100,      rph: 1_000    },
  pro:        { rpm: 2_000,    rph: 50_000   },
  enterprise: { rpm: Infinity, rph: Infinity },
};

// Map<key, { minute: { count, windowStart }, hour: { count, windowStart } }>
const counters = new Map();

function getCounter(key) {
  if (!counters.has(key)) {
    counters.set(key, {
      minute: { count: 0, windowStart: Date.now() },
      hour:   { count: 0, windowStart: Date.now() },
    });
  }
  return counters.get(key);
}

function slideWindow(bucket, windowMs) {
  const now = Date.now();
  if (now - bucket.windowStart >= windowMs) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
}

/**
 * 检查并计数一次请求。
 *
 * @param {string} ownerId  - Worker 归属的用户 ID（路由表的 ownerId 字段）
 * @param {string} [plan]   - 'free' | 'pro' | 'enterprise'，默认 'free'
 * @returns {{ allowed: boolean, plan: string, retryAfter?: number, reason?: string }}
 */
export function checkRateLimit(ownerId, plan = 'free') {
  const limits = PLANS[plan] ?? PLANS.free;

  // enterprise 永远放行
  if (limits.rpm === Infinity) {
    return { allowed: true, plan };
  }

  const key = `${plan}:${ownerId}`;
  const c   = getCounter(key);
  const now = Date.now();

  slideWindow(c.minute, 60_000);
  slideWindow(c.hour,   3_600_000);

  if (c.minute.count >= limits.rpm) {
    const retryAfter = Math.ceil((c.minute.windowStart + 60_000 - now) / 1000);
    return { allowed: false, retryAfter, reason: 'Rate limit exceeded (per minute)', plan };
  }

  if (c.hour.count >= limits.rph) {
    const retryAfter = Math.ceil((c.hour.windowStart + 3_600_000 - now) / 1000);
    return { allowed: false, retryAfter, reason: 'Rate limit exceeded (per hour)', plan };
  }

  c.minute.count++;
  c.hour.count++;
  return { allowed: true, plan };
}

/**
 * 清理过期计数器，防止内存无限增长。
 * 每 10 分钟自动执行，也可手动调用。
 */
export function purgeStaleCounters() {
  const now = Date.now();
  for (const [key, c] of counters) {
    if (now - c.hour.windowStart > 3_600_000 * 2) {
      counters.delete(key);
    }
  }
}

setInterval(purgeStaleCounters, 10 * 60 * 1000).unref?.();
