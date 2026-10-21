/*
 * A fixed-window request counter per key, in memory. Each process counts on
 * its own: one container counts every request, while on a serverless host
 * each instance has its own count.
 */

export type RateLimitResult = { ok: boolean; limit: number; remaining: number; retryAfterS: number };

type Window = { start: number; count: number };

export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(
    readonly limit: number,
    private windowMs = 60_000
  ) {}

  hit(key: string, now = Date.now()): RateLimitResult {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (this.windows.size >= 10_000) this.prune(now);
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    const retryAfterS = Math.max(1, Math.ceil((w.start + this.windowMs - now) / 1000));
    if (w.count >= this.limit) return { ok: false, limit: this.limit, remaining: 0, retryAfterS };
    w.count += 1;
    return { ok: true, limit: this.limit, remaining: this.limit - w.count, retryAfterS };
  }

  private prune(now: number) {
    for (const [key, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(key);
  }
}

/** Requests per minute per key from API_RATE_LIMIT_PER_MINUTE, 60 by default. */
export function apiRateLimitPerMinute(): number {
  const n = Number(process.env.API_RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(n) && n > 0 ? n : 60;
}
