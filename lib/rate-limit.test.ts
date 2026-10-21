import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRateLimitPerMinute, RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("counts per key within the window and starts over after it", () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.hit("a", 0)).toMatchObject({ ok: true, remaining: 1 });
    expect(limiter.hit("a", 1_000)).toMatchObject({ ok: true, remaining: 0 });
    expect(limiter.hit("a", 2_000)).toMatchObject({ ok: false, remaining: 0, retryAfterS: 58 });
    expect(limiter.hit("b", 2_000).ok).toBe(true);
    expect(limiter.hit("a", 60_000)).toMatchObject({ ok: true, remaining: 1 });
  });

  it("reads API_RATE_LIMIT_PER_MINUTE, 60 by default", () => {
    expect(apiRateLimitPerMinute()).toBe(60);
    vi.stubEnv("API_RATE_LIMIT_PER_MINUTE", "200");
    expect(apiRateLimitPerMinute()).toBe(200);
    vi.stubEnv("API_RATE_LIMIT_PER_MINUTE", "0");
    expect(apiRateLimitPerMinute()).toBe(60);
  });
});
