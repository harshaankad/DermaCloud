import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "../../lib/rate-limit";

describe("rateLimit — sliding window", () => {
  it("allows requests under the limit", () => {
    const key = `test:allow:${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const result = rateLimit(key, { limit: 5, windowMs: 60_000 });
      expect(result.success).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    const key = `test:block:${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      rateLimit(key, { limit: 5, windowMs: 60_000 });
    }
    const result = rateLimit(key, { limit: 5, windowMs: 60_000 });
    expect(result.success).toBe(false);
  });

  it("different keys are independent", () => {
    const ts = Date.now();
    const keyA = `test:keyA:${ts}`;
    const keyB = `test:keyB:${ts}`;

    for (let i = 0; i < 5; i++) rateLimit(keyA, { limit: 5, windowMs: 60_000 });

    // keyA is exhausted but keyB should still be allowed
    expect(rateLimit(keyA, { limit: 5, windowMs: 60_000 }).success).toBe(false);
    expect(rateLimit(keyB, { limit: 5, windowMs: 60_000 }).success).toBe(true);
  });

  it("returns remaining count correctly", () => {
    const key = `test:remaining:${Date.now()}`;
    const r1 = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(r1.remaining).toBe(2);
    const r2 = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(r2.remaining).toBe(1);
    const r3 = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(r3.remaining).toBe(0);
    const r4 = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("expired requests are not counted", async () => {
    const key = `test:expire:${Date.now()}`;
    // Exhaust with a 100ms window
    for (let i = 0; i < 3; i++) rateLimit(key, { limit: 3, windowMs: 100 });
    expect(rateLimit(key, { limit: 3, windowMs: 100 }).success).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 150));

    // Should be allowed again
    expect(rateLimit(key, { limit: 3, windowMs: 100 }).success).toBe(true);
  });
});
